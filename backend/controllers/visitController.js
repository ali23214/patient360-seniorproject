/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Visit Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Visit (clinical encounter) endpoints mounted under /api/visits.
 *
 *  Patient resolution:
 *    The frontend can identify the patient by either:
 *      - patientNationalId (11 digits) → looks up Person/Children
 *      - patientPersonId / patientChildId (ObjectId) → direct
 *      - childRegistrationNumber (CRN-...) → looks up Children
 *    The controller normalizes whatever is sent into the dual-ref pattern.
 *
 *  Functions:
 *    1. createVisit       — Create new clinical visit
 *    2. getPatientVisits  — List visits for one patient
 *    3. getDoctorVisits   — List visits for one doctor
 *    4. getVisitById      — Single visit detail
 *    5. updateVisit       — Update visit fields (with ownership check)
 *    6. completeVisit     — Mark visit completed + update patient stats
 *    7. deleteVisit       — Soft-delete (admin only)
 *
 *  Conventions kept from existing code:
 *    - Arabic error messages, emoji-marked console logs
 *    - { success, message, [data] } response shape
 *    - Try/catch in every async function
 * ═══════════════════════════════════════════════════════════════════════════
 */

const {
  Visit, Person, Children, Patient, Doctor, Dentist, AuditLog, LabTest
} = require('../models');
const { createNotification } = require('./notificationController');

// ============================================================================
// HELPER: Resolve patient identifier into { patientPersonId | patientChildId }
// ============================================================================

/**
 * The frontend sends one of: patientNationalId, patientPersonId,
 * patientChildId, childRegistrationNumber. Normalize into the dual-ref shape.
 *
 * @returns {{ patientPersonId?: ObjectId, patientChildId?: ObjectId } | null}
 */
async function resolvePatientRef(body) {
  const {
    patientNationalId,
    patientPersonId,
    patientChildId,
    childRegistrationNumber
  } = body;

  // Direct ObjectId provided
  if (patientPersonId) {
    return { patientPersonId };
  }
  if (patientChildId) {
    return { patientChildId };
  }

  // Lookup by CRN
  if (childRegistrationNumber) {
    const child = await Children.findOne({ childRegistrationNumber }).lean();
    return child ? { patientChildId: child._id } : null;
  }

  // Lookup by national ID — could be adult OR child (with assigned nationalId)
  if (patientNationalId) {
    // Safety net: if a CRN slipped into patientNationalId, resolve it as a CRN
    // rather than searching national-ID fields (which won't match).
    if (/^CRN-/i.test(String(patientNationalId).trim())) {
      const crnChild = await Children.findOne({
        childRegistrationNumber: String(patientNationalId).trim(),
      }).lean();
      return crnChild ? { patientChildId: crnChild._id } : null;
    }

    const adult = await Person.findOne({ nationalId: patientNationalId }).lean();
    if (adult) return { patientPersonId: adult._id };

    const child = await Children.findOne({ nationalId: patientNationalId }).lean();
    if (child) return { patientChildId: child._id };
  }

  return null;
}

// ============================================================================
// 1. CREATE VISIT
// ============================================================================

/**
 * @route   POST /api/visits
 * @desc    Create a new clinical visit
 * @access  Private (doctor, dentist)
 *
 * Body:
 *   visitType (required)         — regular | follow_up | emergency | consultation | dental | lab_only
 *   chiefComplaint (required)    — patient's main complaint
 *   patient identifier (one of)  — patientNationalId | patientPersonId | patientChildId | childRegistrationNumber
 *   doctorId / dentistId         — provider (one required)
 *   diagnosis                    — optional
 *   vitalSigns                   — optional structured object (9 fields)
 *   prescribedMedications        — optional array
 *   doctorNotes                  — optional
 *   followUpDate, followUpNotes  — optional
 *   visitPhotoUrl                — optional (X-ray, scan)
 *   appointmentId                — optional link to source appointment
 *   hospitalId                   — optional
 */
