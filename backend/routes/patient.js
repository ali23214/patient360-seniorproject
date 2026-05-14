/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Patient Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at /api/patient
 *
 *  Canonical routes:
 *    GET   /me                      — current logged-in patient profile
 *    GET   /me/visits               — current patient's visits
 *    GET   /me/lab-tests            — current patient's lab tests
 *    GET   /me/prescriptions        — current patient's prescriptions
 *    GET   /me/appointments         — current patient's appointments
 *    GET   /me/medical-summary      — internal summary
 *
 *  Dashboard routes (PatientDashboard.jsx via patientAPI):
 *    GET   /profile                 — { person, child, patient, isMinor }
 *    PATCH /profile                 — update patient identity + medical info
 *    GET   /overview                — flat counts + recentActivity
 *    GET   /notifications           — patient's in-app notifications
 *    GET   /reviews                 — reviews written by the patient
 *    GET   /emergency-reports       — patient's emergency reports
 *    GET   /doctors?specialization=X — browse doctors for booking
 *    GET   /doctors/:doctorId/slots — available time slots for a doctor
 *    POST  /appointments            — book a new appointment
 *    PATCH /appointments/:id/cancel — cancel own appointment + release slot
 *
 *    (GET-only aliases via middleware rewrite)
 *    GET  /visits                   → /me/visits
 *    GET  /appointments             → /me/appointments
 *    GET  /prescriptions            → /me/prescriptions
 *    GET  /lab-tests                → /me/lab-tests
 *
 *  Lookup routes (admin / clinical staff):
 *    GET  /:identifier              — patient by nationalId or CRN
 *    GET  /:identifier/visits
 *    GET  /:identifier/lab-tests
 *    GET  /:identifier/prescriptions
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

const {
  Person, Children, Patient, Visit,
  LabTest, Prescription, Appointment, AuditLog,
  Notification, Review, EmergencyReport, Doctor,
  AvailabilitySlot
} = require('../models');

const { protect, authorize } = require('../middleware/auth');

// ============================================================================
// POPULATE SPECS — single source of truth
// ----------------------------------------------------------------------------
// These resolve the doctor/dentist's display name by ALSO populating the
// nested `personId` reference (where firstName/fatherName/lastName live).
//
// Why this matters:
//   Without `personId` populated, the frontend helper getDoctorInfo() in
//   detailHelpers.js cannot compose a display name. It then falls back to
//   showing the localized specialization label, which makes the doctor
//   row look like it's missing the doctor's name (and instead repeats
//   the specialization). The bug surfaces on VisitDetailPage, Appointment
//   DetailPage, PrescriptionDetailPage, and LabResultDetailPage.
//
// Convention: keep these as plain objects (not functions) so each route
// gets a fresh literal at call time and Mongoose can't mutate a shared
// reference accidentally.
// ============================================================================

const DOCTOR_REF_POPULATE = {
  path: 'doctorId',
  select: 'specialization medicalLicenseNumber personId',
  populate: { path: 'personId', select: 'firstName fatherName lastName' }
};

const DENTIST_REF_POPULATE = {
  path: 'dentistId',
  select: 'specialization dentalLicenseNumber personId',
  populate: { path: 'personId', select: 'firstName fatherName lastName' }
};

// Used by LabTest where the ordering doctor lives in `orderedBy`
const ORDERED_BY_REF_POPULATE = {
  path: 'orderedBy',
  select: 'specialization medicalLicenseNumber personId',
  populate: { path: 'personId', select: 'firstName fatherName lastName' }
};

// ============================================================================
// MIDDLEWARE — verify patient ownership or admin/doctor access
// ============================================================================

