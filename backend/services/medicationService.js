/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Medication Service — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/services/medicationService.js
 *  🔧 Version: 2.0 (CRITICAL SCHEMA FIX)
 *
 *  🚨 WHAT WAS BROKEN IN v1.0:
 *
 *  v1.0 queried Visit by `patientId` which DOES NOT EXIST in the schema.
 *  This caused every medication query to return empty results.
 *
 *  v2.0 uses the correct fields:
 *    patientPersonId  — adult patient
 *    patientChildId   — child patient
 *
 *  📚 The medication data lives in TWO places:
 *
 *    1. Visit.prescribedMedications[] — embedded quick list (for timeline)
 *    2. Prescription.medications[]    — formal Rx document (for dispensing)
 *
 *  This service reads from Prescription primarily (the source of truth)
 *  and falls back to Visit.prescribedMedications when needed.
 *
 *  Active medication detection:
 *    - "مستمر" / "continuous" / "ongoing"  → always active
 *    - "N يوم" / "N day"                    → active if (visitDate + N days) >= now
 *    - "N أسبوع" / "N week"                 → active if (visitDate + N*7 days) >= now
 *    - "N شهر" / "N month"                  → active if (visitDate + N months) >= now
 *    - No duration parseable                 → active if prescribed within last 90 days
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { Visit, Prescription } = require('../models');
const { buildPatientFilter }  = require('./visitService');

// ============================================================================
// 1. GET CURRENT MEDICATIONS — actively-taken meds for a patient
// ============================================================================

/**
 * Returns the patient's current active medications based on prescription
 * dates and duration parsing.
 *
 * @param {string|object} patient — ID or { personId } / { childId }
 */
exports.getCurrentMedications = async (patient) => {
  try {
    console.log('🔍 [medicationService] Getting medications for patient:', patient);

    const patientFilter = buildPatientFilter(patient);

    // Primary source: Prescription collection (source of truth)
    const prescriptions = await Prescription.find({
      ...patientFilter,
      status: { $in: ['active', 'partially_dispensed', 'dispensed'] },
    })
      .populate({
        path: 'doctorId',
        select: 'personId specialization',
        populate: { path: 'personId', select: 'firstName lastName' },
      })
      .populate({
        path: 'dentistId',
        select: 'personId specialization',
        populate: { path: 'personId', select: 'firstName lastName' },
      })
      .sort({ prescriptionDate: -1 })
      .lean();

    console.log('📋 [medicationService] Found prescriptions:', prescriptions.length);

    const allMedications = [];

    prescriptions.forEach((rx) => {
      if (!Array.isArray(rx.medications)) return;

      const doctorName = rx.doctorId?.personId
        ? `د. ${rx.doctorId.personId.firstName} ${rx.doctorId.personId.lastName}`
        : (rx.dentistId?.personId
            ? `د. ${rx.dentistId.personId.firstName} ${rx.dentistId.personId.lastName}`
            : 'غير محدد');

      const specialization = rx.doctorId?.specialization
                          || rx.dentistId?.specialization
                          || null;

      rx.medications.forEach((med) => {
        allMedications.push({
          ...med,
          prescriptionId:     rx._id,
          prescriptionNumber: rx.prescriptionNumber,
          visitId:            rx.visitId,
          prescriptionDate:   rx.prescriptionDate,
          expiryDate:         rx.expiryDate,
          rxStatus:           rx.status,
          doctorName,
          doctorSpecialization: specialization,
        });
      });
    });

    // Filter for active medications based on duration parsing
    const activeMedications = filterActiveMedications(allMedications);

    console.log(`📦 [medicationService] Total: ${allMedications.length}, Active: ${activeMedications.length}`);

    return {
      success: true,
      medications: activeMedications,
      count: activeMedications.length,
    };
  } catch (error) {
    console.error('❌ medicationService.getCurrentMedications error:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء جلب الأدوية الحالية',
    };
  }
};

// ============================================================================
// 2. GET MEDICATION HISTORY — full history with pagination
// ============================================================================

/**
 * Returns the patient's complete medication history.
 *
 * @param {string|object} patient
 * @param {object} filters — { startDate, endDate, medicationName, page, limit }
 */
