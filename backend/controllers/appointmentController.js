/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Appointment Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Booking system. Mounted at /api/appointments.
 *
 *  Key flow — atomic slot reservation:
 *    1. Patient calls POST /api/appointments with slotId + reasonForVisit
 *    2. Controller calls AvailabilitySlot.atomicReserve(slotId)
 *       - If slot is full / unavailable → returns null → 409 Conflict
 *       - If success → currentBookings incremented atomically
 *    3. Appointment created with reference to the claimed slot
 *    4. If appointment creation FAILS for any reason after slot was claimed:
 *       - We release the slot via atomicRelease() to undo the increment
 *       - This preserves slot capacity correctness
 *
 *  Functions:
 *    1. bookAppointment            — Patient creates appointment (atomic)
 *    2. getMyAppointments          — Patient's own appointments
 *    3. getAppointmentById         — Single appointment detail
 *    4. cancelAppointment          — Cancel + release slot
 *    5. confirmAppointment         — Receptionist/auto confirms
 *    6. checkInAppointment         — Patient arrives at clinic
 *    7. completeAppointment        — Doctor finishes → creates Visit
 *    8. getProviderSchedule        — Doctor's schedule view
 *    9. rescheduleAppointment      — Move to a different slot atomically
 *
 *  Conventions kept:
 *    - Arabic error messages, emoji-marked console logs
 *    - Try/catch in every async function
 * ═══════════════════════════════════════════════════════════════════════════
 */

const {
  Appointment, AvailabilitySlot, Doctor, Dentist, Laboratory,
  Hospital, Visit, Person, Children, Patient, AuditLog
} = require('../models');

const { createNotification } = require('./notificationController');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolve patient ref from logged-in account.
 * Patients always book for themselves — no impersonation.
 */
function getPatientRefFromAccount(account) {
  if (account.personId) return { patientPersonId: account.personId };
  if (account.childId) return { patientChildId: account.childId };
  return null;
}

/**
 * For a given slot, copy the appropriate provider/location fields onto
 * the appointment we're about to create.
 */
function copyProviderFromSlot(slot) {
  const fields = {};
  if (slot.doctorId) fields.doctorId = slot.doctorId;
  if (slot.dentistId) fields.dentistId = slot.dentistId;
  if (slot.laboratoryId) fields.laboratoryId = slot.laboratoryId;
  if (slot.hospitalId) fields.hospitalId = slot.hospitalId;
  return fields;
}

// ============================================================================
// 1. BOOK APPOINTMENT (atomic)
// ============================================================================

/**
 * @route   POST /api/appointments
 * @desc    Patient books an appointment by claiming an available slot.
 *          Uses AvailabilitySlot.atomicReserve to prevent race conditions
 *          where two patients claim the last seat simultaneously.
 * @access  Private (patient)
 *
 * Body:
 *   slotId (required)
 *   reasonForVisit (required)
 *   appointmentType?     — defaults inferred from slot (doctor → 'doctor')
 *   priority?            — routine | urgent | emergency
 *   bookingMethod?       — online | mobile_app (default 'online')
 *   estimatedDuration?
 *   notes?
 */
