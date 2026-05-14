/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Visit Service — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/services/visitService.js
 *  🔧 Version: 2.0 (CRITICAL SCHEMA FIX)
 *
 *  🚨 WHAT WAS BROKEN IN v1.0:
 *
 *  v1.0 queried Visit by a `patientId` field that does NOT EXIST in the
 *  schema. The real schema (per patient360_db_final.js and Visit.js) uses:
 *      patientPersonId  → adult patient (refs Person)
 *      patientChildId   → child patient (refs Children)
 *
 *  This caused EVERY service method to return empty results silently,
 *  which is the suspected root cause of the empty Patients/Doctors/Children
 *  pages in the Admin Dashboard.
 *
 *  Other v1.0 bugs fixed in v2.0:
 *    ✓ `visitTime` field — doesn't exist; only `visitDate` (Date) exists
 *    ✓ `labTests` array on Visit — doesn't exist; LabTest is a separate collection
 *    ✓ `status: 'scheduled'` — wrong enum; valid values are in_progress/completed/cancelled
 *    ✓ Doctor populate path was wrong (.lastName instead of .personId.lastName)
 *
 *  📚 Schema reference (Visit.js):
 *    Required:  visitType, visitDate, chiefComplaint
 *    XOR:       patientPersonId  OR  patientChildId  (enforced by pre-validate)
 *    Provider:  doctorId  OR  dentistId
 *    Status:    'in_progress' | 'completed' | 'cancelled'
 *    Type:      'regular' | 'follow_up' | 'emergency' | 'consultation' | 'dental' | 'lab_only'
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { Visit, LabTest } = require('../models');

// ============================================================================
// HELPER — Resolve patient reference (adult or child)
// ============================================================================

/**
 * Normalizes a patient identifier into a Mongoose query filter that uses
 * the CORRECT field names (patientPersonId or patientChildId).
 *
 * @param {string|object} patient
 *   Either:
 *     - A plain ObjectId/string → caller doesn't know type, we try both
 *     - { personId: ObjectId }   → explicit adult
 *     - { childId:  ObjectId }   → explicit child
 *
 * @returns {object} MongoDB filter
 */
function buildPatientFilter(patient) {
  if (!patient) return {};

  // Explicit shape: { personId } or { childId }
  if (typeof patient === 'object' && !patient._bsontype && !patient.toString) {
    if (patient.personId) return { patientPersonId: patient.personId };
    if (patient.childId)  return { patientChildId: patient.childId };
  }

  // Plain ID — caller doesn't know if adult or child. Match either.
  const id = patient.toString();
  return {
    $or: [
      { patientPersonId: id },
      { patientChildId:  id },
    ],
  };
}

// ============================================================================
// 1. GET PATIENT VISITS — paginated + filtered
// ============================================================================

/**
 * Fetches visits for a given patient with optional filters.
 *
 * @param {string|object} patient — ID or { personId } / { childId }
 * @param {object} filters
 *   - startDate, endDate         (Date strings)
 *   - doctorId                   (ObjectId)
 *   - searchTerm                 (free text across complaint/diagnosis/notes)
 *   - status                     ('in_progress' | 'completed' | 'cancelled')
 *   - visitType                  (regular/follow_up/emergency/consultation/dental/lab_only)
 *   - page, limit                (pagination — default page=1, limit=50)
 */