exports.createVisit = async (req, res) => {
  console.log('🔵 ========== CREATE VISIT ==========');

  try {
    // ── HELPERS ──────────────────────────────────────────────────────────
    // Multipart form data can only carry strings, so nested objects and
    // arrays arrive as JSON-encoded strings. Parse them before validating.
    const parseIfJSON = (value) => {
      if (value == null || value === '') return undefined;
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    };

    // Mongoose min/max validators reject empty strings. Strip empty-string
    // keys from optional sub-documents so blank fields don't break the save.
    const stripEmpty = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      const cleaned = {};
      Object.entries(obj).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) cleaned[k] = v;
      });
      return Object.keys(cleaned).length > 0 ? cleaned : undefined;
    };

    // ── DESTRUCTURE BODY ─────────────────────────────────────────────────
    const {
      visitType,
      chiefComplaint,
      doctorId,
      dentistId,
      hospitalId,
      diagnosis,
      doctorNotes,
      followUpDate,
      followUpTime,
      followUpNotes,
      visitPhotoUrl,
      appointmentId
    } = req.body;

    // Fields that may arrive as JSON strings (multipart)
    const vitalSigns = stripEmpty(parseIfJSON(req.body.vitalSigns));
    const prescribedMedications = parseIfJSON(req.body.prescribedMedications);
    const ecgAnalysis = parseIfJSON(req.body.ecgAnalysis);

    // ── 1. AUTO-RESOLVE PROVIDER ID FROM JWT ─────────────────────────────
    // The caller is already authenticated, so we trust the token to tell us
    // who the provider is instead of asking the frontend to re-declare it.
    let resolvedDoctorId = doctorId;
    let resolvedDentistId = dentistId;

    if (!resolvedDoctorId && !resolvedDentistId && req.user?.personId) {
      if (req.user.roles?.includes('doctor')) {
        const doctor = await Doctor.findOne({ personId: req.user.personId }).lean();
        if (doctor) resolvedDoctorId = doctor._id;
      } else if (req.user.roles?.includes('dentist')) {
        try {
          const Dentist = require('../models/Dentist');
          const dentist = await Dentist.findOne({ personId: req.user.personId }).lean();
          if (dentist) resolvedDentistId = dentist._id;
        } catch (e) {
          console.warn('⚠️  Dentist model not available');
        }
      }
    }

    // ── 2. VALIDATE REQUIRED FIELDS ──────────────────────────────────────
    if (!visitType) {
      return res.status(400).json({
        success: false,
        message: 'نوع الزيارة مطلوب'
      });
    }
    if (!chiefComplaint) {
      return res.status(400).json({
        success: false,
        message: 'الشكوى الرئيسية مطلوبة'
      });
    }
    if (!resolvedDoctorId && !resolvedDentistId) {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد الطبيب أو طبيب الأسنان'
      });
    }

    // ── 3. RESOLVE PATIENT REFERENCE ─────────────────────────────────────
    // The patient ID can arrive several ways:
    //   • req.params.nationalId  — /patient/:nationalId/visit (doctor dashboard)
    //       BUT for children this param actually carries a CRN
    //       (e.g. CRN-20260514-00001), NOT an 11-digit national ID.
    //   • req.body.patientNationalId — admin-created visits
    //   • req.body.childRegistrationNumber — pediatric visits
    //
    // We inspect the incoming identifier: if it looks like a CRN we route it
    // to childRegistrationNumber so resolvePatientRef looks it up in the
    // Children collection by the right field. Otherwise it's treated as a
    // national ID. This is why adult visits worked but child visits failed:
    // a CRN was being searched as Children.nationalId (which is empty for a
    // child who hasn't received their national ID yet).
    const rawIdentifier =
      req.body.patientNationalId
      || req.body.nationalId
      || req.params.nationalId
      || req.params.identifier
      || '';

    const looksLikeCRN = /^CRN-/i.test(String(rawIdentifier).trim());

    const resolverInput = {
      ...req.body,
      // Preserve any CRN the client already sent; otherwise derive from param.
      childRegistrationNumber:
        req.body.childRegistrationNumber
        || (looksLikeCRN ? String(rawIdentifier).trim() : undefined),
      // Only treat the identifier as a national ID when it's NOT a CRN.
      patientNationalId: looksLikeCRN ? undefined : rawIdentifier,
    };

    const patientRef = await resolvePatientRef(resolverInput);
    if (!patientRef) {
      console.log('❌ Patient not found from any identifier');
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على المريض'
      });
    }
    console.log('✅ Patient resolved:', patientRef);

    // ── 3.5 VALIDATE FOLLOW-UP DATE + TIME + CONFLICT CHECK ──────────────
    // If the doctor set a follow-up date (and now optionally a time), we'll
    // auto-generate an appointment for it (so it shows on the calendar).
    // Before creating the visit, make sure that date/time doesn't collide
    // with an existing appointment on this provider's schedule — reject
    // the whole save if it does so we don't end up with a stranded visit
    // and no follow-up.
    //
    // The frontend now sends followUpTime as well, so each doctor can pick
    // when in the day the follow-up should happen instead of every follow-up
    // landing at 09:00 (which caused calendar pile-ups). The default below
    // is kept as a safety net for backward compatibility with older clients.
    const FOLLOWUP_DEFAULT_TIME = '09:00';
    let followUpAppointmentDate = null;
    let resolvedFollowUpTime = null;

    if (followUpDate) {
      const followUpObj = new Date(followUpDate);
      if (isNaN(followUpObj.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'تاريخ المتابعة غير صالح'
        });
      }

      // Normalize to start of day — the actual time-of-day is carried
      // separately on appointmentTime (HH:MM string).
      followUpObj.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (followUpObj < today) {
        return res.status(400).json({
          success: false,
          message: 'تاريخ المتابعة لا يمكن أن يكون في الماضي'
        });
      }

      // ── Resolve & validate follow-up time ─────────────────────────────
      // Accept what the frontend sent, falling back to 09:00 if missing.
      // Format must be strict HH:MM (24-hour) to match the Appointment
      // schema's appointmentTime validator.
      resolvedFollowUpTime = (followUpTime && typeof followUpTime === 'string')
        ? followUpTime.trim()
        : FOLLOWUP_DEFAULT_TIME;

      if (!/^\d{2}:\d{2}$/.test(resolvedFollowUpTime)) {
        return res.status(400).json({
          success: false,
          message: 'وقت المتابعة يجب أن يكون بصيغة HH:MM'
        });
      }

      // Numeric sanity check — block "25:99" type values that match the
      // regex but aren't real times.
      const [hh, mm] = resolvedFollowUpTime.split(':').map(Number);
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        return res.status(400).json({
          success: false,
          message: 'وقت المتابعة غير صالح'
        });
      }

      // If the follow-up is for today, the time must be in the future.
      // (followUpObj === today's midnight means same-day.)
      if (followUpObj.getTime() === today.getTime()) {
        const now = new Date();
        const followUpDateTime = new Date(followUpObj);
        followUpDateTime.setHours(hh, mm, 0, 0);
        if (followUpDateTime <= now) {
          return res.status(400).json({
            success: false,
            message: 'وقت المتابعة لا يمكن أن يكون في الماضي'
          });
        }
      }

      // ── Conflict check on the same provider's schedule ────────────────
      const Appointment = require('../models/Appointment');
      const conflictQuery = {
        appointmentDate: followUpObj,
        appointmentTime: resolvedFollowUpTime,
        status: { $in: ['scheduled', 'confirmed', 'checked_in', 'in_progress'] }
      };
      if (resolvedDoctorId) conflictQuery.doctorId = resolvedDoctorId;
      if (resolvedDentistId) conflictQuery.dentistId = resolvedDentistId;

      const conflict = await Appointment.findOne(conflictQuery).lean();
      if (conflict) {
        const arDate = followUpObj.toLocaleDateString('ar-EG');
        return res.status(409).json({
          success: false,
          message: `هذا التاريخ (${arDate} عند الساعة ${resolvedFollowUpTime}) يتعارض مع موعد آخر في جدولك. الرجاء اختيار وقت آخر.`
        });
      }

      followUpAppointmentDate = followUpObj;
    }

    // ── 4. CREATE VISIT ──────────────────────────────────────────────────
    console.log('📝 Creating visit document...');
    const visit = await Visit.create({
      visitType,
      ...patientRef,                                    // patientPersonId OR patientChildId
      doctorId: resolvedDoctorId || undefined,
      dentistId: resolvedDentistId || undefined,
      hospitalId: hospitalId || undefined,
      appointmentId: appointmentId || undefined,
      visitDate: new Date(),
      status: 'in_progress',
      chiefComplaint: chiefComplaint.trim(),
      diagnosis: diagnosis?.trim(),
      vitalSigns: vitalSigns || undefined,
      prescribedMedications: Array.isArray(prescribedMedications)
        ? prescribedMedications
        : [],
      ecgAnalysis: ecgAnalysis || undefined,
      doctorNotes: doctorNotes?.trim(),
      followUpDate: followUpDate ? new Date(followUpDate) : undefined,
      followUpNotes: followUpNotes?.trim(),
      visitPhotoUrl: visitPhotoUrl || undefined,
      visitPhotoUploadedAt: visitPhotoUrl ? new Date() : undefined
    });
    console.log('✅ Visit created:', visit._id);

    // ── 4.5 CREATE PRESCRIPTION (if medications were entered) ────────────
    // We mirror the visit's prescribedMedications into a proper Prescription
    // document so it shows on the patient's "الوصفات الطبية" tab. Failure
    // here is logged but doesn't block the visit — the visit is the
    // source-of-truth record; the prescription is a derived view.
    let prescription = null;
    if (Array.isArray(prescribedMedications) && prescribedMedications.length > 0) {
      try {
        const Prescription = require('../models/Prescription');

        // RX-YYYYMMDD-XXXXX
        const now = new Date();
        const rxNumber = `RX-${now.getFullYear()}`
          + `${String(now.getMonth() + 1).padStart(2, '0')}`
          + `${String(now.getDate()).padStart(2, '0')}`
          + `-${Math.floor(10000 + Math.random() * 90000)}`;
        const verificationCode = String(Math.floor(100000 + Math.random() * 900000));

        // Expire 30 days from today per schema note
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);

        // Normalize each medication entry. Required schema fields:
        // medicationName, dosage, frequency, duration. Fall back to a dash
        // so the save doesn't fail when the doctor omitted a field.
        const normalizedMeds = prescribedMedications
          .filter((m) => m && (m.medicationName || m.name))
          .map((m) => ({
            medicationId: m.medicationId || undefined,
            medicationName: m.medicationName || m.name || 'غير محدد',
            arabicName: m.arabicName || undefined,
            dosage: m.dosage || '—',
            frequency: m.frequency || '—',
            duration: m.duration || '—',
            route: m.route || undefined,
            instructions: m.instructions || undefined,
            quantity: typeof m.quantity === 'number' ? m.quantity : undefined,
            isDispensed: false
          }));

        if (normalizedMeds.length > 0) {
          prescription = await Prescription.create({
            prescriptionNumber: rxNumber,
            ...patientRef,
            doctorId: resolvedDoctorId || undefined,
            dentistId: resolvedDentistId || undefined,
            visitId: visit._id,
            prescriptionDate: new Date(),
            expiryDate,
            medications: normalizedMeds,
            status: 'active',
            verificationCode,
            qrCode: `${rxNumber}|${verificationCode}`,
            printCount: 0,
            prescriptionNotes: doctorNotes?.trim() || undefined
          });
          console.log('✅ Prescription created:', prescription.prescriptionNumber);
        }
      } catch (rxError) {
        console.error('⚠️  Prescription creation failed (visit still saved):', rxError.message);
        // Intentionally swallow — the visit itself is saved and the doctor
        // can retry creating the prescription separately if needed.
      }
    }

    // ── 4.6 CREATE FOLLOW-UP APPOINTMENT (if followUpDate was set) ───────
    // Conflict was already checked above, so this should succeed. If it
    // fails, we track the error so the response can warn the doctor —
    // previously the failure was silently swallowed and the doctor would
    // see "saved successfully" with no calendar entry, with no way to know
    // the follow-up was lost.
    //
    // Common failure mode (now fixed at the model level):
    //   Appointment pre-validate hook rejecting dentist follow-ups
    //   because the old check required doctorId for `follow_up` type.
    let followUpAppointment = null;
    let followUpError = null;
    if (followUpAppointmentDate) {
      try {
        const Appointment = require('../models/Appointment');
        followUpAppointment = await Appointment.create({
          appointmentType: 'follow_up',
          ...patientRef,
          doctorId: resolvedDoctorId || undefined,
          dentistId: resolvedDentistId || undefined,
          appointmentDate: followUpAppointmentDate,
          appointmentTime: resolvedFollowUpTime || FOLLOWUP_DEFAULT_TIME,
          estimatedDuration: 30,
          reasonForVisit: (followUpNotes && followUpNotes.trim())
            || `موعد متابعة — ${diagnosis?.trim() || chiefComplaint.trim()}`,
          status: 'scheduled',
          bookingMethod: 'admin',
          priority: 'routine',
          paymentStatus: 'pending'
        });
        console.log('✅ Follow-up appointment created:', followUpAppointment._id);
      } catch (apptError) {
        console.error('⚠️  Follow-up appointment creation failed:', apptError.message);
        // Track the error so the response can surface it. We still don't
        // throw, because the visit itself was saved and we want the doctor
        // to see that success — but they need to know the follow-up didn't
        // make it so they can rebook.
        followUpError = apptError.message || 'فشل إنشاء موعد المتابعة';
      }
    }

    
