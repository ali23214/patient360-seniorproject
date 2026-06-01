/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Prescription Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Doctor and patient prescription endpoints, plus pharmacist verification.
 *  Mounted at /api/prescriptions.
 *
 *  Workflow context:
 *    1. Doctor completes a visit → calls POST /api/prescriptions
 *       (this controller)
 *    2. Prescription is created with auto-generated prescriptionNumber,
 *       6-digit verificationCode, and QR code string
 *    3. Patient takes the printed/digital Rx to any pharmacy
 *    4. Pharmacist scans QR → calls POST /api/prescriptions/verify-qr
 *       OR types the code → calls POST /api/prescriptions/verify-code
 *       (both endpoints in this controller)
 *    5. Pharmacist sees the full prescription details
 *    6. Pharmacist actually dispenses → goes to dispensingController (B2)
 *
 *  Functions:
 *    1. createPrescription          — Doctor creates new Rx from a visit
 *    2. getPrescriptionById         — Single Rx detail
 *    3. getDoctorPrescriptions      — All Rx written by a doctor
 *    4. getPatientPrescriptions     — All Rx for a patient
 *    5. verifyByQRCode              — Pharmacist scans QR
 *    6. verifyByCode                — Pharmacist types 6-digit code
 *    7. cancelPrescription          — Doctor cancels Rx (before dispensed)
 *    8. checkInteractions           — Pre-flight check before creating Rx
 *
 *  Conventions kept:
 *    - Arabic error messages, emoji-marked console logs
 *    - { success, message, [data] } response shape
 *    - Try/catch in every async function
 * ═══════════════════════════════════════════════════════════════════════════
 */

const {
  Prescription, Visit, Patient, Doctor, Dentist,
  Medication, AuditLog
} = require('../models');

// ============================================================================
// HELPER: Check interactions between new Rx meds and patient's chronic meds
// ============================================================================

/**
 * For each medication in the new prescription, check if it interacts with
 * the patient's existing chronic medications. Returns a list of warnings.
 *
 * @param {Array} newMedications - meds being prescribed (from req.body.medications)
 * @param {Array<string>} patientCurrentMeds - patient.currentMedications
 * @returns {Promise<Array>} array of { medicationName, conflictsWith[] }
 */
async function checkMedicationInteractions(newMedications, patientCurrentMeds) {
  if (!Array.isArray(patientCurrentMeds) || patientCurrentMeds.length === 0) {
    return [];
  }

  const warnings = [];

  for (const med of newMedications) {
    // Try to find the medication in our database for interaction data
    if (!med.medicationId) continue;

    const medDoc = await Medication.findById(med.medicationId);
    if (!medDoc) continue;

    const conflicts = medDoc.findInteractionsWith(patientCurrentMeds);
    if (conflicts.length > 0) {
      warnings.push({
        medicationName: med.medicationName,
        conflictsWith: conflicts
      });
    }
  }

  return warnings;
}

// ============================================================================
// 1. CREATE PRESCRIPTION
// ============================================================================

/**
 * @route   POST /api/prescriptions
 * @desc    Doctor creates a new prescription tied to a visit.
 *          The Prescription model auto-generates prescriptionNumber,
 *          verificationCode, and qrCode in its pre-save hook.
 * @access  Private (doctor, dentist)
 *
 * Body:
 *   visitId (required)             — the visit this Rx came from
 *   medications[] (required, >=1)  — array of medication objects:
 *     {
 *       medicationId?         — ObjectId from medications collection (optional)
 *       medicationName        — string (required)
 *       arabicName?           — string (optional)
 *       dosage                — string e.g. "500mg" (required)
 *       frequency             — string e.g. "twice daily" (required)
 *       duration              — string e.g. "10 days" (required)
 *       route?                — oral | topical | injection | ...
 *       instructions?         — string e.g. "take after meals"
 *       quantity?             — total units to dispense
 *     }
 *   prescriptionNotes?             — doctor's notes for the pharmacist
 *   expiryDate?                    — defaults to 30 days if not set
 */