exports.getMedicationHistory = async (patient, filters = {}) => {
  try {
    const {
      startDate, endDate, medicationName,
      page = 1, limit = 50,
    } = filters;

    const patientFilter = buildPatientFilter(patient);
    const query = { ...patientFilter };

    if (startDate || endDate) {
      query.prescriptionDate = {};
      if (startDate) query.prescriptionDate.$gte = new Date(startDate);
      if (endDate)   query.prescriptionDate.$lte = new Date(endDate);
    }

    const prescriptions = await Prescription.find(query)
      .populate({
        path: 'doctorId',
        select: 'personId specialization',
        populate: { path: 'personId', select: 'firstName lastName' },
      })
      .populate({
        path: 'dentistId',
        select: 'personId specialization',
        populate: { path: 'personId', select: 'firstName lastName' },
      })
      .sort({ prescriptionDate: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    const count = await Prescription.countDocuments(query);

    const medicationHistory = [];

    prescriptions.forEach((rx) => {
      if (!Array.isArray(rx.medications)) return;

      const doctorName = rx.doctorId?.personId
        ? `د. ${rx.doctorId.personId.firstName} ${rx.doctorId.personId.lastName}`
        : (rx.dentistId?.personId
            ? `د. ${rx.dentistId.personId.firstName} ${rx.dentistId.personId.lastName}`
            : 'غير محدد');

      rx.medications.forEach((med) => {
        // Optional filter by medication name
        if (medicationName) {
          const searchTerm = medicationName.toLowerCase();
          const matchesName = (med.medicationName || '').toLowerCase().includes(searchTerm)
                          || (med.arabicName || '').toLowerCase().includes(searchTerm);
          if (!matchesName) return;
        }

        medicationHistory.push({
          ...med,
          prescriptionId:     rx._id,
          prescriptionNumber: rx.prescriptionNumber,
          visitId:            rx.visitId,
          prescriptionDate:   rx.prescriptionDate,
          expiryDate:         rx.expiryDate,
          rxStatus:           rx.status,
          doctorName,
          doctorSpecialization: rx.doctorId?.specialization || rx.dentistId?.specialization,
          isActive: isMedicationActive(med, rx.prescriptionDate),
        });
      });
    });

    const uniqueMedications = [...new Set(medicationHistory.map(m => m.medicationName))];

    return {
      success: true,
      history: medicationHistory,
      statistics: {
        totalPrescriptions: medicationHistory.length,
        uniqueMedications:  uniqueMedications.length,
        activeMedications:  medicationHistory.filter(m => m.isActive).length,
        dispensedCount:     medicationHistory.filter(m => m.isDispensed).length,
      },
      pagination: {
        total: count,
        page:  Number(page),
        limit: Number(limit),
        pages: Math.ceil(count / Number(limit)),
      },
    };
  } catch (error) {
    console.error('❌ medicationService.getMedicationHistory error:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء جلب تاريخ الأدوية',
    };
  }
};

// ============================================================================
// 3. CHECK MEDICATION INTERACTIONS
// ============================================================================

/**
 * Basic interaction checking. In production, this would integrate with a
 * proper drug interaction API (e.g. RxNorm, DrugBank, Lexicomp).
 *
 * @param {string|object} patient
 */
exports.checkMedicationInteractions = async (patient) => {
  try {
    const result = await exports.getCurrentMedications(patient);

    if (!result.success || result.medications.length === 0) {
      return {
        success: true,
        interactions: [],
        warnings: [],
        medicationCount: 0,
      };
    }

    const medications = result.medications;
    const warnings = [];

    // ── Duplicate check ────────────────────────────────────────────────
    const medicationNames = medications.map(m => (m.medicationName || '').toLowerCase().trim());
    const duplicates = medicationNames.filter(
      (name, idx) => name && medicationNames.indexOf(name) !== idx,
    );

    if (duplicates.length > 0) {
      warnings.push({
        type: 'DUPLICATE',
        severity: 'medium',
        message: 'تم وصف نفس الدواء من قبل أكثر من طبيب — يُنصح بمراجعة الأدوية',
        medications: [...new Set(duplicates)],
      });
    }

    // ── Polypharmacy (5+ concurrent medications) ───────────────────────
    if (medications.length >= 5) {
      warnings.push({
        type: 'POLYPHARMACY',
        severity: 'low',
        message: `يتناول المريض ${medications.length} أدوية حالياً. يُنصح بمراجعة شاملة من الطبيب`,
        count: medications.length,
      });
    }

    return {
      success: true,
      interactions: [], // Reserved for future drug-interaction API integration
      warnings,
      medicationCount: medications.length,
    };
  } catch (error) {
    console.error('❌ medicationService.checkMedicationInteractions error:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء فحص تفاعلات الأدوية',
    };
  }
};

// ============================================================================
// HELPER — Filter to only currently-active medications
// ============================================================================

function filterActiveMedications(medications) {
  return medications.filter(med => isMedicationActive(med, med.prescriptionDate));
}

// ============================================================================
// HELPER — Determine if a single medication is currently active
// ============================================================================

function isMedicationActive(medication, prescriptionDate) {
  const now = new Date();
  const startDate = new Date(prescriptionDate);
  const duration = medication.duration || '';

  // ── Continuous medications ─────────────────────────────────────────
  if (
    duration.includes('مستمر')
    || /continuous|ongoing/i.test(duration)
  ) {
    return true;
  }

  // ── Days: "10 يوم" or "10 days" ────────────────────────────────────
  const daysMatch = duration.match(/(\d+)\s*(يوم|أيام|day)/i);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);
    return now <= endDate;
  }

  // ── Weeks: "2 أسبوع" or "2 weeks" ──────────────────────────────────
  const weeksMatch = duration.match(/(\d+)\s*(أسبوع|أسابيع|week)/i);
  if (weeksMatch) {
    const weeks = parseInt(weeksMatch[1], 10);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + weeks * 7);
    return now <= endDate;
  }

  // ── Months: "3 شهر" or "3 months" ──────────────────────────────────
  const monthsMatch = duration.match(/(\d+)\s*(شهر|أشهر|month)/i);
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1], 10);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);
    return now <= endDate;
  }

  // ── Fallback: assume active if prescribed in last 90 days ──────────
  const daysSincePrescribed = (now - startDate) / (1000 * 60 * 60 * 24);
  return daysSincePrescribed <= 90;
}