async function verifyPatientAccess(req, res, next) {
  try {
    const { identifier } = req.params;
    const account = req.account;

    let targetRef = null;

    if (/^\d{11}$/.test(identifier)) {
      const adult = await Person.findOne({ nationalId: identifier }).lean();
      if (adult) {
        targetRef = { patientPersonId: adult._id };
      } else {
        const child = await Children.findOne({ nationalId: identifier }).lean();
        if (child) targetRef = { patientChildId: child._id };
      }
    } else if (identifier.startsWith('CRN-')) {
      const child = await Children.findOne({
        childRegistrationNumber: identifier
      }).lean();
      if (child) targetRef = { patientChildId: child._id };
    }

    if (!targetRef) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على المريض'
      });
    }

    const isAdmin = account.roles.includes('admin');
    const isClinical = account.roles.some(r =>
      ['doctor', 'dentist', 'pharmacist', 'lab_technician'].includes(r)
    );
    const isOwner =
      (targetRef.patientPersonId && String(targetRef.patientPersonId) === String(account.personId))
      || (targetRef.patientChildId && String(targetRef.patientChildId) === String(account.childId));

    if (!isOwner && !isAdmin && !isClinical) {
      console.log('❌ Patient access denied');
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية للوصول لبيانات هذا المريض'
      });
    }

    req.targetPatient = targetRef;
    return next();
  } catch (error) {
    console.error('verifyPatientAccess error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في التحقق من الصلاحيات'
    });
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function currentPatientRef(account) {
  if (account.personId) return { patientPersonId: account.personId };
  if (account.childId) return { patientChildId: account.childId };
  return null;
}

async function buildProfilePayload(account) {
  const identityDoc = account.personId
    ? await Person.findById(account.personId).lean()
    : await Children.findById(account.childId).lean();

  if (!identityDoc) return null;

  const identityWithEmail = {
    ...identityDoc,
    email: identityDoc.email || account.email
  };

  const patientQuery = account.personId
    ? { personId: account.personId }
    : { childId: account.childId };
  const patientDoc = await Patient.findOne(patientQuery).lean();

  return {
    success: true,
    isMinor: !!account.childId,
    person:  account.personId ? identityWithEmail : null,
    child:   account.childId  ? identityWithEmail : null,
    patient: patientDoc || null,
    accountId: account._id
  };
}

// ============================================================================
// LEGACY PATH ALIASES (URL rewrite) — GET ONLY
// ============================================================================

const LEGACY_PATIENT_ALIASES = {
  '/visits':        '/me/visits',
  '/appointments':  '/me/appointments',
  '/prescriptions': '/me/prescriptions',
  '/lab-tests':     '/me/lab-tests'
};

router.use((req, res, next) => {
  if (req.method !== 'GET') return next();

  const qIndex = req.url.indexOf('?');
  const path = qIndex === -1 ? req.url : req.url.slice(0, qIndex);
  const qs   = qIndex === -1 ? ''      : req.url.slice(qIndex);

  const canonical = LEGACY_PATIENT_ALIASES[path];
  if (canonical) {
    console.log(`↪️  Patient route alias: ${path} → ${canonical}`);
    req.url = canonical + qs;
  }
  return next();
});

// ============================================================================
// DEDICATED DASHBOARD HANDLERS
// ============================================================================

/**
 * @route   GET /api/patient/profile
 */
router.get('/profile', protect, authorize('patient'), async (req, res) => {
  try {
    const payload = await buildProfilePayload(req.account);
    if (!payload) {
      return res.status(404).json({
        success: false,
        message: 'بيانات المريض غير موجودة'
      });
    }
    return res.json(payload);
  } catch (error) {
    console.error('GET /profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب البيانات'
    });
  }
});

/**
 * @route   PATCH /api/patient/profile
 */