// ── 4.7 SEND PUSH NOTIFICATIONS TO PATIENT ───────────────────────────
    // Fire-and-forget — notification failures must NEVER break the visit.
    try {
      // Get doctor's name for personalized message
      let doctorName = 'الطبيب';
      if (resolvedDoctorId) {
        const doctorDoc = await Doctor.findById(resolvedDoctorId)
          .populate('personId', 'firstName lastName')
          .lean();
        if (doctorDoc?.personId) {
          doctorName = `د. ${doctorDoc.personId.firstName} ${doctorDoc.personId.lastName}`.trim();
        }
      }

      // ── Notification 1: New prescription created ───────────────────────
      if (prescription) {
        createNotification({
          recipientPersonId: patientRef.patientPersonId,
          recipientChildId:  patientRef.patientChildId,
          recipientType: 'patient',
          notificationType: 'prescription_ready',
          title:       'وصفة طبية جديدة',
          titleArabic: 'وصفة طبية جديدة',
          body: `${doctorName} أنشأ وصفة طبية جديدة لك — رقم الوصفة ${prescription.prescriptionNumber}`,
          channels: ['push', 'in_app'],
          relatedType: 'prescription',
          relatedId:   prescription._id,
          deepLinkRoute: '/medications',
          priority: 'normal'
        }).catch((err) => console.warn('⚠️  Prescription notification failed:', err.message));
      }

      // ── Notification 2: Follow-up appointment scheduled ─────────────────
      if (followUpAppointment) {
        const followUpDateAr = followUpAppointmentDate.toLocaleDateString('ar-EG');
        const followUpTimeStr = resolvedFollowUpTime || FOLLOWUP_DEFAULT_TIME;
        createNotification({
          recipientPersonId: patientRef.patientPersonId,
          recipientChildId:  patientRef.patientChildId,
          recipientType: 'patient',
          notificationType: 'appointment_confirmed',
          title:       'موعد متابعة',
          titleArabic: 'موعد متابعة',
          body: `${doctorName} حدد لك موعد متابعة بتاريخ ${followUpDateAr} الساعة ${followUpTimeStr}`,
          channels: ['push', 'in_app'],
          relatedType: 'appointment',
          relatedId:   followUpAppointment._id,
          deepLinkRoute: '/appointments',
          priority: 'normal'
        }).catch((err) => console.warn('⚠️  Follow-up notification failed:', err.message));
      }
    } catch (notifError) {
      console.warn('⚠️  Notification dispatch error (non-fatal):', notifError.message);
    }

    // ── 5. AUDIT LOG ─────────────────────────────────────────────────────
    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'CREATE_VISIT',
      description: `Created ${visitType} visit`,
      resourceType: 'visit',
      resourceId: visit._id,
      patientPersonId: patientRef.patientPersonId,
      patientChildId: patientRef.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true
    });

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الزيارة بنجاح',
      visit,
      prescription: prescription
        ? { _id: prescription._id, prescriptionNumber: prescription.prescriptionNumber }
        : null,
      followUpAppointment: followUpAppointment
        ? {
            _id: followUpAppointment._id,
            appointmentDate: followUpAppointment.appointmentDate,
            appointmentTime: followUpAppointment.appointmentTime
          }
        : null,
      // Surface follow-up creation failures so the frontend can warn the
      // doctor. When followUpDate was set but followUpAppointment is null,
      // this field tells the doctor why it didn't make it onto the calendar.
      followUpError: followUpError || undefined
    });

  } catch (error) {
    console.error('❌ Create visit error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'خطأ في البيانات'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إنشاء الزيارة'
    });
  }
};