exports.bookAppointment = async (req, res) => {
  console.log('🔵 ========== BOOK APPOINTMENT ==========');

  let claimedSlotId = null;

  try {
    const patientRef = getPatientRefFromAccount(req.account);
    if (!patientRef) {
      return res.status(403).json({
        success: false,
        message: 'الحساب غير مرتبط بمريض'
      });
    }

    const {
      slotId,
      reasonForVisit,
      appointmentType,
      priority = 'routine',
      bookingMethod = 'online',
      estimatedDuration,
      notes
    } = req.body;

    if (!slotId) {
      return res.status(400).json({
        success: false,
        message: 'slotId مطلوب'
      });
    }
    if (!reasonForVisit || reasonForVisit.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'سبب الزيارة مطلوب'
      });
    }

    // ── 1. ATOMICALLY CLAIM THE SLOT ──────────────────────────────────────
    // This is the critical step. atomicReserve uses findOneAndUpdate with
    // $expr guards so two concurrent bookings can't claim the same seat.
    const slot = await AvailabilitySlot.atomicReserve(slotId);

    if (!slot) {
      console.log('❌ Slot unavailable or not found');
      return res.status(409).json({
        success: false,
        message: 'هذا الموعد لم يعد متاحاً. الرجاء اختيار موعد آخر'
      });
    }

    claimedSlotId = slot._id;
    console.log('✅ Slot claimed:', slot._id, 'currentBookings:', slot.currentBookings);

    // ── 2. INFER APPOINTMENT TYPE FROM SLOT IF NOT PROVIDED ───────────────
    let inferredType = appointmentType;
    if (!inferredType) {
      if (slot.doctorId) inferredType = 'doctor';
      else if (slot.dentistId) inferredType = 'dentist';
      else if (slot.laboratoryId) inferredType = 'lab_test';
      else inferredType = 'doctor';
    }

    // ── 3. CREATE APPOINTMENT ─────────────────────────────────────────────
    const appointment = await Appointment.create({
      ...patientRef,
      ...copyProviderFromSlot(slot),
      slotId: slot._id,
      appointmentType: inferredType,
      appointmentDate: slot.date,
      appointmentTime: slot.startTime,
      estimatedDuration: estimatedDuration || slot.slotDuration,
      reasonForVisit: reasonForVisit.trim(),
      priority,
      bookingMethod,
      status: 'scheduled',
      paymentStatus: 'pending',
      notes: notes?.trim()
    });

    console.log('✅ Appointment created:', appointment._id);

    // ── 4. AUDIT ──────────────────────────────────────────────────────────
    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'BOOK_APPOINTMENT',
      description: `Booked ${inferredType} appointment for ${slot.date.toISOString().slice(0, 10)} ${slot.startTime}`,
      resourceType: 'appointment',
      resourceId: appointment._id,
      patientPersonId: appointment.patientPersonId,
      patientChildId: appointment.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        slotId: slot._id,
        appointmentType: inferredType,
        priority,
        bookingMethod
      }
    });

    // ── PUSH NOTIFICATION TO PATIENT ──────────────────────────────────────
    // Fire-and-forget — booking succeeds even if push fails.
    try {
      const Doctor = require('../models').Doctor;
      let providerName = 'الطبيب';
      if (appointment.doctorId) {
        try {
          const docRecord = await Doctor.findById(appointment.doctorId)
            .populate('personId', 'firstName lastName')
            .lean();
          if (docRecord?.personId) {
            providerName = `د. ${docRecord.personId.firstName || ''} ${docRecord.personId.lastName || ''}`.trim();
          }
        } catch (_) { /* fall through to default */ }
      }
      const dateStr = slot.date
        ? new Date(slot.date).toLocaleDateString('ar-EG')
        : '';
      createNotification({
        recipientPersonId: appointment.patientPersonId,
        recipientChildId:  appointment.patientChildId,
        recipientType: 'patient',
        notificationType: 'appointment_confirmed',
        title:       'تم حجز موعدك',
        titleArabic: 'تم حجز موعدك',
        body: `تم حجز موعدك مع ${providerName} يوم ${dateStr} الساعة ${slot.startTime}`,
        channels: ['push', 'in_app'],
        relatedType: 'appointment',
        relatedId:   appointment._id,
        deepLinkRoute: '/appointments',
        priority: 'normal'
      }).catch((err) => console.warn('⚠️  Booking notification failed:', err.message));
    } catch (notifError) {
      console.warn('⚠️  Notification dispatch error (non-fatal):', notifError.message);
    }

    return res.status(201).json({
      success: true,
      message: 'تم حجز الموعد بنجاح',
      appointment
    });

  } catch (error) {
    console.error('❌ Book appointment error:', error);

    // ── ROLLBACK: release the slot we claimed ─────────────────────────────
    if (claimedSlotId) {
      try {
        await AvailabilitySlot.atomicRelease(claimedSlotId);
        console.log('🔄 Released slot due to booking failure');
      } catch (releaseError) {
        console.error('Failed to release slot:', releaseError);
      }
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'خطأ في البيانات'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في حجز الموعد'
    });
  }
};