router.patch('/profile', protect, authorize('patient'), async (req, res) => {
  try {
    const account = req.account;
    const body = req.body || {};

    const IDENTITY_FIELDS = [
      'phoneNumber', 'alternativePhoneNumber',
      'address', 'governorate', 'city'
    ];
    const MEDICAL_FIELDS = [
      'bloodType', 'height', 'weight', 'smokingStatus',
      'allergies', 'chronicDiseases', 'emergencyContact'
    ];

    const identityUpdates = {};
    for (const f of IDENTITY_FIELDS) {
      if (body[f] !== undefined) identityUpdates[f] = body[f];
    }

    const medicalUpdates = {};
    for (const f of MEDICAL_FIELDS) {
      if (body[f] !== undefined) medicalUpdates[f] = body[f];
    }

    if (Object.keys(identityUpdates).length > 0) {
      if (account.personId) {
        await Person.findByIdAndUpdate(
          account.personId,
          { $set: identityUpdates },
          { runValidators: true }
        );
      } else if (account.childId) {
        await Children.findByIdAndUpdate(
          account.childId,
          { $set: identityUpdates },
          { runValidators: true }
        );
      }
    }

    if (Object.keys(medicalUpdates).length > 0) {
      const patientQuery = account.personId
        ? { personId: account.personId }
        : { childId: account.childId };

      const setOnInsert = account.personId
        ? { personId: account.personId }
        : { childId: account.childId };

      await Patient.findOneAndUpdate(
        patientQuery,
        {
          $set: medicalUpdates,
          $setOnInsert: setOnInsert
        },
        { upsert: true, runValidators: true, new: true }
      );
    }

    AuditLog.record({
      userId: account._id,
      userEmail: account.email,
      action: 'UPDATE_OWN_PROFILE',
      description: 'Patient updated their own profile',
      resourceType: 'patient',
      resourceId: account.personId || account.childId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        identityFieldsChanged: Object.keys(identityUpdates),
        medicalFieldsChanged: Object.keys(medicalUpdates)
      }
    }).catch((err) => console.error('Audit log error:', err));

    const payload = await buildProfilePayload(account);
    return res.json(payload);

  } catch (error) {
    console.error('PATCH /profile error:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير صحيحة',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }

    if (error.code === 121) {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير صحيحة (فشل التحقق من المخطط)',
        details: error.errInfo || null
      });
    }

    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في حفظ التعديلات'
    });
  }
});

/**
 * @route   GET /api/patient/overview
 */
router.get('/overview', protect, authorize('patient'), async (req, res) => {
  try {
    const ref = currentPatientRef(req.account);
    if (!ref) {
      return res.status(400).json({
        success: false,
        message: 'الحساب غير مرتبط بمريض'
      });
    }

    const now = new Date();

    const [
      upcomingAppointments,
      activePrescriptions,
      pendingLabResults,
      unreadNotifications,
      nextAppointment,
      lastVisit
    ] = await Promise.all([
      Appointment.countDocuments({
        ...ref,
        appointmentDate: { $gte: now },
        status: { $in: ['scheduled', 'confirmed', 'checked_in'] }
      }),
      Prescription.countDocuments({
        ...ref,
        status: { $in: ['active', 'partially_dispensed'] }
      }),
      LabTest.countDocuments({
        ...ref,
        status: { $in: ['ordered', 'scheduled', 'sample_collected', 'in_progress'] }
      }),
      Notification.countDocuments({
        recipientId: req.account._id,
        status: { $in: ['pending', 'sent', 'delivered'] }
      }),
      Appointment.findOne({
        ...ref,
        appointmentDate: { $gte: now },
        status: { $in: ['scheduled', 'confirmed'] }
      })
        .sort({ appointmentDate: 1 })
        .populate(DOCTOR_REF_POPULATE)
        .populate(DENTIST_REF_POPULATE)
        .lean(),
      Visit.findOne(ref)
        .sort({ visitDate: -1 })
        .populate(DOCTOR_REF_POPULATE)
        .lean()
    ]);

    return res.json({
      success: true,
      upcomingAppointments,
      activePrescriptions,
      pendingLabResults,
      unreadNotifications,
      nextAppointment,
      lastVisit,
      recentActivity: []
    });
  } catch (error) {
    console.error('GET /overview error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب البيانات'
    });
  }
});

/**
 * @route   GET /api/patient/notifications
 */
router.get('/notifications', protect, authorize('patient'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const notifications = await Notification.find({
      recipientId: req.account._id
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unreadCount = await Notification.countDocuments({
      recipientId: req.account._id,
      status: { $in: ['pending', 'sent', 'delivered'] }
    });

    return res.json({
      success: true,
      count: notifications.length,
      unreadCount,
      notifications
    });
  } catch (error) {
    console.error('GET /notifications error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الإشعارات'
    });
  }
});

// ============================================================================
// POST aliases for mobile compatibility
// ----------------------------------------------------------------------------
// The mobile app's notifications_repository.dart calls these endpoints
// using POST (not PATCH). We expose POST aliases that simply forward to
// the same handler logic via internal middleware redirect.
// ============================================================================

