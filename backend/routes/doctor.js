/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Patient 360° — Doctor Routes
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at:  /api/doctor
 *
 *  All routes require:
 *    1. Authentication  (protect)
 *    2. Doctor role     (restrictTo('doctor', 'dentist'))
 *
 *  ─────────────────────────────────────────────────────────────────────
 *  v2 — Schedule Template endpoints (Calendly-style, May 2026)
 *
 *      GET    /api/doctor/schedule-template
 *      PUT    /api/doctor/schedule-template
 *      POST   /api/doctor/schedule-template/regenerate
 *
 *  These manage the doctor's structured weekly schedule template and
 *  delegate to availabilitySlotController for the generation work.
 *  All three pass through `injectDoctorContext` so the caller's identity
 *  is verified before any read or write.
 *  ─────────────────────────────────────────────────────────────────────
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

// Middleware
const { protect, restrictTo } = require('../middleware/auth');

// File upload helper
const FileUploadManager = require('../utils/fileUpload');

// Models
const Patient = require('../models/Patient');
const Person = require('../models/Person');
const Children = require('../models/Children');
const Account = require('../models/Account');
const Doctor = require('../models/Doctor');
const Dentist = require('../models/Dentist');
const Appointment = require('../models/Appointment');
const Visit = require('../models/Visit');
const LabTest = require('../models/LabTest');
const Prescription = require('../models/Prescription');
const AvailabilitySlot = require('../models/AvailabilitySlot');

// Controllers we delegate to (no new business logic in this file — just routing)
const visitController = require('../controllers/visitController');
const appointmentController = require('../controllers/appointmentController');
const slotController = require('../controllers/availabilitySlotController');
const notificationController = require('../controllers/notificationController');


// ============================================================================
// ROUTE-LEVEL MIDDLEWARE
// ============================================================================

/**
 * Resolves the logged-in provider's professional record (Doctor OR Dentist)
 * and injects its _id into the request so downstream handlers don't need
 * to repeat the look-up themselves.
 *
 * Sets:
 *   req.providerType  — 'doctor' | 'dentist'
 *   req.providerId    — the provider's mongoose _id
 *   req.doctorId      — legacy alias (set only when providerType === 'doctor')
 *   req.dentistId     — alias (set only when providerType === 'dentist')
 *   req.body.doctorId — legacy alias for old controllers that read from body
 *
 * The frontend should NEVER send doctorId/dentistId itself — that's a
 * security concern (a provider could otherwise create slots for somebody
 * else's calendar). This middleware enforces "the resource always belongs
 * to the caller".
 */
async function injectProviderContext(req, res, next) {
  try {
    const roles = req.user?.roles || [];
    let provider = null;
    let providerType = null;

    if (roles.includes('doctor')) {
      provider = await Doctor.findOne({ personId: req.user.personId })
        .select('_id').lean();
      providerType = 'doctor';
    } else if (roles.includes('dentist')) {
      provider = await Dentist.findOne({ personId: req.user.personId })
        .select('_id').lean();
      providerType = 'dentist';
    }

    if (!provider) {
      return res.status(403).json({
        success: false,
        message: 'لم يتم العثور على ملف الطبيب أو طبيب الأسنان'
      });
    }

    req.providerType = providerType;
    req.providerId = provider._id;

    // Legacy aliases — keep old code paths working without per-line edits
    req.body = req.body || {};
    if (providerType === 'doctor') {
      req.doctorId = provider._id;
      req.body.doctorId = String(provider._id);
    } else {
      req.dentistId = provider._id;
      req.body.dentistId = String(provider._id);
    }

    return next();
  } catch (error) {
    console.error('injectProviderContext error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحديد هوية المزود'
    });
  }
}

// Legacy alias — older routes may still reference this by name
const injectDoctorContext = injectProviderContext;


// ============================================================================
// MULTER CONFIG — visit photo uploads
// ============================================================================

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    try {
      const nationalId = req.params.nationalId;
      if (!nationalId) return cb(new Error('Patient ID not found in request'), null);

      const fileInfo = FileUploadManager.generateFilePath('visit', nationalId, file.originalname);
      await FileUploadManager.ensureDirectory(fileInfo.directory);
      cb(null, fileInfo.directory);
    } catch (error) {
      console.error('Error in storage destination:', error);
      cb(error, null);
    }
  },
  filename: function (req, file, cb) {
    try {
      const nationalId = req.params.nationalId;
      const fileInfo = FileUploadManager.generateFilePath('visit', nationalId, file.originalname);
      cb(null, fileInfo.filename);
    } catch (error) {
      console.error('Error generating filename:', error);
      cb(error, null);
    }
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) return cb(null, true);
  cb(new Error('نوع الملف غير مدعوم. الرجاء رفع صورة أو PDF فقط'), false);
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter
});