// ============================================================================
// 2. GET PATIENT VISITS
// ============================================================================

/**
 * @route   GET /api/visits/patient/:identifier
 * @desc    List all visits for a patient identified by nationalId or CRN.
 *          Returns latest first, with optional pagination.
 * @access  Private (patient owner, admin, treating doctor)
 */
exports.getPatientVisits = async (req, res) => {
  try {
    const { identifier } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Resolve identifier — could be nationalId (11 digits) or CRN (CRN-...)
    let patientRef;
    if (/^\d{11}$/.test(identifier)) {
      // National ID — check Person first, then Children
      const adult = await Person.findOne({ nationalId: identifier }).lean();
      if (adult) {
        patientRef = { patientPersonId: adult._id };
      } else {
        const child = await Children.findOne({ nationalId: identifier }).lean();
        if (child) patientRef = { patientChildId: child._id };
      }
    } else if (identifier.startsWith('CRN-')) {
      const child = await Children.findOne({ childRegistrationNumber: identifier }).lean();
      if (child) patientRef = { patientChildId: child._id };
    }

    if (!patientRef) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على المريض'
      });
    }

    const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);

const [visits, total] = await Promise.all([
  Visit.find(patientRef)
    .populate('doctorId', 'specialization medicalLicenseNumber')
    .populate('dentistId', 'specialization dentalLicenseNumber')
    .populate('hospitalId', 'name arabicName')
    .sort({ visitDate: -1 })
    .limit(safeLimit)
    .skip((safePage - 1) * safeLimit)
    .lean(),
  Visit.countDocuments(patientRef)
]);