router.post('/notifications/read-all', protect, authorize('patient'), async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        recipientId: req.account._id,
        recipientType: 'patient',
        status: { $ne: 'read' }
      },
      {
        $set: { status: 'read', readAt: new Date() }
      }
    );

    return res.json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('POST /notifications/read-all error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحديث الإشعارات'
    });
  }
});

router.post('/notifications/:id/read', protect, authorize('patient'), async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId format (24-character hex string).
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف الإشعار غير صالح'
      });
    }

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'الإشعار غير موجود'
      });
    }

    // Ownership check — prevent access to other users' notifications.
    if (String(notification.recipientId) !== String(req.account._id)) {
      return res.status(403).json({
        success: false,
        message: 'لا يمكنك الوصول إلى هذا الإشعار'
      });
    }

    // Idempotent — already read.
    if (notification.status === 'read') {
      return res.json({
        success: true,
        notification,
        message: 'الإشعار مقروء مسبقاً'
      });
    }

    notification.status = 'read';
    notification.readAt = new Date();
    await notification.save();

    return res.json({
      success: true,
      notification
    });
  } catch (error) {
    console.error('POST /notifications/:id/read error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحديث حالة الإشعار'
    });
  }
});
router.patch('/notifications/read-all', protect, authorize('patient'), async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        recipientId: req.account._id,
        recipientType: 'patient',
        status: { $ne: 'read' }
      },
      {
        $set: { status: 'read', readAt: new Date() }
      }
    );

    return res.json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('PATCH /notifications/read-all error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحديث الإشعارات'
    });
  }
});

// ============================================================================
// PATCH /api/patient/notifications/:id/read
// ---------------------------------------------------------------------------
router.patch('/notifications/:id/read', protect, authorize('patient'), async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId format (24-character hex string).
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف الإشعار غير صالح'
      });
    }

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'الإشعار غير موجود'
      });
    }

    // Ownership check — prevent access to other users' notifications.
    if (String(notification.recipientId) !== String(req.account._id)) {
      return res.status(403).json({
        success: false,
        message: 'لا يمكنك الوصول إلى هذا الإشعار'
      });
    }

    // Idempotent — already read.
    if (notification.status === 'read') {
      return res.json({
        success: true,
        notification,
        message: 'الإشعار مقروء مسبقاً'
      });
    }

    notification.status = 'read';
    notification.readAt = new Date();
    await notification.save();

    return res.json({
      success: true,
      notification
    });
  } catch (error) {
    console.error('PATCH /notifications/:id/read error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحديث حالة الإشعار'
    });
  }
});


/**
 * @route   GET /api/patient/reviews
 */
router.get('/reviews', protect, authorize('patient'), async (req, res) => {
  try {
    const reviewerRef = req.account.personId
      ? { reviewerPersonId: req.account.personId }
      : { reviewerChildId: req.account.childId };

    const reviews = await Review.find(reviewerRef)
      .populate(DOCTOR_REF_POPULATE)
      .populate(DENTIST_REF_POPULATE)
      .populate('laboratoryId', 'name arabicName')
      .populate('pharmacyId', 'name arabicName')
      .populate('hospitalId', 'name arabicName')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      count: reviews.length,
      reviews
    });
  } catch (error) {
    console.error('GET /reviews error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب التقييمات'
    });
  }
});

/**
 * @route   GET /api/patient/emergency-reports
 */
router.get('/emergency-reports', protect, authorize('patient'), async (req, res) => {
  try {
    const ref = currentPatientRef(req.account);
    if (!ref) {
      return res.status(400).json({
        success: false,
        message: 'الحساب غير مرتبط بمريض'
      });
    }

    const reports = await EmergencyReport.find(ref)
      .sort({ reportedAt: -1 })
      .lean();

    return res.json({
      success: true,
      count: reports.length,
      reports,
      emergencyReports: reports
    });
  } catch (error) {
    console.error('GET /emergency-reports error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب تقارير الطوارئ'
    });
  }
});

/**
 * @route   GET /api/patient/doctors?specialization=...
 */