// ============================================================================
// PATIENT SEARCH
// ============================================================================

/**
 * @route   GET /api/doctor/search/:nationalId
 * @desc    Search for a patient by national ID (adult) OR childRegistrationNumber (child)
 * @access  Private (Doctor only)
 *
 * Accepts two input formats (v2.3 — Muath's spec):
 *   • 11-digit national ID         → looks up Person first, then any Children
 *                                     that already received their nationalId
 *                                     (migration status: ready / migrated).
 *   • {parentNationalId}-NN        → looks up Children directly by
 *                                     childRegistrationNumber.
 *                                     Example: 01222333444-01, 01222333444-02
 *
 * Response shape is identical for both paths so the frontend's
 * `selectPatient(patient)` flow doesn't need to branch — `childRegistrationNumber`
 * is included in the payload when the result is a child, and `nationalId`
 * when it's an adult (or migrated child who now has a nationalId).
 */
router.get('/search/:nationalId', protect, restrictTo('doctor', 'dentist'), async (req, res) => {
  try {
    // Normalize: trim, uppercase (CRN must match case-insensitively from the UI),
    // strip any accidental whitespace the frontend may have allowed through.
    const rawInput = String(req.params.nationalId || '').trim().toUpperCase();
    console.log('🔍 Searching for:', rawInput);

    if (!rawInput) {
      return res.status(400).json({
        success: false,
        message: 'الرقم الوطني أو رقم تسجيل الطفل مطلوب',
      });
    }

    const isAdultId  = /^\d{11}$/.test(rawInput);
    // v2.3 (Muath's spec) — Child format: {parentNationalId}-NN (2-digit padded)
    // Examples: 01222333444-01, 01222333444-02
    const isChildId  = /^\d{11}-\d{2}$/.test(rawInput);

    if (!isAdultId && !isChildId) {
      return res.status(400).json({
        success: false,
        message: 'الصيغة غير صحيحة. أدخل 11 رقم للبالغ أو رقم الأب-XX للطفل (مثل: 01222333444-01)',
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // Helper — build the unified patient payload for a CHILD record.
    // Mirrors the adult response so the frontend treats them identically.
    // ────────────────────────────────────────────────────────────────────────
    const buildChildResponse = async (child) => {
      const patient = await Patient.findOne({ childId: child._id }).lean();
      const account = await Account.findOne({ childId: child._id })
        .select('-password')
        .lean();

      return {
        // ── Identity (from children collection) ────────────────────────────
        _id: child._id,
        childRegistrationNumber: child.childRegistrationNumber,
        nationalId: child.nationalId || null, // populated only after migration
        firstName: child.firstName,
        fatherName: child.fatherName,
        lastName: child.lastName,
        motherName: child.motherName,
        dateOfBirth: child.dateOfBirth,
        gender: child.gender,
        phoneNumber: child.phoneNumber,
        alternativePhoneNumber: child.alternativePhoneNumber,
        governorate: child.governorate,
        city: child.city,
        district: child.district,
        street: child.street,
        building: child.building,
        address: child.address,
        profilePhoto: child.profilePhoto,
        isActive: child.isActive,

        // ── Child-specific fields ──────────────────────────────────────────
        isChild: true,
        parentNationalId: child.parentNationalId,
        parentPersonId: child.parentPersonId,
        guardianName: child.guardianName,
        guardianRelationship: child.guardianRelationship,
        guardianPhoneNumber: child.guardianPhoneNumber,
        schoolName: child.schoolName,
        grade: child.grade,
        hasReceivedNationalId: child.hasReceivedNationalId,
        migrationStatus: child.migrationStatus,

        // ── Fields that don't apply to children (kept as null for parity) ──
        maritalStatus: null,
        occupation: null,
        education: null,

        // ── Medical profile (from patients collection — childId link) ──────
        patientRecordId: patient ? patient._id : null,
        bloodType: patient ? patient.bloodType : 'unknown',
        rhFactor: patient ? patient.rhFactor : 'unknown',
        height: patient ? patient.height : null,
        weight: patient ? patient.weight : null,
        bmi: patient ? patient.bmi : null,
        smokingStatus: patient ? patient.smokingStatus : null,
        alcoholConsumption: patient ? patient.alcoholConsumption : null,
        exerciseFrequency: patient ? patient.exerciseFrequency : null,
        dietType: patient ? patient.dietType : null,
        chronicDiseases: patient ? (patient.chronicDiseases || []) : [],
        allergies: patient ? (patient.allergies || []) : [],
        familyHistory: patient ? (patient.familyHistory || []) : [],
        currentMedications: patient ? (patient.currentMedications || []) : [],
        previousSurgeries: patient ? (patient.previousSurgeries || []) : [],
        emergencyContact: patient ? patient.emergencyContact : null,
        medicalCardNumber: patient ? patient.medicalCardNumber : null,
        totalVisits: patient ? (patient.totalVisits || 0) : 0,
        lastVisitDate: patient ? patient.lastVisitDate : null,

        // ── Account metadata ───────────────────────────────────────────────
        email: account ? account.email : null,
        accountActive: account ? account.isActive : null,
        registrationDate: account ? account.createdAt : null,

        // ── Timestamps ─────────────────────────────────────────────────────
        createdAt: child.createdAt,
        updatedAt: (patient && patient.updatedAt) || child.updatedAt,
      };
    };

    // ────────────────────────────────────────────────────────────────────────
    // BRANCH 1 — Child ID input ({parentNationalId}-NN): look up Children directly
    // ────────────────────────────────────────────────────────────────────────
    if (isChildId) {
      const child = await Children.findOne({
        childRegistrationNumber: rawInput,
        isDeleted: { $ne: true },
      }).lean();

      console.log('📥 Child found:', child ? '✅' : '❌');

      if (!child) {
        return res.status(404).json({
          success: false,
          message: 'لم يتم العثور على الطفل برقم التسجيل المُدخل',
        });
      }

      const patientData = await buildChildResponse(child);
      console.log(
        '📤 Patient search response (child) keys:',
        Object.keys(patientData).length,
        '| Child ID:', patientData.childRegistrationNumber,
      );
      return res.json({ success: true, patient: patientData });
    }

    // ────────────────────────────────────────────────────────────────────────
    // BRANCH 2 — 11-digit national ID: Person first, then migrated Children
    // ────────────────────────────────────────────────────────────────────────
    const person = await Person.findOne({
      nationalId: rawInput,
      isDeleted: { $ne: true },
    }).lean();

    console.log('📥 Person found:', person ? '✅' : '❌');

    if (!person) {
      // Fallback: maybe this 11-digit number belongs to a child who has
      // already received their nationalId (migrationStatus: ready/migrated
      // but record still in children collection).
      const migratedChild = await Children.findOne({
        nationalId: rawInput,
        isDeleted: { $ne: true },
      }).lean();

      if (migratedChild) {
        console.log('📥 Migrated child found by nationalId: ✅');
        const patientData = await buildChildResponse(migratedChild);
        return res.json({ success: true, patient: patientData });
      }

      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على المريض',
      });
    }

    const patient = await Patient.findOne({ personId: person._id }).lean();
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على بيانات المريض',
      });
    }

    const account = await Account.findOne({ personId: person._id })
      .select('-password')
      .lean();

    // Explicit merge — do NOT rely on spread ordering, which can behave
    // unexpectedly when either document contains nested ObjectIds or arrays.
    // We build the response field-by-field so every medical attribute the
    // doctor's profile view reads is guaranteed to be at the top level.
    const patientData = {
      // ── Identity (from persons collection) ────────────────────────────────
      _id: person._id,
      nationalId: person.nationalId,
      childRegistrationNumber: null, // adults don't have a CRN
      isChild: false,
      firstName: person.firstName,
      fatherName: person.fatherName,
      lastName: person.lastName,
      motherName: person.motherName,
      dateOfBirth: person.dateOfBirth,
      gender: person.gender,
      maritalStatus: person.maritalStatus,
      occupation: person.occupation,
      education: person.education,
      phoneNumber: person.phoneNumber,
      alternativePhoneNumber: person.alternativePhoneNumber,
      governorate: person.governorate,
      city: person.city,
      district: person.district,
      street: person.street,
      building: person.building,
      address: person.address,
      profilePhoto: person.profilePhoto,
      isActive: person.isActive,

      // ── Medical profile (from patients collection) ────────────────────────
      patientRecordId: patient._id,
      bloodType: patient.bloodType,
      rhFactor: patient.rhFactor,
      height: patient.height,
      weight: patient.weight,
      bmi: patient.bmi,
      smokingStatus: patient.smokingStatus,
      alcoholConsumption: patient.alcoholConsumption,
      exerciseFrequency: patient.exerciseFrequency,
      dietType: patient.dietType,
      chronicDiseases: patient.chronicDiseases || [],
      allergies: patient.allergies || [],
      familyHistory: patient.familyHistory || [],
      currentMedications: patient.currentMedications || [],
      previousSurgeries: patient.previousSurgeries || [],
      emergencyContact: patient.emergencyContact,
      medicalCardNumber: patient.medicalCardNumber,
      totalVisits: patient.totalVisits || 0,
      lastVisitDate: patient.lastVisitDate,

      // ── Account metadata ──────────────────────────────────────────────────
      email: account?.email,
      accountActive: account?.isActive,
      registrationDate: account?.createdAt,

      // ── Misc the frontend may reference ───────────────────────────────────
      createdAt: person.createdAt,
      updatedAt: patient.updatedAt || person.updatedAt,
    };

    console.log(
      '📤 Patient search response keys:',
      Object.keys(patientData).length,
      '| bloodType:', patientData.bloodType,
      '| allergies:', Array.isArray(patientData.allergies) ? patientData.allergies.length : 'not array',
    );

    return res.json({ success: true, patient: patientData });
  } catch (error) {
    console.error('Search patient error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في البحث عن المريض',
    });
  }
});