// ============================================================================
// 2. GET MY APPOINTMENTS (patient)
// ============================================================================

/**
 * @route   GET /api/appointments/mine
 * @desc    Logged-in patient's own appointments
 * @access  Private (patient)
 *
 * Query: page, limit, status, upcoming (true/false)
 */
exports.getMyAppointments = async (req, res) => {
  try {
    const patientRef = getPatientRefFromAccount(req.account);
    if (!patientRef) {
      return res.status(403).json({
        success: false,
        message: 'الحساب غير مرتبط بمريض'
      });
    }

    const { page = 1, limit = 20, status, upcoming } = req.query;
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);

    const query = { ...patientRef };
    if (status) query.status = status;
    if (upcoming === 'true') {
      query.appointmentDate = { $gte: new Date() };
      query.status = query.status || { $in: ['scheduled', 'confirmed', 'checked_in'] };
    }

    const [appointments, total] = await Promise.all([
      Appointment.find(query)
        .populate('doctorId', 'specialization medicalLicenseNumber')
        .populate('dentistId', 'specialization dentalLicenseNumber')
        .populate('laboratoryId', 'name arabicName phoneNumber')
        .populate('hospitalId', 'name arabicName')
        .sort({ appointmentDate: upcoming === 'true' ? 1 : -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      Appointment.countDocuments(query)
    ]);

    return res.json({
      success: true,
      count: total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
      appointments
    });
  } catch (error) {
    console.error('Get my appointments error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب المواعيد'
    });
  }
};

// ============================================================================
// 3. GET APPOINTMENT BY ID
// ============================================================================

/**
 * @route   GET /api/appointments/:id
 * @desc    Single appointment detail
 * @access  Private (patient owner, provider, admin)
 */
exports.getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const appointment = await Appointment.findById(id)
      .populate('patientPersonId', 'firstName lastName nationalId phoneNumber')
      .populate('patientChildId', 'firstName lastName childRegistrationNumber phoneNumber')
      .populate('doctorId', 'specialization medicalLicenseNumber')
      .populate('dentistId', 'specialization dentalLicenseNumber')
      .populate('laboratoryId', 'name arabicName phoneNumber')
      .populate('hospitalId', 'name arabicName')
      .populate('visitId', 'visitDate diagnosis')
      .lean();

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'الموعد غير موجود'
      });
    }

    return res.json({
      success: true,
      appointment
    });
  } catch (error) {
    console.error('Get appointment error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الموعد'
    });
  }
};

// ============================================================================
// 4. CANCEL APPOINTMENT (atomic — releases slot)
// ============================================================================

/**
 * @route   POST /api/appointments/:id/cancel
 * @desc    Cancel an appointment and release its slot.
 * @access  Private (patient owner, provider, admin)
 *
 * Body: { reason: string (one of CANCELLATION_REASONS), notes?: string }
 */