router.get('/doctors', protect, authorize('patient'), async (req, res) => {
  try {
    const query = {
      isAvailable: true,
      isAcceptingNewPatients: true,
      verificationStatus: 'verified'
    };

    if (req.query.specialization) {
      query.specialization = req.query.specialization;
    }

    const doctors = await Doctor.find(query)
      .populate('personId', 'firstName fatherName lastName gender profilePhoto phoneNumber governorate city')
      .populate('hospitalId', 'name arabicName governorate city')
      .sort({ averageRating: -1, totalReviews: -1 })
      .lean();

    const doctorsFlat = doctors.map(d => ({
      ...d,
      firstName:  d.personId?.firstName,
      fatherName: d.personId?.fatherName,
      lastName:   d.personId?.lastName,
      fullName:   [d.personId?.firstName, d.personId?.fatherName, d.personId?.lastName]
                    .filter(Boolean).join(' '),
      gender:       d.personId?.gender,
      profilePhoto: d.personId?.profilePhoto,
      phoneNumber:  d.personId?.phoneNumber,
      governorate:  d.personId?.governorate,
      city:         d.personId?.city,
      hospital:     d.hospitalId
    }));

    return res.json({
      success: true,
      count: doctorsFlat.length,
      doctors: doctorsFlat
    });
  } catch (error) {
    console.error('GET /doctors error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب قائمة الأطباء'
    });
  }
});

/**
 * @route   GET /api/patient/doctors/:doctorId/slots
 */
router.get('/doctors/:doctorId/slots', protect, authorize('patient'), async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!doctorId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف الطبيب غير صالح'
      });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const slots = await AvailabilitySlot.find({
      doctorId,
      date: { $gte: startOfToday },
      isAvailable: true,
      status: { $in: ['available', 'booked'] }
    })
      .sort({ date: 1, startTime: 1 })
      .lean();

    const slotsWithFlag = slots.map(s => ({
      ...s,
      isBooked:
        s.status !== 'available' ||
        (typeof s.currentBookings === 'number' &&
         typeof s.maxBookings === 'number' &&
         s.currentBookings >= s.maxBookings)
    }));

    return res.json({
      success: true,
      count: slotsWithFlag.length,
      slots: slotsWithFlag
    });
  } catch (error) {
    console.error('GET /doctors/:doctorId/slots error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب المواعيد المتاحة'
    });
  }
});

/**
 * @route   POST /api/patient/appointments
 * @desc    Book a new appointment against an availability slot with atomic
 *          slot reservation.
 */
router.post('/appointments', protect, authorize('patient'), async (req, res) => {
  try {
    const account = req.account;
    const ref = currentPatientRef(account);
    if (!ref) {
      return res.status(400).json({
        success: false,
        message: 'الحساب غير مرتبط بمريض'
      });
    }

    const { slotId, appointmentType, reasonForVisit, priority } = req.body || {};

    if (!slotId || !String(slotId).match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف الموعد غير صالح'
      });
    }
    if (!appointmentType) {
      return res.status(400).json({
        success: false,
        message: 'نوع الموعد مطلوب'
      });
    }
    if (!reasonForVisit || !reasonForVisit.trim()) {
      return res.status(400).json({
        success: false,
        message: 'سبب الزيارة مطلوب'
      });
    }

    const reservedSlot = await AvailabilitySlot.findOneAndUpdate(
      {
        _id: slotId,
        isAvailable: true,
        status: 'available',
        $expr: { $lt: ['$currentBookings', '$maxBookings'] }
      },
      { $inc: { currentBookings: 1 } },
      { new: true }
    );

    if (!reservedSlot) {
      return res.status(409).json({
        success: false,
        message: 'الموعد لم يعد متاحاً، يرجى اختيار موعد آخر'
      });
    }

    if (reservedSlot.currentBookings >= reservedSlot.maxBookings) {
      reservedSlot.status = 'booked';
      await reservedSlot.save();
    }

    const appointmentData = {
      ...ref,
      appointmentType,
      appointmentDate: reservedSlot.date,
      appointmentTime: reservedSlot.startTime,
      reasonForVisit: reasonForVisit.trim(),
      priority: priority || 'routine',
      status: 'scheduled',
      bookingMethod: 'online',
      slotId: reservedSlot._id,
      paymentStatus: 'pending'
    };

    if (reservedSlot.doctorId)     appointmentData.doctorId     = reservedSlot.doctorId;
    if (reservedSlot.dentistId)    appointmentData.dentistId    = reservedSlot.dentistId;
    if (reservedSlot.laboratoryId) appointmentData.laboratoryId = reservedSlot.laboratoryId;
    if (reservedSlot.hospitalId)   appointmentData.hospitalId   = reservedSlot.hospitalId;

    let appointment;
    try {
      appointment = await Appointment.create(appointmentData);
    } catch (createError) {
      await AvailabilitySlot.findByIdAndUpdate(reservedSlot._id, {
        $inc: { currentBookings: -1 },
        $set: { status: 'available' }
      }).catch(() => {});
      throw createError;
    }

    AuditLog.record({
      userId: account._id,
      userEmail: account.email,
      action: 'BOOK_APPOINTMENT',
      description: `Patient booked ${appointmentType} appointment`,
      resourceType: 'appointment',
      resourceId: appointment._id,
      ipAddress: req.ip || 'unknown',
      success: true
    }).catch((err) => console.error('Audit log error:', err));

    return res.status(201).json({
      success: true,
      message: 'تم حجز الموعد بنجاح',
      appointment
    });

  } catch (error) {
    console.error('POST /appointments error:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'بيانات غير صحيحة',
        errors: Object.values(error.errors).map(e => e.message)
      });
    }

    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في حجز الموعد'
    });
  }
});

