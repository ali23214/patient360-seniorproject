/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Appointment Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: appointments
 *  Source of truth: patient360_db_final.js (collection 13)
 *
 *  Booking system for doctor consultations, dental visits, lab sample
 *  collection, follow-ups, and emergencies.
 *
 *  Lifecycle:
 *    scheduled → confirmed → checked_in → in_progress → completed
 *
 *  Once completed, the appointment links to the resulting visitId.
 *  Cancellations track cancelledBy + cancellationReason for auditing.
 *
 *  Booking sources (`bookingMethod`):
 *    online      — patient booked from web
 *    mobile_app  — patient booked from mobile app
 *    phone       — receptionist booked over phone
 *    walk_in     — patient walked in, receptionist created retroactively
 *    admin       — admin-created (rare, manual entry)
 *
 *  The slotId references the availability_slot that was claimed.
 *  When the appointment is cancelled, controllers should decrement
 *  availability_slot.currentBookings to release the slot.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const APPOINTMENT_TYPES = [
  'doctor', 'dentist', 'lab_test', 'follow_up', 'emergency',
];

const STATUSES = [
  'scheduled', 'confirmed', 'checked_in', 'in_progress',
  'completed', 'cancelled', 'no_show', 'rescheduled',
];

const BOOKING_METHODS = [
  'online', 'phone', 'walk_in', 'admin', 'mobile_app',
];

const CANCELLATION_REASONS = [
  'patient_request', 'doctor_unavailable',
  'emergency', 'duplicate', 'other',
];

const PRIORITIES = ['routine', 'urgent', 'emergency'];

const PAYMENT_STATUSES = ['pending', 'paid', 'cancelled', 'refunded'];

const PAYMENT_METHODS = ['cash', 'card', 'insurance', 'free'];

// ── Main schema ──────────────────────────────────────────────────────────────

const AppointmentSchema = new Schema(
  {
    // ── Type ──────────────────────────────────────────────────────────────
    appointmentType: {
      type: String,
      enum: APPOINTMENT_TYPES,
      required: [true, 'نوع الموعد مطلوب'],
      index: true,
    },

    // ── Patient (XOR) ─────────────────────────────────────────────────────
    patientPersonId: {
      type: Schema.Types.ObjectId,
      ref: 'Person',
      sparse: true,
    },
    patientChildId: {
      type: Schema.Types.ObjectId,
      ref: 'Children',
      sparse: true,
    },

    // ── Provider (one-of, depending on appointmentType) ───────────────────
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', sparse: true },
    dentistId: { type: Schema.Types.ObjectId, ref: 'Dentist', sparse: true },
    laboratoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Laboratory',
      sparse: true,
    },

    // ── Location ──────────────────────────────────────────────────────────
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', sparse: true },

    // ── Time slot ─────────────────────────────────────────────────────────
    slotId: {
      type: Schema.Types.ObjectId,
      ref: 'AvailabilitySlot',
      sparse: true,
    },
    appointmentDate: {
      type: Date,
      required: [true, 'تاريخ الموعد مطلوب'],
    },
    appointmentTime: {
      type: String,
      required: [true, 'وقت الموعد مطلوب'],
      trim: true,
      // HH:MM format, 24-hour
    },
    estimatedDuration: { type: Number, min: 5 }, // minutes

    // ── Reason & priority ─────────────────────────────────────────────────
    reasonForVisit: {
      type: String,
      required: [true, 'سبب الزيارة مطلوب'],
      trim: true,
    },
    priority: { type: String, enum: PRIORITIES, default: 'routine' },

    // ── Status ────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: STATUSES,
      default: 'scheduled',
      index: true,
    },
    bookingMethod: { type: String, enum: BOOKING_METHODS, default: 'online' },

    // ── Cancellation ──────────────────────────────────────────────────────
    cancellationReason: { type: String, enum: CANCELLATION_REASONS },
    cancelledAt: { type: Date },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'Account' },

    // ── Payment ───────────────────────────────────────────────────────────
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    paymentMethod: { type: String, enum: PAYMENT_METHODS },

    // ── Link to created visit (set on completion) ─────────────────────────
    visitId: { type: Schema.Types.ObjectId, ref: 'Visit', sparse: true },

    notes: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'appointments',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