exports.cancelAppointment = async (req, res) => {
  console.log('🔵 ========== CANCEL APPOINTMENT ==========');

  try {
    const { id } = req.params;
    const { reason, notes } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'سبب الإلغاء مطلوب'
      });
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'الموعد غير موجود'
      });
    }

    // ── Permission check: patient owner OR admin OR treating provider ─────
    const isAdmin = req.user.roles?.includes('admin');
    const isProvider = req.user.roles?.some(r =>
      ['doctor', 'dentist', 'lab_technician'].includes(r)
    );
    const isOwner =
      (appointment.patientPersonId
        && String(appointment.patientPersonId) === String(req.user.personId))
      || (appointment.patientChildId
        && String(appointment.patientChildId) === String(req.user.childId));

    if (!isAdmin && !isProvider && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية لإلغاء هذا الموعد'
      });
    }

    // Use the model's cancel method (validates state transition)
    try {
      await appointment.cancel(req.user._id, reason);
    } catch (modelError) {
      return res.status(400).json({
        success: false,
        message: modelError.message
      });
    }

    // ── Release the slot atomically ───────────────────────────────────────
    if (appointment.slotId) {
      try {
        await AvailabilitySlot.atomicRelease(appointment.slotId);
        console.log('✅ Released slot:', appointment.slotId);
      } catch (releaseError) {
        // Log but don't fail — appointment is already cancelled
        console.error('Failed to release slot:', releaseError);
      }
    }

    if (notes) {
      appointment.notes = (appointment.notes || '') + `\n[إلغاء: ${notes}]`;
      await appointment.save();
    }

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'CANCEL_APPOINTMENT',
      description: `Cancelled appointment ${appointment._id}`,
      resourceType: 'appointment',
      resourceId: appointment._id,
      patientPersonId: appointment.patientPersonId,
      patientChildId: appointment.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: { reason, notes }
    });

    // ── PUSH NOTIFICATION TO PATIENT ────────────────────────────────────────
    try {
      const dateStr = appointment.appointmentDate
        ? new Date(appointment.appointmentDate).toLocaleDateString('ar-EG')
        : '';
      createNotification({
        recipientPersonId: appointment.patientPersonId,
        recipientChildId:  appointment.patientChildId,
        recipientType: 'patient',
        notificationType: 'appointment_cancelled',
        title:       'تم إلغاء موعدك',
        titleArabic: 'تم إلغاء موعدك',
        body: `تم إلغاء موعدك بتاريخ ${dateStr} الساعة ${appointment.appointmentTime || ''}. يرجى حجز موعد جديد.`,
        channels: ['push', 'in_app'],
        relatedType: 'appointment',
        relatedId:   appointment._id,
        deepLinkRoute: '/appointments',
        priority: 'high'
      }).catch(err => console.warn('⚠️  Notification failed:', err.message));
    } catch (notifError) {
      console.warn('⚠️  Notification dispatch error (non-fatal):', notifError.message);
    }

    return res.json({
      success: true,
      message: 'تم إلغاء الموعد'
    });
  } catch (error) {
    console.error('❌ Cancel appointment error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إلغاء الموعد'
    });
  }
};

// ============================================================================
// 5. CONFIRM APPOINTMENT
// ============================================================================

/**
 * @route   POST /api/appointments/:id/confirm
 * @desc    Confirm a scheduled appointment (receptionist or auto-confirm)
 * @access  Private (provider, admin)
 */
exports.confirmAppointment = async (req, res) => {
  try {
    const { id } = req.params;

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'الموعد غير موجود'
      });
    }

    try {
      await appointment.confirm();
    } catch (modelError) {
      return res.status(400).json({
        success: false,
        message: modelError.message
      });
    }

    // ── PUSH NOTIFICATION TO PATIENT ────────────────────────────────────────
    try {
      const dateStr = appointment.appointmentDate
        ? new Date(appointment.appointmentDate).toLocaleDateString('ar-EG')
        : '';
      createNotification({
        recipientPersonId: appointment.patientPersonId,
        recipientChildId:  appointment.patientChildId,
        recipientType: 'patient',
        notificationType: 'appointment_confirmed',
        title:       'تم تأكيد موعدك',
        titleArabic: 'تم تأكيد موعدك',
        body: `تم تأكيد موعدك بتاريخ ${dateStr} الساعة ${appointment.appointmentTime || ''}.`,
        channels: ['push', 'in_app'],
        relatedType: 'appointment',
        relatedId:   appointment._id,
        deepLinkRoute: '/appointments',
        priority: 'normal'
      }).catch(err => console.warn('⚠️  Notification failed:', err.message));
    } catch (notifError) {
      console.warn('⚠️  Notification dispatch error (non-fatal):', notifError.message);
    }

    return res.json({
      success: true,
      message: 'تم تأكيد الموعد',
      appointment
    });
  } catch (error) {
    console.error('Confirm appointment error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تأكيد الموعد'
    });
  }
};

// ============================================================================
// 6. CHECK IN
// ============================================================================

/**
 * @route   POST /api/appointments/:id/check-in
 * @desc    Mark patient as checked in (arrived at clinic)
 * @access  Private (provider, receptionist, admin)
 */