/**
 * @route   PATCH /api/patient/appointments/:id/cancel
 * @desc    Cancel one of the current patient's own appointments. Releases
 *          the reserved slot so another patient can book it.
 *          Body: { cancellationReason }
 * @access  Private (patient)
 */
router.patch('/appointments/:id/cancel', protect, authorize('patient'), async (req, res) => {
  try {
    const account = req.account;
    const ref = currentPatientRef(account);
    if (!ref) {
      return res.status(400).json({
        success: false,
        message: 'الحساب غير مرتبط بمريض'
      });
    }

    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف الموعد غير صالح'
      });
    }

    const { cancellationReason } = req.body || {};
    const VALID_REASONS = [
      'patient_request', 'doctor_unavailable',
      'emergency', 'duplicate', 'other'
    ];
    const reason = cancellationReason || 'patient_request';
    if (!VALID_REASONS.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: 'سبب الإلغاء غير صالح'
      });
    }

    // Find the appointment AND verify it belongs to the caller
    const appointment = await Appointment.findOne({ _id: id, ...ref });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على هذا الموعد'
      });
    }

    // Only appointments that haven't happened yet can be cancelled
    const CANCELLABLE_STATUSES = ['scheduled', 'confirmed', 'checked_in'];
    if (!CANCELLABLE_STATUSES.includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        message: `لا يمكن إلغاء موعد بحالة "${appointment.status}"`
      });
    }

    // Update the appointment
    appointment.status = 'cancelled';
    appointment.cancellationReason = reason;
    appointment.cancelledAt = new Date();
    appointment.cancelledBy = account._id;
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
        console.error('Failed to release slot after cancel:', err);
      });
    }

    AuditLog.record({
      userId: account._id,
      userEmail: account.email,
      action: 'CANCEL_APPOINTMENT',
      description: `Patient cancelled appointment (reason: ${reason})`,
      resourceType: 'appointment',
      resourceId: appointment._id,
      ipAddress: req.ip || 'unknown',
      success: true
    }).catch((err) => console.error('Audit log error:', err));

    return res.json({
      success: true,
      message: 'تم إلغاء الموعد بنجاح',
      appointment
    });

  } catch (error) {
    console.error('PATCH /appointments/:id/cancel error:', error);

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
});

// ============================================================================
// ME ROUTES — current logged-in patient (canonical)
// ============================================================================

router.get('/me', protect, authorize('patient'), async (req, res) => {
  try {
    const account = req.account;

    const profile = account.personId
      ? await Person.findById(account.personId).lean()
      : await Children.findById(account.childId).lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'بيانات المريض غير موجودة'
      });
    }

    const patientQuery = account.personId
      ? { personId: account.personId }
      : { childId: account.childId };
    const patient = await Patient.findOne(patientQuery).lean();

    return res.json({
      success: true,
      patient: {
        accountId: account._id,
        email: account.email,
        isMinor: !!account.childId,
        ...profile,
        medical: patient || null
      }
    });
  } catch (error) {
    console.error('GET /me error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب البيانات'
    });
  }
});