// ─── Fetch lab tests linked to these visits and attach them ──────────────
// Single batched query (O(1) DB round-trip instead of N queries).
const visitIds = visits.map((v) => v._id);
if (visitIds.length > 0) {
  const labTests = await LabTest.find({ visitId: { $in: visitIds } })
    .populate('laboratoryId', 'name arabicName governorate city')
    .sort({ orderDate: -1 })
    .lean();

  // Group by visitId for O(1) lookup during attach
  const labsByVisit = {};
  for (const lt of labTests) {
    const vid = String(lt.visitId);
    if (!labsByVisit[vid]) labsByVisit[vid] = [];
    labsByVisit[vid].push(lt);
  }

  // Attach to each visit (empty array if no tests)
  for (const v of visits) {
    v.labTests = labsByVisit[String(v._id)] || [];
  }
}

return res.json({
  success: true,
  count: total,
  page: safePage,
  pages: Math.ceil(total / safeLimit),
  visits
});
  } catch (error) {
    console.error('Get patient visits error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب زيارات المريض'
    });
  }
};

// ============================================================================
// 3. GET DOCTOR/DENTIST VISITS (role-aware)
// ============================================================================

/**
 * @route   GET /api/doctor/visits
 * @desc    List visits handled by the logged-in provider (doctor OR dentist).
 *          Auto-detects the provider type from req.user.roles and filters
 *          the visits collection by the appropriate foreign key
 *          (doctorId or dentistId).
 * @access  Private (doctor, dentist — self only)
 *
 * Query: ?page=1&limit=20&status=in_progress
 */