/**
 * NOTE — GET /api/doctor/patients was removed (May 27, 2026).
 *   The previous endpoint returned every patient in the system to any
 *   authenticated doctor or dentist, which violates the minimum-necessary-
 *   access principle for medical records (ISO 18308:2011, HIPAA-equivalent).
 *   Patient lookup is now strictly identifier-based via /api/doctor/search/:nationalId.
 */


/**
 * @route   PUT /api/doctor/patient/:nationalId
 * @desc    Update patient medical data
 * @access  Private (Doctor only)
 */
router.put('/patient/:nationalId', protect, restrictTo('doctor', 'dentist'), async (req, res) => {
  try {
    const { nationalId } = req.params;
    const { doctorOpinion, ecgResults, aiPrediction, prescribedMedications } = req.body;

    const person = await Person.findOne({ nationalId });
    if (!person) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على المريض'
      });
    }

    const patient = await Patient.findOneAndUpdate(
      { personId: person._id },
      { $set: { doctorOpinion, ecgResults, aiPrediction, prescribedMedications } },
      { new: true }
    ).populate('personId');

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على بيانات المريض'
      });
    }

    return res.json({
      success: true,
      message: 'تم تحديث بيانات المريض بنجاح',
      patient
    });
  } catch (error) {
    console.error('Update patient error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحديث بيانات المريض'
    });
  }
});