AppointmentSchema.index(
  { patientPersonId: 1, appointmentDate: -1 },
  { name: 'idx_patient_adult_date' },
);
AppointmentSchema.index(
  { patientChildId: 1, appointmentDate: -1 },
  { name: 'idx_patient_child_date' },
);
AppointmentSchema.index(
  { doctorId: 1, appointmentDate: 1 },
  { name: 'idx_doctor_date' },
);
AppointmentSchema.index(
  { dentistId: 1, appointmentDate: 1 },
  { name: 'idx_dentist_date' },
);
AppointmentSchema.index(
  { laboratoryId: 1, appointmentDate: 1 },
  { name: 'idx_lab_date' },
);
AppointmentSchema.index(
  { hospitalId: 1, appointmentDate: 1 },
  { name: 'idx_hospital_date' },
);
AppointmentSchema.index({ slotId: 1 }, { name: 'idx_slotId' });
AppointmentSchema.index(
  { status: 1, appointmentDate: 1 },
  { name: 'idx_status_date' },
);
AppointmentSchema.index(
  { appointmentDate: 1, appointmentTime: 1 },
  { name: 'idx_datetime' },
);

// ── Pre-validate: patient XOR + provider validation by type ─────────────────

AppointmentSchema.pre('validate', function enforceRules(next) {
  // Patient XOR
  const hasPerson = !!this.patientPersonId;
  const hasChild = !!this.patientChildId;
  if (!hasPerson && !hasChild) {
    return next(new Error('يجب تحديد patientPersonId أو patientChildId'));
  }
  if (hasPerson && hasChild) {
    return next(new Error('لا يمكن تحديد patientPersonId و patientChildId معاً'));
  }

  // Provider must match appointmentType
  if (this.appointmentType === 'doctor' || this.appointmentType === 'follow_up') {
    if (!this.doctorId) {
      return next(new Error('doctorId مطلوب لمواعيد الأطباء'));
    }
  }
  if (this.appointmentType === 'dentist' && !this.dentistId) {
    return next(new Error('dentistId مطلوب لمواعيد الأسنان'));
  }
  if (this.appointmentType === 'lab_test' && !this.laboratoryId) {
    return next(new Error('laboratoryId مطلوب لمواعيد المختبر'));
  }

  // appointmentTime must be HH:MM
  if (!/^\d{2}:\d{2}$/.test(this.appointmentTime)) {
    return next(new Error('وقت الموعد يجب أن يكون بصيغة HH:MM'));
  }

  return next();
});

// ── Virtuals ────────────────────────────────────────────────────────────────

/**
 * Combined Date object (date + time) for easier sorting/comparing.
 */
AppointmentSchema.virtual('appointmentDateTime').get(function () {
  if (!this.appointmentDate || !this.appointmentTime) return null;
  const combined = new Date(this.appointmentDate);
  const [hh, mm] = this.appointmentTime.split(':').map(Number);
  combined.setHours(hh, mm, 0, 0);
  return combined;
});

AppointmentSchema.virtual('isPast').get(function () {
  const dt = this.appointmentDateTime;
  return dt ? dt < new Date() : false;
});

AppointmentSchema.virtual('isUpcoming').get(function () {
  const dt = this.appointmentDateTime;
  return dt ? dt > new Date() : false;
});

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Cancel this appointment with a reason and the canceller's account.
 * Caller is responsible for decrementing availability_slot.currentBookings.
 *
 * @param {ObjectId} accountId - who cancelled
 * @param {string} reason - one of CANCELLATION_REASONS
 */
AppointmentSchema.methods.cancel = async function cancel(accountId, reason) {
  if (this.status === 'cancelled' || this.status === 'completed') {
    throw new Error(`لا يمكن إلغاء موعد حالته ${this.status}`);
  }
  if (!CANCELLATION_REASONS.includes(reason)) {
    throw new Error(`سبب الإلغاء غير صالح: ${reason}`);
  }
  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.cancelledBy = accountId;
  this.cancellationReason = reason;
  return this.save();
};

/**
 * Confirm a scheduled appointment (typically receptionist or auto-confirm).
 */
AppointmentSchema.methods.confirm = async function confirm() {
  if (this.status !== 'scheduled') {
    throw new Error(`لا يمكن تأكيد موعد حالته ${this.status}`);
  }
  this.status = 'confirmed';
  return this.save();
};

/**
 * Mark patient as checked in (arrived at the clinic).
 */
AppointmentSchema.methods.checkIn = async function checkIn() {
  if (!['scheduled', 'confirmed'].includes(this.status)) {
    throw new Error(`لا يمكن تسجيل الوصول لموعد حالته ${this.status}`);
  }
  this.status = 'checked_in';
  return this.save();
};

module.exports = mongoose.model('Appointment', AppointmentSchema);