exports.getDoctorVisits = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    // ── Resolve provider from JWT (no more URL param) ────────────────────
    let providerQuery = null;
    let providerType = null;

    if (req.user?.roles?.includes('doctor')) {
      const doctor = await Doctor.findOne({ personId: req.user.personId })
        .select('_id').lean();
      if (doctor) {
        providerQuery = { doctorId: doctor._id };
        providerType = 'doctor';
      }
    } else if (req.user?.roles?.includes('dentist')) {
      const dentist = await Dentist.findOne({ personId: req.user.personId })
        .select('_id').lean();
      if (dentist) {
        providerQuery = { dentistId: dentist._id };
        providerType = 'dentist';
      }
    }

    if (!providerQuery) {
      return res.status(403).json({
        success: false,
        message: 'الحساب غير مرتبط بطبيب أو طبيب أسنان'
      });
    }

    const query = { ...providerQuery };
    if (status) query.status = status;

    const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);

    const [visits, total] = await Promise.all([
      Visit.find(query)
        .populate('patientPersonId', 'firstName lastName nationalId')
        .populate('patientChildId', 'firstName lastName childRegistrationNumber')
        .sort({ visitDate: -1 })
        .limit(safeLimit)
        .skip((safePage - 1) * safeLimit)
        .lean(),
      Visit.countDocuments(query)
    ]);

    return res.json({
      success: true,
      providerType,
      count: total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
      visits
    });
  } catch (error) {
    console.error('Get provider visits error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الزيارات'
    });
  }
};