exports.checkInAppointment = async (req, res) => {
  try {
    const { id } = req.params;

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'الموعد غير موجود'
      });
    }

    try {
      await appointment.checkIn();
    } catch (modelError) {
      return res.status(400).json({
        success: false,
        message: modelError.message
      });
    }

    return res.json({
      success: true,
      message: 'تم تسجيل وصول المريض',
      appointment
    });
  } catch (error) {
    console.error('Check in error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تسجيل الوصول'
    });
  }
};

// ============================================================================
// 7. COMPLETE APPOINTMENT (creates Visit)
// ============================================================================

/**
 * @route   POST /api/appointments/:id/complete
 * @desc    Mark appointment completed and create the corresponding Visit.
 *          Returns the visit ID so the frontend can immediately load the
 *          visit form for the doctor to fill in.
 * @access  Private (provider, admin)
 *
 * Body:
 *   chiefComplaint (required for visit creation)
 *   visitType?  — defaults inferred from appointmentType
 */
exports.completeAppointment = async (req, res) => {
  console.log('🔵 ========== COMPLETE APPOINTMENT ==========');

  try {
    const { id } = req.params;
    const { chiefComplaint, visitType } = req.body;

    if (!chiefComplaint) {
      return res.status(400).json({
        success: false,
        message: 'الشكوى الرئيسية مطلوبة لإنشاء سجل الزيارة'
      });
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'الموعد غير موجود'
      });
    }

    if (appointment.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'الموعد مكتمل بالفعل'
      });
    }

    // ── Map appointmentType → visitType ───────────────────────────────────
    const typeMap = {
      doctor: 'regular',
      dentist: 'dental',
      lab_test: 'lab_only',
      follow_up: 'follow_up',
      emergency: 'emergency'
    };
    const inferredVisitType = visitType || typeMap[appointment.appointmentType] || 'regular';

    // ── Build patient ref + provider ref for the visit ────────────────────
    const visitData = {
      visitType: inferredVisitType,
      visitDate: new Date(),
      status: 'in_progress',
      chiefComplaint: chiefComplaint.trim(),
      appointmentId: appointment._id
    };

    if (appointment.patientPersonId) visitData.patientPersonId = appointment.patientPersonId;
    if (appointment.patientChildId) visitData.patientChildId = appointment.patientChildId;
    if (appointment.doctorId) visitData.doctorId = appointment.doctorId;
    if (appointment.dentistId) visitData.dentistId = appointment.dentistId;
    if (appointment.hospitalId) visitData.hospitalId = appointment.hospitalId;

    const visit = await Visit.create(visitData);

    // ── Update appointment ────────────────────────────────────────────────
    appointment.status = 'completed';
    appointment.visitId = visit._id;
    await appointment.save();

    console.log('✅ Visit created:', visit._id);

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'COMPLETE_APPOINTMENT',
      description: `Completed appointment, created visit ${visit._id}`,
      resourceType: 'appointment',
      resourceId: appointment._id,
      patientPersonId: appointment.patientPersonId,
      patientChildId: appointment.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: { visitId: visit._id }
    });

    return res.json({
      success: true,
      message: 'تم إكمال الموعد وإنشاء سجل الزيارة',
      visitId: visit._id,
      appointment
    });
  } catch (error) {
    console.error('❌ Complete appointment error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إكمال الموعد'
    });
  }
};

// ============================================================================
// 8. GET PROVIDER SCHEDULE
// ============================================================================

/**
 * @route   GET /api/appointments/provider-schedule
 * @desc    Provider's appointment schedule (their own).
 *          Used by DoctorDashboard week/day view.
 * @access  Private (doctor, dentist, lab_technician)
 *
 * Query: from?, to?, status?
 */