router.get('/me/visits', protect, authorize('patient'), async (req, res) => {
  try {
    const ref = currentPatientRef(req.account);
    if (!ref) {
      return res.status(400).json({
        success: false,
        message: 'الحساب غير مرتبط بمريض'
      });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const [visits, total] = await Promise.all([
      Visit.find(ref)
        .populate(DOCTOR_REF_POPULATE)
        .populate('hospitalId', 'name arabicName')
        .sort({ visitDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Visit.countDocuments(ref)
    ]);

    return res.json({
      success: true,
      count: total,
      page,
      pages: Math.ceil(total / limit),
      visits
    });
  } catch (error) {
    console.error('GET /me/visits error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الزيارات'
    });
  }
});

router.get('/me/lab-tests', protect, authorize('patient'), async (req, res) => {
  try {
    const ref = currentPatientRef(req.account);
    if (!ref) {
      return res.status(400).json({
        success: false,
        message: 'الحساب غير مرتبط بمريض'
      });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const [labTests, total] = await Promise.all([
      LabTest.find(ref)
        .populate(ORDERED_BY_REF_POPULATE)
        .populate('laboratoryId', 'name arabicName')
        .sort({ orderDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LabTest.countDocuments(ref)
    ]);

    return res.json({
      success: true,
      count: total,
      page,
      pages: Math.ceil(total / limit),
      labTests
    });
  } catch (error) {
    console.error('GET /me/lab-tests error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الفحوصات'
    });
  }
});

router.get('/me/prescriptions', protect, authorize('patient'), async (req, res) => {
  try {
    const ref = currentPatientRef(req.account);
    if (!ref) {
      return res.status(400).json({
        success: false,
        message: 'الحساب غير مرتبط بمريض'
      });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const [prescriptions, total] = await Promise.all([
      Prescription.find(ref)
        .populate(DOCTOR_REF_POPULATE)
        .populate(DENTIST_REF_POPULATE)
        .sort({ prescriptionDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Prescription.countDocuments(ref)
    ]);

    return res.json({
      success: true,
      count: total,
      page,
      pages: Math.ceil(total / limit),
      prescriptions
    });
  } catch (error) {
    console.error('GET /me/prescriptions error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الوصفات'
    });
  }
});

router.get('/me/appointments', protect, authorize('patient'), async (req, res) => {
  try {
    const ref = currentPatientRef(req.account);
    if (!ref) {
      return res.status(400).json({
        success: false,
        message: 'الحساب غير مرتبط بمريض'
      });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const { status } = req.query;

    const query = { ...ref };
    if (status) query.status = status;

    const [appointments, total] = await Promise.all([
      Appointment.find(query)
        .populate(DOCTOR_REF_POPULATE)
        .populate(DENTIST_REF_POPULATE)
        .populate('laboratoryId', 'name arabicName')
        .populate('hospitalId', 'name arabicName')
        .sort({ appointmentDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Appointment.countDocuments(query)
    ]);

    return res.json({
      success: true,
      count: total,
      page,
      pages: Math.ceil(total / limit),
      appointments
    });
  } catch (error) {
    console.error('GET /me/appointments error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب المواعيد'
    });
  }
});

router.get('/me/medical-summary', protect, authorize('patient'), async (req, res) => {
  try {
    const ref = currentPatientRef(req.account);
    if (!ref) {
      return res.status(400).json({
        success: false,
        message: 'الحساب غير مرتبط بمريض'
      });
    }

    const now = new Date();

    const [
      lastVisit,
      nextAppointment,
      activePrescriptions,
      pendingLabTests,
      unreadCriticalResults
    ] = await Promise.all([
      Visit.findOne(ref)
        .sort({ visitDate: -1 })
        .populate(DOCTOR_REF_POPULATE)
        .lean(),

      Appointment.findOne({
        ...ref,
        appointmentDate: { $gte: now },
        status: { $in: ['scheduled', 'confirmed'] }
      })
        .sort({ appointmentDate: 1 })
        .populate(DOCTOR_REF_POPULATE)
        .populate(DENTIST_REF_POPULATE)
        .lean(),

      Prescription.countDocuments({
        ...ref,
        status: { $in: ['active', 'partially_dispensed'] }
      }),

      LabTest.countDocuments({
        ...ref,
        status: { $in: ['ordered', 'scheduled', 'in_progress'] }
      }),

      LabTest.countDocuments({
        ...ref,
        isCritical: true,
        isViewedByPatient: false,
        status: 'completed'
      })
    ]);

    return res.json({
      success: true,
      summary: {
        lastVisit,
        nextAppointment,
        activePrescriptionsCount: activePrescriptions,
        pendingLabTestsCount: pendingLabTests,
        unreadCriticalResultsCount: unreadCriticalResults
      }
    });
  } catch (error) {
    console.error('GET /me/medical-summary error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الملخص الطبي'
    });
  }
});

// ============================================================================
// LOOKUP ROUTES — by identifier (admin/doctor access)
// ============================================================================

router.get('/:identifier', protect, verifyPatientAccess, async (req, res) => {
  try {
    const { patientPersonId, patientChildId } = req.targetPatient;

    const profile = patientPersonId
      ? await Person.findById(patientPersonId).lean()
      : await Children.findById(patientChildId).lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'بيانات المريض غير موجودة'
      });
    }

    const patientQuery = patientPersonId
      ? { personId: patientPersonId }
      : { childId: patientChildId };
    const patient = await Patient.findOne(patientQuery).lean();

    if (req.account.roles.some(r => ['doctor', 'pharmacist', 'lab_technician'].includes(r))) {
      AuditLog.record({
        userId: req.account._id,
        userEmail: req.account.email,
        action: 'VIEW_PATIENT',
        description: `Viewed patient ${req.params.identifier}`,
        resourceType: 'patient',
        resourceId: patient?._id,
        patientPersonId,
        patientChildId,
        ipAddress: req.ip || 'unknown',
        success: true
      });
    }

    return res.json({
      success: true,
      patient: {
        isMinor: !!patientChildId,
        ...profile,
        medical: patient || null
      }
    });
  } catch (error) {
    console.error('GET /:identifier error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب بيانات المريض'
    });
  }
});

router.get('/:identifier/visits', protect, verifyPatientAccess, async (req, res) => {
  try {
    const ref = req.targetPatient;

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const [visits, total] = await Promise.all([
      Visit.find(ref)
        .populate(DOCTOR_REF_POPULATE)
        .populate(DENTIST_REF_POPULATE)
        .populate('hospitalId', 'name arabicName')
        .sort({ visitDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Visit.countDocuments(ref)
    ]);

    return res.json({
      success: true,
      count: total,
      page,
      pages: Math.ceil(total / limit),
      visits
    });
  } catch (error) {
    console.error('GET /:identifier/visits error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الزيارات'
    });
  }
});

router.get('/:identifier/lab-tests', protect, verifyPatientAccess, async (req, res) => {
  try {
    const ref = req.targetPatient;

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const [labTests, total] = await Promise.all([
      LabTest.find(ref)
        .populate(ORDERED_BY_REF_POPULATE)
        .populate('laboratoryId', 'name arabicName')
        .sort({ orderDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LabTest.countDocuments(ref)
    ]);

    return res.json({
      success: true,
      count: total,
      page,
      pages: Math.ceil(total / limit),
      labTests
    });
  } catch (error) {
    console.error('GET /:identifier/lab-tests error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الفحوصات'
    });
  }
});

router.get('/:identifier/prescriptions', protect, verifyPatientAccess, async (req, res) => {
  try {
    const ref = req.targetPatient;

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const [prescriptions, total] = await Promise.all([
      Prescription.find(ref)
        .populate(DOCTOR_REF_POPULATE)
        .populate(DENTIST_REF_POPULATE)
        .sort({ prescriptionDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Prescription.countDocuments(ref)
    ]);

    return res.json({
      success: true,
      count: total,
      page,
      pages: Math.ceil(total / limit),
      prescriptions
    });
  } catch (error) {
    console.error('GET /:identifier/prescriptions error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الوصفات'
    });
  }
});

module.exports = router;