exports.createPrescription = async (req, res) => {
  console.log('🔵 ========== CREATE PRESCRIPTION ==========');

  try {
    const { visitId, medications, prescriptionNotes, expiryDate } = req.body;

    // ── 1. VALIDATE REQUIRED FIELDS ───────────────────────────────────────
    if (!visitId) {
      return res.status(400).json({
        success: false,
        message: 'يجب ربط الوصفة بزيارة (visitId)'
      });
    }

    if (!Array.isArray(medications) || medications.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب وصف دواء واحد على الأقل'
      });
    }

    // ── 2. LOAD AND VALIDATE THE VISIT ────────────────────────────────────
    const visit = await Visit.findById(visitId);
    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'الزيارة غير موجودة'
      });
    }

    // Visit must be in_progress or completed (not cancelled)
    if (visit.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'لا يمكن إصدار وصفة لزيارة ملغاة'
      });
    }

    // ── 3. RESOLVE PRESCRIBER (doctor or dentist from the visit) ──────────
    const prescriberFields = {};
    if (visit.doctorId) {
      prescriberFields.doctorId = visit.doctorId;
    } else if (visit.dentistId) {
      prescriberFields.dentistId = visit.dentistId;
    } else {
      return res.status(400).json({
        success: false,
        message: 'الزيارة غير مرتبطة بطبيب أو طبيب أسنان'
      });
    }

    // ── 4. PATIENT REF (copied from visit) ────────────────────────────────
    const patientFields = {};
    if (visit.patientPersonId) {
      patientFields.patientPersonId = visit.patientPersonId;
    } else if (visit.patientChildId) {
      patientFields.patientChildId = visit.patientChildId;
    } else {
      return res.status(400).json({
        success: false,
        message: 'الزيارة غير مرتبطة بمريض'
      });
    }

    // ── 5. CHECK DRUG INTERACTIONS WITH PATIENT'S CHRONIC MEDS ────────────
    // Best-effort: load patient's current medications and warn about conflicts
    let interactionWarnings = [];
    try {
      const patientQuery = patientFields.patientChildId
        ? { childId: patientFields.patientChildId }
        : { personId: patientFields.patientPersonId };
      const patient = await Patient.findOne(patientQuery).lean();

      if (patient?.currentMedications?.length > 0) {
        interactionWarnings = await checkMedicationInteractions(
          medications,
          patient.currentMedications
        );
        if (interactionWarnings.length > 0) {
          console.log('⚠️  Drug interaction warnings:', interactionWarnings.length);
        }
      }
    } catch (interactionError) {
      // Interaction check failure shouldn't block prescription creation
      console.error('Interaction check failed:', interactionError.message);
    }

    // ── 6. CREATE PRESCRIPTION ────────────────────────────────────────────
    // The model's pre-save hook handles prescriptionNumber, verificationCode,
    // qrCode, and default expiryDate (30 days)
    const prescription = await Prescription.create({
      ...patientFields,
      ...prescriberFields,
      visitId,
      medications: medications.map(m => ({
        medicationId: m.medicationId || undefined,
        medicationName: m.medicationName.trim(),
        arabicName: m.arabicName?.trim() || undefined,
        dosage: m.dosage.trim(),
        frequency: m.frequency.trim(),
        duration: m.duration.trim(),
        route: m.route || 'oral',
        instructions: m.instructions?.trim() || undefined,
        quantity: m.quantity ? parseInt(m.quantity, 10) : undefined
      })),
      prescriptionNotes: prescriptionNotes?.trim() || undefined,
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      status: 'active'
    });

    console.log('✅ Prescription created:', prescription.prescriptionNumber);

    // ── 7. AUDIT LOG ──────────────────────────────────────────────────────
    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'CREATE_PRESCRIPTION',
      description: `Created Rx ${prescription.prescriptionNumber}`,
      resourceType: 'prescription',
      resourceId: prescription._id,
      patientPersonId: prescription.patientPersonId,
      patientChildId: prescription.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        medicationCount: medications.length,
        visitId
      }
    });

    return res.status(201).json({
      success: true,
      message: 'تم إصدار الوصفة بنجاح',
      prescription: {
        _id: prescription._id,
        prescriptionNumber: prescription.prescriptionNumber,
        verificationCode: prescription.verificationCode,
        qrCode: prescription.qrCode,
        expiryDate: prescription.expiryDate,
        medications: prescription.medications,
        status: prescription.status
      },
      warnings: interactionWarnings.length > 0
        ? {
            interactions: interactionWarnings,
            message: 'تنبيه: تم اكتشاف تفاعلات دوائية محتملة'
          }
        : null
    });

  } catch (error) {
    console.error('❌ Create prescription error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'خطأ في البيانات'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إصدار الوصفة'
    });
  }
};