exports.getProviderSchedule = async (req, res) => {
  try {
    let providerQuery = null;

    if (req.user.roles.includes('doctor')) {
      const doctor = await Doctor.findOne({ personId: req.user.personId }).lean();
      if (doctor) providerQuery = { doctorId: doctor._id };
    } else if (req.user.roles.includes('dentist')) {
      const dentist = await Dentist.findOne({ personId: req.user.personId }).lean();
      if (dentist) providerQuery = { dentistId: dentist._id };
    }

    if (!providerQuery) {
      return res.status(403).json({
        success: false,
        message: 'الحساب غير مرتبط بمزود خدمة'
      });
    }

    const { from, to, status } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const query = { ...providerQuery };
    if (Object.keys(dateFilter).length > 0) query.appointmentDate = dateFilter;
    if (status) query.status = status;

    const appointments = await Appointment.find(query)
      .populate('patientPersonId', 'firstName lastName nationalId phoneNumber')
      .populate('patientChildId', 'firstName lastName childRegistrationNumber phoneNumber')
      .sort({ appointmentDate: 1, appointmentTime: 1 })
      .lean();

    return res.json({
      success: true,
      count: appointments.length,
      appointments
    });
  } catch (error) {
    console.error('Get provider schedule error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الجدول'
    });
  }
};

// ============================================================================
// 9. RESCHEDULE APPOINTMENT (atomic swap)
// ============================================================================

/**
 * @route   POST /api/appointments/:id/reschedule
 * @desc    Move appointment to a different slot. Atomically claims the new
 *          slot first; if successful, releases the old slot. If new slot
 *          claim fails, original appointment is unchanged.
 * @access  Private (patient owner, admin)
 *
 * Body: { newSlotId: ObjectId, reason?: string }
 */
exports.rescheduleAppointment = async (req, res) => {
  console.log('🔵 ========== RESCHEDULE APPOINTMENT ==========');

  let claimedNewSlotId = null;

  try {
    const { id } = req.params;
    const { newSlotId, reason } = req.body;

    if (!newSlotId) {
      return res.status(400).json({
        success: false,
        message: 'newSlotId مطلوب'
      });
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'الموعد غير موجود'
      });
    }

    if (['completed', 'cancelled'].includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        message: `لا يمكن إعادة جدولة موعد حالته ${appointment.status}`
      });
    }

    // Permission: patient owner or admin
    const isAdmin = req.user.roles?.includes('admin');
    const isOwner =
      (appointment.patientPersonId
        && String(appointment.patientPersonId) === String(req.user.personId))
      || (appointment.patientChildId
        && String(appointment.patientChildId) === String(req.user.childId));

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية لإعادة جدولة هذا الموعد'
      });
    }

    // ── 1. Atomically claim new slot first ────────────────────────────────
    const newSlot = await AvailabilitySlot.atomicReserve(newSlotId);
    if (!newSlot) {
      return res.status(409).json({
        success: false,
        message: 'الموعد الجديد لم يعد متاحاً'
      });
    }
    claimedNewSlotId = newSlot._id;
    console.log('✅ Claimed new slot:', newSlot._id);

    // ── 2. Release old slot ───────────────────────────────────────────────
    const oldSlotId = appointment.slotId;
    if (oldSlotId) {
      await AvailabilitySlot.atomicRelease(oldSlotId);
      console.log('✅ Released old slot:', oldSlotId);
    }

    // ── 3. Update appointment ─────────────────────────────────────────────
    appointment.slotId = newSlot._id;
    appointment.appointmentDate = newSlot.date;
    appointment.appointmentTime = newSlot.startTime;
    appointment.status = 'rescheduled';
    if (reason) {
      appointment.notes = (appointment.notes || '') + `\n[تم إعادة الجدولة: ${reason}]`;
    }
    await appointment.save();

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'RESCHEDULE_APPOINTMENT',
      description: `Rescheduled appointment ${appointment._id}`,
      resourceType: 'appointment',
      resourceId: appointment._id,
      patientPersonId: appointment.patientPersonId,
      patientChildId: appointment.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: { oldSlotId, newSlotId, reason }
    });

    return res.json({
      success: true,
      message: 'تم إعادة جدولة الموعد بنجاح',
      appointment
    });

  } catch (error) {
    console.error('❌ Reschedule error:', error);

    // Rollback: release the new slot we claimed
    if (claimedNewSlotId) {
      try {
        await AvailabilitySlot.atomicRelease(claimedNewSlotId);
      } catch (releaseError) {
        console.error('Failed to release new slot:', releaseError);
      }
    }

    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إعادة الجدولة'
    });
  }
};