// ============================================================================
// 4. GET VISIT BY ID
// ============================================================================

/**
 * @route   GET /api/visits/:id
 * @desc    Get a single visit detail with all populated refs
 * @access  Private (patient owner, treating doctor, admin)
 */
exports.getVisitById = async (req, res) => {
  try {
    const { id } = req.params;

    const visit = await Visit.findById(id)
      .populate('patientPersonId', 'firstName lastName nationalId phoneNumber')
      .populate('patientChildId', 'firstName lastName childRegistrationNumber phoneNumber')
      .populate('doctorId', 'specialization medicalLicenseNumber')
      .populate('dentistId', 'specialization dentalLicenseNumber')
      .populate('hospitalId', 'name arabicName')
      .lean();

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'الزيارة غير موجودة'
      });
    }

    return res.json({ success: true, visit });
  } catch (error) {
    console.error('Get visit by id error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الزيارة'
    });
  }
};

// ============================================================================
// 5. UPDATE VISIT
// ============================================================================

/**
 * @route   PUT /api/visits/:id
 * @desc    Update visit fields. Only the visit's owning doctor or admin
 *          can update.
 * @access  Private (treating doctor, admin)
 */
exports.updateVisit = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const visit = await Visit.findById(id);
    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'الزيارة غير موجودة'
      });
    }

    // ── Ownership check: only the treating provider or admin can update ──
    const isAdmin = req.user.roles?.includes('admin');
    let isOwnerProvider = false;

    if (!isAdmin) {
      if (req.user.roles?.includes('doctor') && visit.doctorId) {
        const doctor = await Doctor.findOne({ personId: req.user.personId })
          .select('_id').lean();
        isOwnerProvider = doctor && String(visit.doctorId) === String(doctor._id);
      } else if (req.user.roles?.includes('dentist') && visit.dentistId) {
        const dentist = await Dentist.findOne({ personId: req.user.personId })
          .select('_id').lean();
        isOwnerProvider = dentist && String(visit.dentistId) === String(dentist._id);
      }
    }

    if (!isAdmin && !isOwnerProvider) {
      console.log('❌ Update blocked — not owner');
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية لتعديل هذه الزيارة'
      });
    }

    // ── Update allowed fields
    const allowedFields = [
      'diagnosis', 'vitalSigns', 'prescribedMedications',
      'doctorNotes', 'followUpDate', 'followUpNotes',
      'visitPhotoUrl', 'paymentStatus', 'paymentMethod',
      'ecgAnalysis'
    ];
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) visit[field] = updates[field];
    });

    if (updates.visitPhotoUrl) {
      visit.visitPhotoUploadedAt = new Date();
    }

    await visit.save();
    console.log('✅ Visit updated');

    return res.json({
      success: true,
      message: 'تم تحديث الزيارة بنجاح',
      visit
    });
  } catch (error) {
    console.error('Update visit error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'خطأ في البيانات'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحديث الزيارة'
    });
  }
};