exports.getPatientVisits = async (patient, filters = {}) => {
  try {
    const {
      startDate, endDate, doctorId, searchTerm,
      page = 1, limit = 50, status, visitType,
    } = filters;

    // ── Build query using CORRECT field names ──────────────────────────
    const query = buildPatientFilter(patient);

    if (startDate || endDate) {
      query.visitDate = {};
      if (startDate) query.visitDate.$gte = new Date(startDate);
      if (endDate)   query.visitDate.$lte = new Date(endDate);
    }

    if (doctorId)  query.doctorId  = doctorId;
    if (status)    query.status    = status;
    if (visitType) query.visitType = visitType;

    if (searchTerm) {
      query.$or = [
        { diagnosis:      { $regex: searchTerm, $options: 'i' } },
        { chiefComplaint: { $regex: searchTerm, $options: 'i' } },
        { doctorNotes:    { $regex: searchTerm, $options: 'i' } },
      ];
    }

    // ── Execute query ──────────────────────────────────────────────────
    const visits = await Visit.find(query)
      .populate({
        path: 'doctorId',
        select: 'personId specialization medicalLicenseNumber',
        populate: { path: 'personId', select: 'firstName lastName' },
      })
      .populate({
        path: 'dentistId',
        select: 'personId specialization dentalLicenseNumber',
        populate: { path: 'personId', select: 'firstName lastName' },
      })
      .sort({ visitDate: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    const count = await Visit.countDocuments(query);

    const formattedVisits = await Promise.all(
      visits.map(visit => formatVisitData(visit, false)),
    );

    return {
      success: true,
      visits: formattedVisits,
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(count / Number(limit)),
      },
    };
  } catch (error) {
    console.error('❌ visitService.getPatientVisits error:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء جلب الزيارات',
    };
  }
};

// ============================================================================
// 2. GET VISIT BY ID — with full details + linked lab tests
// ============================================================================

/**
 * Fetches a single visit with all relations.
 *
 * @param {string} visitId
 * @param {string|object} patient — used for ownership validation
 */
exports.getVisitById = async (visitId, patient) => {
  try {
    const patientFilter = buildPatientFilter(patient);

    const visit = await Visit.findOne({ _id: visitId, ...patientFilter })
      .populate({
        path: 'doctorId',
        select: 'personId specialization medicalLicenseNumber yearsOfExperience',
        populate: { path: 'personId', select: 'firstName lastName phoneNumber' },
      })
      .populate({
        path: 'dentistId',
        select: 'personId specialization dentalLicenseNumber yearsOfExperience',
        populate: { path: 'personId', select: 'firstName lastName phoneNumber' },
      })
      .populate('hospitalId', 'name arabicName')
      .lean();

    if (!visit) {
      return {
        success: false,
        message: 'الزيارة غير موجودة',
      };
    }

    const formatted = await formatVisitData(visit, true);

    return {
      success: true,
      visit: formatted,
    };
  } catch (error) {
    console.error('❌ visitService.getVisitById error:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء جلب تفاصيل الزيارة',
    };
  }
};

// ============================================================================
// 3. GET VISIT STATS — for patient dashboard charts
// ============================================================================

exports.getVisitStats = async (patient) => {
  try {
    const patientFilter = buildPatientFilter(patient);
    const visits = await Visit.find(patientFilter).lean();

    if (visits.length === 0) {
      return {
        success: true,
        stats: {
          totalVisits: 0,
          completedVisits: 0,
          inProgressVisits: 0,
          cancelledVisits: 0,
          lastVisit: null,
          nextFollowUp: null,
          visitsByStatus: {},
          visitsByMonth: calculateVisitsByMonth([]),
          visitsByType: {},
          commonDiagnoses: [],
          doctorsVisited: 0,
        },
      };
    }

    const completedVisits  = visits.filter(v => v.status === 'completed');
    const inProgressVisits = visits.filter(v => v.status === 'in_progress');
    const cancelledVisits  = visits.filter(v => v.status === 'cancelled');

    const stats = {
      totalVisits:      visits.length,
      completedVisits:  completedVisits.length,
      inProgressVisits: inProgressVisits.length,
      cancelledVisits:  cancelledVisits.length,

      // Most recent completed visit
      lastVisit: completedVisits
        .sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate))[0]?.visitDate || null,

      // Next scheduled follow-up (from completed visits with followUpDate set)
      nextFollowUp: visits
        .filter(v => v.followUpDate && new Date(v.followUpDate) > new Date())
        .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))[0]?.followUpDate || null,

      // Visits by status
      visitsByStatus: {
        in_progress: inProgressVisits.length,
        completed:   completedVisits.length,
        cancelled:   cancelledVisits.length,
      },

      // Visits by month (last 12 months)
      visitsByMonth: calculateVisitsByMonth(visits),

      // Visits by type
      visitsByType: visits.reduce((acc, v) => {
        acc[v.visitType] = (acc[v.visitType] || 0) + 1;
        return acc;
      }, {}),

      // Common diagnoses
      commonDiagnoses: getCommonDiagnoses(visits),

      // Unique doctors visited
      doctorsVisited: [...new Set(
        visits.map(v => v.doctorId?.toString()).filter(Boolean),
      )].length,
    };

    return {
      success: true,
      stats,
    };
  } catch (error) {
    console.error('❌ visitService.getVisitStats error:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء حساب إحصائيات الزيارات',
    };
  }
};

// ============================================================================
// 4. GET VISITS BY DOCTOR — grouped view
// ============================================================================

exports.getVisitsByDoctor = async (patient) => {
  try {
    const patientFilter = buildPatientFilter(patient);

    const visits = await Visit.find(patientFilter)
      .populate({
        path: 'doctorId',
        select: 'personId specialization',
        populate: { path: 'personId', select: 'firstName lastName' },
      })
      .sort({ visitDate: -1 })
      .lean();

    const visitsByDoctor = {};

    for (const visit of visits) {
      if (!visit.doctorId) continue;

      const doctorId = visit.doctorId._id.toString();
      const doctorName = visit.doctorId.personId
        ? `د. ${visit.doctorId.personId.firstName} ${visit.doctorId.personId.lastName}`
        : 'طبيب غير محدد';

      if (!visitsByDoctor[doctorId]) {
        visitsByDoctor[doctorId] = {
          doctorId,
          doctorName,
          specialization: visit.doctorId.specialization,
          visits: [],
        };
      }

      // eslint-disable-next-line no-await-in-loop
      visitsByDoctor[doctorId].visits.push(await formatVisitData(visit, false));
    }

    const groupedVisits = Object.values(visitsByDoctor)
      .sort((a, b) => b.visits.length - a.visits.length);

    return {
      success: true,
      visitsByDoctor: groupedVisits,
    };
  } catch (error) {
    console.error('❌ visitService.getVisitsByDoctor error:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء تجميع الزيارات حسب الطبيب',
    };
  }
};