// ============================================================================
// 2. GET PRESCRIPTION BY ID
// ============================================================================

/**
 * @route   GET /api/prescriptions/:id
 * @desc    Single prescription detail with populated refs
 * @access  Private (patient owner, prescribing doctor, pharmacist, admin)
 */
exports.getPrescriptionById = async (req, res) => {
  try {
    const { id } = req.params;

    const prescription = await Prescription.findById(id)
      .populate('doctorId', 'specialization medicalLicenseNumber')
      .populate('dentistId', 'specialization dentalLicenseNumber')
      .populate('patientPersonId', 'firstName lastName nationalId phoneNumber')
      .populate('patientChildId', 'firstName lastName childRegistrationNumber phoneNumber')
      .populate('visitId', 'visitDate chiefComplaint diagnosis')
      .lean();

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'الوصفة غير موجودة'
      });
    }

    return res.json({
      success: true,
      prescription
    });
  } catch (error) {
    console.error('Get prescription error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الوصفة'
    });
  }
};

// ============================================================================
// 3. GET DOCTOR'S PRESCRIPTIONS
// ============================================================================

/**
 * @route   GET /api/prescriptions/doctor/:doctorId
 * @desc    All prescriptions written by a specific doctor (paginated)
 * @access  Private (doctor self, admin)
 */
exports.getDoctorPrescriptions = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { page = 1, limit = 20, status } = req.query;

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);

    const query = { doctorId };
    if (status) query.status = status;

    const [prescriptions, total] = await Promise.all([
      Prescription.find(query)
        .populate('patientPersonId', 'firstName lastName nationalId')
        .populate('patientChildId', 'firstName lastName childRegistrationNumber')
        .sort({ prescriptionDate: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      Prescription.countDocuments(query)
    ]);

    return res.json({
      success: true,
      count: total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
      prescriptions
    });
  } catch (error) {
    console.error('Get doctor prescriptions error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الوصفات'
    });
  }
};

// ============================================================================
// 4. GET PATIENT'S PRESCRIPTIONS
// ============================================================================

/**
 * @route   GET /api/prescriptions/patient/:identifier
 * @desc    All prescriptions for a patient (by nationalId or CRN)
 * @access  Private (patient owner, treating doctor, pharmacist, admin)
 */
exports.getPatientPrescriptions = async (req, res) => {
  try {
    const { identifier } = req.params;
    const { page = 1, limit = 20, status } = req.query;

    // Resolve identifier into dual-ref
    const { Person, Children } = require('../models');
    let patientRef = null;

    if (/^\d{11}$/.test(identifier)) {
      const adult = await Person.findOne({ nationalId: identifier }).lean();
      if (adult) {
        patientRef = { patientPersonId: adult._id };
      } else {
        const child = await Children.findOne({ nationalId: identifier }).lean();
        if (child) patientRef = { patientChildId: child._id };
      }
    } else if (identifier.startsWith('CRN-')) {
      const child = await Children.findOne({
        childRegistrationNumber: identifier
      }).lean();
      if (child) patientRef = { patientChildId: child._id };
    }

    if (!patientRef) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على المريض'
      });
    }

    const query = { ...patientRef };
    if (status) query.status = status;

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);

    const [prescriptions, total] = await Promise.all([
      Prescription.find(query)
        .populate('doctorId', 'specialization medicalLicenseNumber')
        .populate('dentistId', 'specialization dentalLicenseNumber')
        .sort({ prescriptionDate: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      Prescription.countDocuments(query)
    ]);

    return res.json({
      success: true,
      count: total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
      prescriptions
    });
  } catch (error) {
    console.error('Get patient prescriptions error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الوصفات'
    });
  }
};

// ============================================================================
// 5. VERIFY BY QR CODE (pharmacist scans)
// ============================================================================

/**
 * @route   POST /api/prescriptions/verify-qr
 * @desc    Pharmacist scans the QR code to fetch a prescription.
 *          QR payload format: "RX-YYYYMMDD-XXXXX|123456" (number|code)
 * @access  Private (pharmacist)
 *
 * Body: { qrCode: string }
 */