// ============================================================================
// VISIT MANAGEMENT
// ============================================================================

/**
 * @route   POST /api/doctor/patient/:nationalId/visit
 * @desc    Create a new visit for a patient (with optional photo upload)
 * @access  Private (Doctor only)
 */
router.post(
  '/patient/:nationalId/visit',
  protect,
  restrictTo('doctor', 'dentist'),
  upload.single('visitPhoto'),
  visitController.createVisit
);

/**
 * @route   GET /api/doctor/patient/:nationalId/visits
 * @desc    Get all visits for a specific patient by national ID or CRN
 * @access  Private (Doctor only)
 *
 * The controller expects the URL param as `identifier` (it accepts both
 * national IDs and "CRN-..." child registration numbers). We translate
 * the param name here so the public URL shape stays stable.
 */
router.get(
  '/patient/:nationalId/visits',
  protect,
  restrictTo('doctor', 'dentist'),
  (req, res, next) => {
    req.params.identifier = req.params.nationalId;
    next();
  },
  visitController.getPatientVisits
);

/**
 * @route   GET /api/doctor/visits
 * @desc    Get all visits by this doctor
 * @access  Private (Doctor only)
 */
router.get(
  '/visits',
  protect,
  restrictTo('doctor', 'dentist'),
  visitController.getDoctorVisits
);

/**
 * @route   GET /api/doctor/visit/:visitId
 * @desc    Get visit details by visit ID
 * @access  Private (Doctor only)
 *
 * The controller expects the URL param as `id`. Translate here.
 */