// ============================================================================
// HELPER — Format a single visit document for frontend consumption
// ============================================================================

/**
 * Shapes a raw visit document into the frontend's expected format.
 *
 * @param {object} visit                 — Mongoose .lean() result
 * @param {boolean} includeFullDetails  — true = embed medications + linked lab tests
 */
async function formatVisitData(visit, includeFullDetails = false) {
  const formatted = {
    _id:             visit._id,
    visitDate:       visit.visitDate,
    visitType:       visit.visitType,
    status:          visit.status,
    chiefComplaint:  visit.chiefComplaint,
    diagnosis:       visit.diagnosis,

    // Provider (doctor OR dentist)
    doctorId: visit.doctorId?._id || visit.doctorId || null,
    doctorName: visit.doctorId?.personId
      ? `د. ${visit.doctorId.personId.firstName} ${visit.doctorId.personId.lastName}`
      : (visit.dentistId?.personId
          ? `د. ${visit.dentistId.personId.firstName} ${visit.dentistId.personId.lastName}`
          : 'غير محدد'),
    specialization: visit.doctorId?.specialization
                  || visit.dentistId?.specialization
                  || 'غير محدد',

    // Embedded data counts
    medicationsCount: visit.prescribedMedications?.length || 0,
    hasECGAnalysis:   !!visit.ecgAnalysis,
    hasVitalSigns:    !!visit.vitalSigns,
    hasPhoto:         !!visit.visitPhotoUrl,

    createdAt: visit.createdAt,
    updatedAt: visit.updatedAt,
  };

  if (includeFullDetails) {
    formatted.prescribedMedications = visit.prescribedMedications || [];
    formatted.vitalSigns             = visit.vitalSigns || null;
    formatted.doctorNotes            = visit.doctorNotes || null;
    formatted.followUpDate           = visit.followUpDate || null;
    formatted.followUpNotes          = visit.followUpNotes || null;
    formatted.visitPhotoUrl          = visit.visitPhotoUrl || null;
    formatted.ecgAnalysis            = visit.ecgAnalysis || null;
    formatted.paymentStatus          = visit.paymentStatus;

    // ── Lab tests are in a SEPARATE collection, query by visitId ───────
    try {
      const labTests = await LabTest.find({ visitId: visit._id })
        .select('testNumber testsOrdered status resultPdfUrl completedAt isCritical')
        .lean();
      formatted.labTests      = labTests;
      formatted.labTestsCount = labTests.length;
    } catch (e) {
      formatted.labTests      = [];
      formatted.labTestsCount = 0;
    }

    formatted.doctorInfo = visit.doctorId ? {
      medicalLicenseNumber: visit.doctorId.medicalLicenseNumber,
      yearsOfExperience:    visit.doctorId.yearsOfExperience,
      phoneNumber:          visit.doctorId.personId?.phoneNumber,
    } : null;
  }

  return formatted;
}

// ============================================================================
// HELPER — Calculate visits by month for the last 12 months
// ============================================================================

function calculateVisitsByMonth(visits) {
  const now = new Date();
  const months = [];

  for (let i = 11; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.push({ month: monthKey, count: 0 });
  }

  visits.forEach((visit) => {
    if (!visit.visitDate) return;
    const visitDate = new Date(visit.visitDate);
    const monthKey = `${visitDate.getFullYear()}-${String(visitDate.getMonth() + 1).padStart(2, '0')}`;
    const monthData = months.find(m => m.month === monthKey);
    if (monthData) monthData.count += 1;
  });

  return months;
}

// ============================================================================
// HELPER — Top 10 most common diagnoses
// ============================================================================

function getCommonDiagnoses(visits) {
  const diagnosisCounts = {};

  visits
    .filter(v => v.diagnosis && v.status === 'completed')
    .forEach((visit) => {
      const diagnosis = visit.diagnosis.trim();
      diagnosisCounts[diagnosis] = (diagnosisCounts[diagnosis] || 0) + 1;
    });

  return Object.entries(diagnosisCounts)
    .map(([diagnosis, count]) => ({ diagnosis, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// Export helper for use by other services
exports.buildPatientFilter = buildPatientFilter;
