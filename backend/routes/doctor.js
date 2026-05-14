/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Patient 360° — Doctor Routes
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at:  /api/doctor
 *
 *  All routes require:
 *    1. Authentication  (protect)
 *    2. Doctor role     (restrictTo('doctor'))
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
const Account = require('../models/Account');
const Doctor = require('../models/Doctor');
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
 * Resolves the logged-in doctor's Doctor document and injects its _id into
 * req.body.doctorId before the shared slot controller runs.
 *
 * The frontend should never send doctorId itself — that's a security concern
 * (a doctor could otherwise create slots for a different doctor's calendar).
 * This middleware enforces "the slot always belongs to the caller".
 *
 * Also sets req.doctorId for handlers that don't read from req.body
 * (e.g. GET requests).
 */
async function injectDoctorContext(req, res, next) {
  try {
    const doctor = await Doctor.findOne({ personId: req.user.personId })
      .select('_id')
      .lean();

    if (!doctor) {
      return res.status(403).json({
        success: false,
        message: 'لم يتم العثور على ملف الطبيب'
      });
    }

    req.body = req.body || {};
    req.body.doctorId = String(doctor._id);
    req.doctorId = doctor._id;

    return next();
  } catch (error) {
    console.error('injectDoctorContext error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحديد هوية الطبيب'
    });
  }
}


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
 * @desc    Search for a patient by national ID
 * @access  Private (Doctor only)
 */
router.get('/search/:nationalId', protect, restrictTo('doctor'), async (req, res) => {
  try {
    const { nationalId } = req.params;
    console.log('🔍 Searching for:', nationalId);

    const person = await Person.findOne({
      $or: [
        { nationalId: nationalId },
        { childId: nationalId }
      ]
    }).lean();

    console.log('📥 Person found:', person ? '✅' : '❌');

    if (!person) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على المريض'
      });
    }

    const patient = await Patient.findOne({ personId: person._id }).lean();
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على بيانات المريض'
      });
    }

    const account = await Account.findOne({ personId: person._id }).select('-password').lean();

    // Explicit merge — do NOT rely on spread ordering, which can behave
    // unexpectedly when either document contains nested ObjectIds or arrays.
    // We build the response field-by-field so every medical attribute the
    // doctor's profile view reads is guaranteed to be at the top level.
    const patientData = {
      // ── Identity (from persons collection) ────────────────────────────────
      _id: person._id,
      nationalId: person.nationalId,
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
      updatedAt: patient.updatedAt || person.updatedAt
    };

    console.log(
      '📤 Patient search response keys:',
      Object.keys(patientData).length,
      '| bloodType:', patientData.bloodType,
      '| allergies:', Array.isArray(patientData.allergies) ? patientData.allergies.length : 'not array'
    );

    return res.json({ success: true, patient: patientData });
  } catch (error) {
    console.error('Search patient error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في البحث عن المريض'
    });
  }
});


/**
 * @route   GET /api/doctor/patients
 * @desc    Get all patients
 * @access  Private (Doctor only)
 */
router.get('/patients', protect, restrictTo('doctor'), async (req, res) => {
  try {
    const patients = await Patient.find().populate('personId').lean();

    const patientData = await Promise.all(
      patients.map(async (patient) => {
        const account = await Account.findOne({ personId: patient.personId._id })
          .select('email isActive createdAt')
          .lean();

        return {
          id: patient._id,
          nationalId: patient.personId.nationalId,
          childId: patient.personId.childId,
          firstName: patient.personId.firstName,
          lastName: patient.personId.lastName,
          dateOfBirth: patient.personId.dateOfBirth,
          gender: patient.personId.gender,
          phoneNumber: patient.personId.phoneNumber,
          email: account?.email,
          isActive: account?.isActive,
          registrationDate: account?.createdAt,
          bloodType: patient.bloodType,
          height: patient.height,
          weight: patient.weight,
          doctorOpinion: patient.doctorOpinion,
          prescribedMedications: patient.prescribedMedications,
          lastUpdated: patient.updatedAt
        };
      })
    );

    return res.json({ success: true, count: patientData.length, patients: patientData });
  } catch (error) {
    console.error('Get patients error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب قائمة المرضى'
    });
  }
});


/**
 * @route   PUT /api/doctor/patient/:nationalId
 * @desc    Update patient medical data
 * @access  Private (Doctor only)
 */
router.put('/patient/:nationalId', protect, restrictTo('doctor'), async (req, res) => {
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
  restrictTo('doctor'),
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
  restrictTo('doctor'),
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
  restrictTo('doctor'),
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
  restrictTo('doctor'),
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
  restrictTo('doctor'),
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
router.get('/dashboard/kpis', protect, restrictTo('doctor'), async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ personId: req.user.personId }).lean();
    if (!doctor) {
      return res.status(403).json({
        success: false,
        message: 'لم يتم العثور على ملف الطبيب'
      });
    }

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

    const [appointmentsToday, pendingLabs, prescriptionsIssued, visitsThisWeek] =
      await Promise.all([
        Appointment.countDocuments({
          doctorId: doctor._id,
          appointmentDate: { $gte: todayStart, $lt: todayEnd },
          status: { $in: ['scheduled', 'confirmed', 'checked_in', 'in_progress'] }
        }),
        LabTest.countDocuments({
          orderedBy: doctor._id,
          status: 'completed',
          isViewedByDoctor: false
        }),
        Prescription.countDocuments({
          doctorId: doctor._id,
          prescriptionDate: { $gte: monthStart }
        }),
        Visit.find(
          { doctorId: doctor._id, visitDate: { $gte: weekStart } },
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
  restrictTo('doctor'),
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
  restrictTo('doctor'),
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
  restrictTo('doctor'),
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
  restrictTo('doctor'),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          success: false,
          message: 'معرّف الموعد غير صالح'
        });
      }

      const doctor = await Doctor.findOne({ personId: req.user.personId })
        .select('_id')
        .lean();
      if (!doctor) {
        return res.status(403).json({
          success: false,
          message: 'لم يتم العثور على ملف الطبيب'
        });
      }

      const slot = await AvailabilitySlot.findById(id);
      if (!slot) {
        return res.status(404).json({
          success: false,
          message: 'الموعد غير موجود'
        });
      }

      // Ownership enforcement — a doctor cannot delete another doctor's slot
      if (!slot.doctorId || String(slot.doctorId) !== String(doctor._id)) {
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
      console.error('Doctor delete slot error:', error);
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
  restrictTo('doctor'),
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
  restrictTo('doctor'),
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
  restrictTo('doctor'),
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
  restrictTo('doctor'),
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

      const doctor = await Doctor.findOne({ personId: req.user.personId })
        .select('_id')
        .lean();
      if (!doctor) {
        return res.status(403).json({
          success: false,
          message: 'لم يتم العثور على ملف الطبيب'
        });
      }

      const appointment = await Appointment.findOne({
        _id: id,
        doctorId: doctor._id
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
  restrictTo('doctor'),
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
  restrictTo('doctor'),
  notificationController.markAsRead
);


module.exports = router;