router.get(
  '/visit/:visitId',
  protect,
  restrictTo('doctor', 'dentist'),
  (req, res, next) => {
    req.params.id = req.params.visitId;
    next();
  },
  visitController.getVisitById
);

/**
 * @route   PUT /api/doctor/visit/:visitId
 * @desc    Update a visit
 * @access  Private (Doctor only)
 */
router.put(
  '/visit/:visitId',
  protect,
  restrictTo('doctor', 'dentist'),
  visitController.updateVisit
);


// ============================================================================
// DASHBOARD KPIs
// ============================================================================

/**
 * @route   GET /api/doctor/dashboard/kpis
 * @desc    4 KPI numbers for the DoctorDashboard home tiles:
 *            - appointmentsToday
 *            - patientsThisWeek
 *            - pendingLabs
 *            - prescriptionsIssued
 * @access  Private (Doctor only)
 */
router.get('/dashboard/kpis', protect, restrictTo('doctor', 'dentist'), async (req, res) => {
  try {
    // ── Resolve provider (Doctor OR Dentist) ───────────────────────────
    const roles = req.user.roles || [];
    let providerType = null;
    let provider = null;

    if (roles.includes('doctor')) {
      provider = await Doctor.findOne({ personId: req.user.personId })
        .select('_id').lean();
      providerType = 'doctor';
    } else if (roles.includes('dentist')) {
      provider = await Dentist.findOne({ personId: req.user.personId })
        .select('_id').lean();
      providerType = 'dentist';
    }

    if (!provider) {
      return res.status(403).json({
        success: false,
        message: 'لم يتم العثور على ملف الطبيب أو طبيب الأسنان'
      });
    }

    // The field name on each downstream collection switches based on type
    const providerField = providerType === 'dentist' ? 'dentistId' : 'doctorId';

    // Date windows
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);

    const weekStart = new Date();
    const dayOfWeek = weekStart.getDay();                    // 0 = Sunday
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setDate(weekStart.getDate() - daysFromMonday);
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Lab tests are doctor-only (LabTest.orderedBy.ref = 'Doctor') so we
    // only count them when the caller is actually a doctor. Dentists get 0.
    const labCountPromise = providerType === 'doctor'
      ? LabTest.countDocuments({
          orderedBy: provider._id,
          status: 'completed',
          isViewedByDoctor: false
        })
      : Promise.resolve(0);

    const [appointmentsToday, pendingLabs, prescriptionsIssued, visitsThisWeek] =
      await Promise.all([
        Appointment.countDocuments({
          [providerField]: provider._id,
          appointmentDate: { $gte: todayStart, $lt: todayEnd },
          status: { $in: ['scheduled', 'confirmed', 'checked_in', 'in_progress'] }
        }),
        labCountPromise,
        Prescription.countDocuments({
          [providerField]: provider._id,
          prescriptionDate: { $gte: monthStart }
        }),
        Visit.find(
          { [providerField]: provider._id, visitDate: { $gte: weekStart } },
          { patientPersonId: 1, patientChildId: 1 }
        ).lean()
      ]);

    // Distinct patients this week (de-duplicate across persons + children)
    const unique = new Set();
    visitsThisWeek.forEach((v) => {
      if (v.patientPersonId) unique.add(`p:${v.patientPersonId}`);
      if (v.patientChildId) unique.add(`c:${v.patientChildId}`);
    });

    return res.json({
      success: true,
      providerType,
      appointmentsToday,
      patientsThisWeek: unique.size,
      pendingLabs,
      prescriptionsIssued
    });
  } catch (error) {
    console.error('Dashboard KPIs error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحميل مؤشرات اللوحة'
    });
  }
});


// ============================================================================
// APPOINTMENTS (alias to existing /api/appointments/provider-schedule)
// ============================================================================

/**
 * @route   GET /api/doctor/appointments
 * @desc    The doctor's appointments list (optional ?from=&to= date range).
 * @access  Private (Doctor only)
 */
router.get(
  '/appointments',
  protect,
  restrictTo('doctor', 'dentist'),
  appointmentController.getProviderSchedule
);


// ============================================================================
// AVAILABILITY SLOTS (alias to existing /api/slots endpoints)
// ============================================================================

/**
 * @route   GET /api/doctor/availability-slots
 * @desc    The doctor's availability slots.
 * @access  Private (Doctor only)
 */