// ============================================================================
// 6. COMPLETE VISIT
// ============================================================================

/**
 * @route   POST /api/visits/:id/complete
 * @desc    Mark visit as completed and refresh the patient's denormalized
 *          totalVisits + lastVisitDate counters via Patient.recordVisit().
 * @access  Private (treating doctor, admin)
 */
exports.completeVisit = async (req, res) => {
  console.log('🔵 ========== COMPLETE VISIT ==========');

  try {
    const { id } = req.params;

    const visit = await Visit.findById(id);
    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'الزيارة غير موجودة'
      });
    }

    if (visit.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'الزيارة مكتملة بالفعل'
      });
    }

    await visit.markCompleted();
    console.log('✅ Visit marked completed');

    // Refresh patient stats (totalVisits, lastVisitDate)
    const patientQuery = visit.patientChildId
      ? { childId: visit.patientChildId }
      : { personId: visit.patientPersonId };
    const patient = await Patient.findOne(patientQuery);
    if (patient) {
      await patient.recordVisit(visit.visitDate);
      console.log('✅ Patient stats refreshed');
    }

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'COMPLETE_VISIT',
      resourceType: 'visit',
      resourceId: visit._id,
      patientPersonId: visit.patientPersonId,
      patientChildId: visit.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true
    });

    return res.json({
      success: true,
      message: 'تم إنهاء الزيارة بنجاح',
      visit
    });
  } catch (error) {
    console.error('Complete visit error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إنهاء الزيارة'
    });
  }
};

// ============================================================================
// 7. DELETE VISIT (admin only — soft delete via status)
// ============================================================================

/**
 * @route   DELETE /api/visits/:id
 * @desc    Soft-delete visit by setting status='cancelled'. Admin-only because
 *          visit history is medically significant — patients should never
 *          be able to remove visits from their own record.
 * @access  Private (admin)
 */
exports.deleteVisit = async (req, res) => {
  try {
    const { id } = req.params;

    const visit = await Visit.findById(id);
    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'الزيارة غير موجودة'
      });
    }

    visit.status = 'cancelled';
    await visit.save();

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'CANCEL_VISIT',
      resourceType: 'visit',
      resourceId: visit._id,
      patientPersonId: visit.patientPersonId,
      patientChildId: visit.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true
    });

    return res.json({
      success: true,
      message: 'تم إلغاء الزيارة'
    });
  } catch (error) {
    console.error('Delete visit error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في حذف الزيارة'
    });
  }
};