exports.verifyByQRCode = async (req, res) => {
  console.log('🔍 ========== VERIFY RX BY QR ==========');

  try {
    const { qrCode } = req.body;

    if (!qrCode) {
      return res.status(400).json({
        success: false,
        message: 'رمز QR مطلوب'
      });
    }

    // Look up the prescription by exact QR string match
    const prescription = await Prescription.findOne({ qrCode })
      .populate('doctorId', 'specialization medicalLicenseNumber')
      .populate('dentistId', 'specialization dentalLicenseNumber')
      .populate('patientPersonId', 'firstName lastName nationalId phoneNumber')
      .populate('patientChildId', 'firstName lastName childRegistrationNumber phoneNumber')
      .lean();

    if (!prescription) {
      console.log('❌ QR not found');
      return res.status(404).json({
        success: false,
        message: 'الوصفة غير موجودة. تحقق من صحة رمز QR'
      });
    }

    // Check status
    if (prescription.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'هذه الوصفة ملغاة'
      });
    }

    if (prescription.status === 'dispensed') {
      return res.status(400).json({
        success: false,
        message: 'تم صرف هذه الوصفة بالكامل مسبقاً'
      });
    }

    // Check expiry
    if (prescription.expiryDate && new Date(prescription.expiryDate) < new Date()) {
      // Auto-mark as expired if it isn't already
      if (prescription.status !== 'expired') {
        await Prescription.findByIdAndUpdate(prescription._id, { status: 'expired' });
      }
      return res.status(400).json({
        success: false,
        message: 'انتهت صلاحية هذه الوصفة'
      });
    }

    console.log('✅ Rx verified:', prescription.prescriptionNumber);

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'VERIFY_PRESCRIPTION_QR',
      description: `Pharmacist scanned ${prescription.prescriptionNumber}`,
      resourceType: 'prescription',
      resourceId: prescription._id,
      patientPersonId: prescription.patientPersonId?._id,
      patientChildId: prescription.patientChildId?._id,
      ipAddress: req.ip || 'unknown',
      success: true
    });

    return res.json({
      success: true,
      message: 'تم التحقق من الوصفة',
      prescription
    });
  } catch (error) {
    console.error('❌ Verify QR error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في التحقق من الوصفة'
    });
  }
};

// ============================================================================
// 6. VERIFY BY CODE (pharmacist types the 6-digit code manually)
// ============================================================================

/**
 * @route   POST /api/prescriptions/verify-code
 * @desc    Pharmacist enters the 6-digit verification code (fallback when
 *          QR scanner unavailable). Requires both prescriptionNumber and
 *          verificationCode for security — typing just the code is too
 *          easy to brute-force.
 * @access  Private (pharmacist)
 *
 * Body: { prescriptionNumber: string, verificationCode: string }
 */
exports.verifyByCode = async (req, res) => {
  console.log('🔍 ========== VERIFY RX BY CODE ==========');

  try {
    const { prescriptionNumber, verificationCode } = req.body;

    if (!prescriptionNumber || !verificationCode) {
      return res.status(400).json({
        success: false,
        message: 'رقم الوصفة ورمز التحقق مطلوبان'
      });
    }

    const prescription = await Prescription.findOne({
      prescriptionNumber: prescriptionNumber.toUpperCase().trim()
    })
      .populate('doctorId', 'specialization medicalLicenseNumber')
      .populate('dentistId', 'specialization dentalLicenseNumber')
      .populate('patientPersonId', 'firstName lastName nationalId phoneNumber')
      .populate('patientChildId', 'firstName lastName childRegistrationNumber phoneNumber');

    if (!prescription) {
      console.log('❌ Rx number not found');
      return res.status(404).json({
        success: false,
        message: 'رقم الوصفة غير صحيح'
      });
    }

    // Use the model's verifyCode() instance method (constant-time comparison
    // would be even better but for 6 digits this is OK)
    if (!prescription.verifyCode(verificationCode)) {
      console.log('❌ Code mismatch');
      return res.status(401).json({
        success: false,
        message: 'رمز التحقق غير صحيح'
      });
    }

    // Same status/expiry checks as QR verification
    if (prescription.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'هذه الوصفة ملغاة'
      });
    }
    if (prescription.status === 'dispensed') {
      return res.status(400).json({
        success: false,
        message: 'تم صرف هذه الوصفة بالكامل مسبقاً'
      });
    }
    if (prescription.expiryDate && new Date(prescription.expiryDate) < new Date()) {
      if (prescription.status !== 'expired') {
        prescription.status = 'expired';
        await prescription.save();
      }
      return res.status(400).json({
        success: false,
        message: 'انتهت صلاحية هذه الوصفة'
      });
    }

    console.log('✅ Code verified for', prescription.prescriptionNumber);

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'VERIFY_PRESCRIPTION_CODE',
      description: `Pharmacist verified ${prescription.prescriptionNumber} by code`,
      resourceType: 'prescription',
      resourceId: prescription._id,
      patientPersonId: prescription.patientPersonId?._id,
      patientChildId: prescription.patientChildId?._id,
      ipAddress: req.ip || 'unknown',
      success: true
    });

    return res.json({
      success: true,
      message: 'تم التحقق من الوصفة',
      prescription: prescription.toObject()
    });
  } catch (error) {
    console.error('❌ Verify code error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في التحقق من الوصفة'
    });
  }
};