router.get(
  '/availability-slots',
  protect,
  restrictTo('doctor', 'dentist'),
  slotController.getMySlots
);

/**
 * @route   POST /api/doctor/availability-slots
 * @desc    Create a new availability slot for the logged-in doctor.
 *          `injectDoctorContext` fills in `req.body.doctorId` automatically,
 *          so the frontend only needs to send the slot details themselves
 *          (date, startTime, endTime, slotDuration, maxBookings).
 * @access  Private (Doctor only)
 */
router.post(
  '/availability-slots',
  protect,
  restrictTo('doctor', 'dentist'),
  injectDoctorContext,              // ← auto-injects doctorId from the logged-in user
  slotController.createSlot
);

/**
 * @route   DELETE /api/doctor/availability-slots/:id
 * @desc    Delete one of the doctor's own availability slots.
 *          Refuses if there are active bookings — those must be cancelled
 *          first so patients aren't left without a valid appointment.
 * @access  Private (Doctor only)
 */
router.delete(
  '/availability-slots/:id',
  protect,
  restrictTo('doctor', 'dentist'),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          success: false,
          message: 'معرّف الموعد غير صالح'
        });
      }

      // ── Resolve provider (Doctor OR Dentist) ───────────────────────────
      const roles = req.user.roles || [];
      let provider = null;
      let ownerField = null;

      if (roles.includes('doctor')) {
        provider = await Doctor.findOne({ personId: req.user.personId })
          .select('_id').lean();
        ownerField = 'doctorId';
      } else if (roles.includes('dentist')) {
        provider = await Dentist.findOne({ personId: req.user.personId })
          .select('_id').lean();
        ownerField = 'dentistId';
      }

      if (!provider) {
        return res.status(403).json({
          success: false,
          message: 'لم يتم العثور على ملف المزود'
        });
      }

      const slot = await AvailabilitySlot.findById(id);
      if (!slot) {
        return res.status(404).json({
          success: false,
          message: 'الموعد غير موجود'
        });
      }

      // Ownership enforcement — a provider can only delete their own slots
      const slotOwnerId = slot[ownerField];
      if (!slotOwnerId || String(slotOwnerId) !== String(provider._id)) {
        return res.status(403).json({
          success: false,
          message: 'ليس لديك صلاحية لحذف هذا الموعد'
        });
      }

      if (typeof slot.currentBookings === 'number' && slot.currentBookings > 0) {
        return res.status(400).json({
          success: false,
          message: 'لا يمكن حذف موعد محجوز. يرجى إلغاء الحجز أولاً'
        });
      }

      await AvailabilitySlot.findByIdAndDelete(id);

      return res.json({
        success: true,
        message: 'تم حذف الموعد بنجاح'
      });
    } catch (error) {
      console.error('Provider delete slot error:', error);
      return res.status(500).json({
        success: false,
        message: 'حدث خطأ في حذف الموعد'
      });
    }
  }
);


// ============================================================================
// SCHEDULE TEMPLATE — NEW v2 (Calendly-style weekly schedule)
// ============================================================================

/**
 * @route   GET /api/doctor/schedule-template
 * @desc    Return the logged-in doctor's structured weekly schedule template.
 *          If the doctor has never saved one, returns a sane empty default.
 * @access  Private (Doctor only)
 */
router.get(
  '/schedule-template',
  protect,
  restrictTo('doctor', 'dentist'),
  injectDoctorContext,
  slotController.getScheduleTemplate
);

/**
 * @route   PUT /api/doctor/schedule-template
 * @desc    Save a new schedule template AND regenerate the doctor's
 *          availability_slots from it. Booked + blocked slots are preserved;
 *          only future unbooked slots are replaced.
 * @access  Private (Doctor only)
 *
 * Body: { scheduleTemplate: {...} } — matches Doctor.scheduleTemplate shape
 */
router.put(
  '/schedule-template',
  protect,
  restrictTo('doctor', 'dentist'),
  injectDoctorContext,
  slotController.updateScheduleTemplate
);

/**
 * @route   POST /api/doctor/schedule-template/regenerate
 * @desc    Regenerate availability_slots from the doctor's CURRENT schedule
 *          template, without changing the template itself. Useful for
 *          extending the booking window forward or recovering from mistaken
 *          manual deletions.
 * @access  Private (Doctor only)
 *
 * Body (optional): { daysAhead?: number }
 */