// ============================================================================
// 7. CANCEL PRESCRIPTION
// ============================================================================

/**
 * @route   POST /api/prescriptions/:id/cancel
 * @desc    Doctor cancels a prescription (only allowed before dispensing)
 * @access  Private (prescribing doctor or admin)
 *
 * Body: { reason?: string }
 */
exports.cancelPrescription = async (req, res) => {
  console.log('🔵 ========== CANCEL PRESCRIPTION ==========');

  try {
    const { id } = req.params;
    const { reason } = req.body;

    const prescription = await Prescription.findById(id);
    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'الوصفة غير موجودة'
      });
    }

    // Can only cancel active or partially-dispensed prescriptions
    if (!['active', 'partially_dispensed'].includes(prescription.status)) {
      return res.status(400).json({
        success: false,
        message: `لا يمكن إلغاء وصفة حالتها ${prescription.status}`
      });
    }

    // Ownership check: only the prescribing doctor or admin can cancel
    const isAdmin = req.user.roles?.includes('admin');
    let isOwner = false;

    if (prescription.doctorId) {
      const doctor = await Doctor.findOne({ personId: req.user.personId }).lean();
      isOwner = doctor && String(prescription.doctorId) === String(doctor._id);
    } else if (prescription.dentistId) {
      const dentist = await Dentist.findOne({ personId: req.user.personId }).lean();
      isOwner = dentist && String(prescription.dentistId) === String(dentist._id);
    }

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'فقط الطبيب المُصدر للوصفة يمكنه إلغاؤها'
      });
    }

    prescription.status = 'cancelled';
    if (reason) {
      prescription.prescriptionNotes =
        (prescription.prescriptionNotes || '') + `\n[ملغاة: ${reason}]`;
    }
    await prescription.save();

    console.log('✅ Rx cancelled:', prescription.prescriptionNumber);

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'CANCEL_PRESCRIPTION',
      description: `Cancelled ${prescription.prescriptionNumber}`,
      resourceType: 'prescription',
      resourceId: prescription._id,
      patientPersonId: prescription.patientPersonId,
      patientChildId: prescription.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: { reason: reason || null }
    });

    return res.json({
      success: true,
      message: 'تم إلغاء الوصفة'
    });
  } catch (error) {
    console.error('Cancel prescription error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إلغاء الوصفة'
    });
  }
};

// ============================================================================
// 8. CHECK INTERACTIONS (pre-flight before doctor creates Rx)
// ============================================================================

/**
 * @route   POST /api/prescriptions/check-interactions
 * @desc    Pre-flight check for drug interactions before doctor finalizes
 *          a prescription. Doctor can call this from the Rx form to see
 *          warnings before submitting.
 * @access  Private (doctor, dentist)
 *
 * Body:
 *   medications[] — same shape as createPrescription (just for the check)
 *   patientPersonId | patientChildId — to load chronic medications from
 */
exports.checkInteractions = async (req, res) => {
  try {
    const { medications, patientPersonId, patientChildId } = req.body;

    if (!Array.isArray(medications) || medications.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'قائمة الأدوية مطلوبة'
      });
    }

    if (!patientPersonId && !patientChildId) {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد المريض'
      });
    }

    const patientQuery = patientChildId
      ? { childId: patientChildId }
      : { personId: patientPersonId };
    const patient = await Patient.findOne(patientQuery).lean();

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'المريض غير موجود'
      });
    }

    const warnings = await checkMedicationInteractions(
      medications,
      patient.currentMedications || []
    );

    return res.json({
      success: true,
      hasWarnings: warnings.length > 0,
      warnings,
      patientCurrentMedications: patient.currentMedications || [],
      patientAllergies: patient.allergies || []
    });
  } catch (error) {
    console.error('Check interactions error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في فحص التفاعلات'
    });
  }
};