router.post(
  '/schedule-template/regenerate',
  protect,
  restrictTo('doctor', 'dentist'),
  injectDoctorContext,
  slotController.regenerateFromTemplate
);


// ============================================================================
// APPOINTMENT CANCELLATION (doctor-scoped)
// ============================================================================

/**
 * @route   PATCH /api/doctor/appointments/:id/cancel
 * @desc    Cancel a patient's appointment with this doctor. Verifies the
 *          appointment belongs to the caller, sets status=cancelled, records
 *          the reason, and releases the reserved slot so another patient can
 *          book it. This mirrors the patient-side cancel handler but is
 *          doctor-scoped so the doctor can cancel any of their own
 *          appointments regardless of which patient booked.
 *          Body: { reason?, notes? }
 * @access  Private (Doctor only)
 */
router.patch(
  '/appointments/:id/cancel',
  protect,
  restrictTo('doctor', 'dentist'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason = 'doctor_unavailable', notes } = req.body || {};

      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          success: false,
          message: 'معرّف الموعد غير صالح'
        });
      }

      const VALID_REASONS = [
        'patient_request', 'doctor_unavailable',
        'emergency', 'duplicate', 'other'
      ];
      if (!VALID_REASONS.includes(reason)) {
        return res.status(400).json({
          success: false,
          message: 'سبب الإلغاء غير صالح'
        });
      }

      // ── Resolve provider (Doctor OR Dentist) ───────────────────────────
      const roles = req.user.roles || [];
      let provider = null;
      let providerField = null;

      if (roles.includes('doctor')) {
        provider = await Doctor.findOne({ personId: req.user.personId })
          .select('_id').lean();
        providerField = 'doctorId';
      } else if (roles.includes('dentist')) {
        provider = await Dentist.findOne({ personId: req.user.personId })
          .select('_id').lean();
        providerField = 'dentistId';
      }

      if (!provider) {
        return res.status(403).json({
          success: false,
          message: 'لم يتم العثور على ملف المزود'
        });
      }

      const appointment = await Appointment.findOne({
        _id: id,
        [providerField]: provider._id
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: 'الموعد غير موجود أو ليس من مواعيدك'
        });
      }

      // Only allow cancellation of appointments that haven't happened yet
      const CANCELLABLE = ['scheduled', 'confirmed', 'checked_in'];
      if (!CANCELLABLE.includes(appointment.status)) {
        return res.status(400).json({
          success: false,
          message: `لا يمكن إلغاء موعد بحالة "${appointment.status}"`
        });
      }

      appointment.status = 'cancelled';
      appointment.cancellationReason = reason;
      appointment.cancelledAt = new Date();
      appointment.cancelledBy = req.user._id;
      if (notes && notes.trim()) {
        appointment.notes = (appointment.notes || '') + `\n[إلغاء الطبيب: ${notes.trim()}]`;
      }
      await appointment.save();

      // Release the slot so it's bookable again
      if (appointment.slotId) {
        await AvailabilitySlot.findByIdAndUpdate(
          appointment.slotId,
          {
            $inc: { currentBookings: -1 },
            $set: { status: 'available', isAvailable: true }
          }
        ).catch((err) => {
          console.error('Failed to release slot after doctor cancel:', err);
        });
      }

      return res.json({
        success: true,
        message: 'تم إلغاء الموعد بنجاح',
        appointment
      });

    } catch (error) {
      console.error('Doctor cancel appointment error:', error);

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'بيانات غير صحيحة',
          errors: Object.values(error.errors).map(e => e.message)
        });
      }

      return res.status(500).json({
        success: false,
        message: 'حدث خطأ في إلغاء الموعد'
      });
    }
  }
);


// ============================================================================
// NOTIFICATIONS (alias to existing /api/notifications endpoints)
// ============================================================================

/**
 * @route   GET /api/doctor/notifications
 * @desc    The doctor's notifications (most recent first).
 * @access  Private (Doctor only)
 */
router.get(
  '/notifications',
  protect,
  restrictTo('doctor', 'dentist'),
  notificationController.getMyNotifications
);

/**
 * @route   PATCH /api/doctor/notifications/:id/read
 * @desc    Mark a notification as read.
 * @access  Private (Doctor only)
 */
router.patch(
  '/notifications/:id/read',
  protect,
  restrictTo('doctor', 'dentist'),
  notificationController.markAsRead
);


module.exports = router;