/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  AvailabilitySlot Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: availability_slots
 *  Source of truth: patient360_db_final.js (collection 25)
 *
 *  Time slot management for doctors, dentists, labs, and hospital resources.
 *  When a patient books an appointment, the appointment.slotId references
 *  the slot that was claimed.
 *
 *  Booking concurrency:
 *    • currentBookings starts at 0
 *    • Each booking does $inc: { currentBookings: 1 } (atomic)
 *    • Slot is full when currentBookings >= maxBookings
 *    • Cancellations do $inc: { currentBookings: -1 }
 *
 *  Why $inc instead of save()? To avoid the classic race condition:
 *      Two patients tap "book" at the same instant
 *      → both read currentBookings=4 (max=5)
 *      → both write currentBookings=5
 *      → result: 6 actual bookings against a max of 5
 *
 *  $inc is atomic at the MongoDB level so this can't happen.
 *  Reference: https://www.mongodb.com/docs/manual/reference/operator/update/inc/
 *
 *  Status semantics:
 *    available → bookable; currentBookings < maxBookings
 *    booked    → fully booked; currentBookings >= maxBookings
 *    blocked   → unavailable for any reason (vacation, illness, maintenance)
 *    expired   → date is in the past (set by daily cron job)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const STATUSES = ['available', 'booked', 'blocked', 'expired'];

// ── Main schema ──────────────────────────────────────────────────────────────

const AvailabilitySlotSchema = new Schema(
  {
    // ── Owner (one of these must be set) ──────────────────────────────────
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', sparse: true },
    dentistId: { type: Schema.Types.ObjectId, ref: 'Dentist', sparse: true },
    laboratoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Laboratory',
      sparse: true,
    },
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', sparse: true },

    // ── When ──────────────────────────────────────────────────────────────
    date: {
      type: Date,
      required: [true, 'تاريخ الموعد مطلوب'],
    },
    startTime: {
      type: String,
      required: [true, 'وقت البداية مطلوب'],
      trim: true,
      // HH:MM, 24-hour
    },
    endTime: {
      type: String,
      required: [true, 'وقت النهاية مطلوب'],
      trim: true,
    },
    slotDuration: {
      type: Number,
      min: [5, 'مدة الموعد يجب أن تكون 5 دقائق على الأقل'],
      // Minutes — used by booking UI to show calendar grid
    },

    // ── Capacity & state ──────────────────────────────────────────────────
    isAvailable: { type: Boolean, default: true },
    maxBookings: {
      type: Number,
      default: 1,
      min: [1, 'الحد الأقصى للحجوزات يجب أن يكون 1 على الأقل'],
    },
    currentBookings: {
      type: Number,
      default: 0,
      min: [0, 'عدد الحجوزات لا يمكن أن يكون سالب'],
    },
    status: { type: String, enum: STATUSES, default: 'available', index: true },
    blockedReason: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'availability_slots',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

AvailabilitySlotSchema.index(
  { doctorId: 1, date: 1, startTime: 1 },
  { name: 'idx_doctor_slot' },
);
AvailabilitySlotSchema.index(
  { dentistId: 1, date: 1 },
  { name: 'idx_dentist_date' },
);
AvailabilitySlotSchema.index(
  { laboratoryId: 1, date: 1 },
  { name: 'idx_lab_date' },
);
AvailabilitySlotSchema.index(
  { hospitalId: 1, date: 1 },
  { name: 'idx_hospital_date' },
);
AvailabilitySlotSchema.index(
  { status: 1, isAvailable: 1 },
  { name: 'idx_status_available' },
);
AvailabilitySlotSchema.index({ date: 1 }, { name: 'idx_date' });

// ── Pre-validate: at least one owner + time format ──────────────────────────

AvailabilitySlotSchema.pre('validate', function enforceOwner(next) {
  const owners = [
    this.doctorId,
    this.dentistId,
    this.laboratoryId,
    this.hospitalId,
  ].filter(Boolean);

  if (owners.length === 0) {
    return next(new Error('يجب تحديد doctorId أو dentistId أو laboratoryId أو hospitalId'));
  }

  // HH:MM validation
  const timePattern = /^\d{2}:\d{2}$/;
  if (!timePattern.test(this.startTime)) {
    return next(new Error('وقت البداية يجب أن يكون بصيغة HH:MM'));
  }
  if (!timePattern.test(this.endTime)) {
    return next(new Error('وقت النهاية يجب أن يكون بصيغة HH:MM'));
  }

  // endTime must be after startTime
  if (this.endTime <= this.startTime) {
    return next(new Error('وقت النهاية يجب أن يكون بعد وقت البداية'));
  }

  // currentBookings must not exceed maxBookings
  if (this.currentBookings > this.maxBookings) {
    return next(new Error('عدد الحجوزات يتجاوز الحد الأقصى المسموح'));
  }

  return next();
});

// ── Pre-save: auto-recompute status ─────────────────────────────────────────

AvailabilitySlotSchema.pre('save', function recomputeStatus(next) {
  // Don't override 'blocked' — it's a manual admin action
  if (this.status === 'blocked') return next();

  // Auto-expire past slots
  if (this.date && this.date < new Date()) {
    this.status = 'expired';
    this.isAvailable = false;
    return next();
  }

  // Status follows capacity
  if (this.currentBookings >= this.maxBookings) {
    this.status = 'booked';
    this.isAvailable = false;
  } else {
    this.status = 'available';
    this.isAvailable = true;
  }

  return next();
});

// ── Virtuals ────────────────────────────────────────────────────────────────

AvailabilitySlotSchema.virtual('remainingCapacity').get(function () {
  return Math.max(0, (this.maxBookings || 0) - (this.currentBookings || 0));
});

AvailabilitySlotSchema.virtual('isFullyBooked').get(function () {
  return this.currentBookings >= this.maxBookings;
});

// ── Static methods (atomic operations) ──────────────────────────────────────

/**
 * Atomically reserve a slot. Returns the updated slot or null if the slot
 * is full / unavailable / not found.
 *
 * Uses findOneAndUpdate with a $inc and a guard condition to prevent
 * the race condition where two patients claim the last seat simultaneously.
 *
 * @param {ObjectId} slotId
 * @returns {Promise<AvailabilitySlot|null>}
 */
AvailabilitySlotSchema.statics.atomicReserve = async function atomicReserve(slotId) {
  return this.findOneAndUpdate(
    {
      _id: slotId,
      isAvailable: true,
      status: 'available',
      $expr: { $lt: ['$currentBookings', '$maxBookings'] },
    },
    { $inc: { currentBookings: 1 } },
    { new: true },
  );
};

/**
 * Atomically release a slot (cancellation). Decrements currentBookings.
 *
 * @param {ObjectId} slotId
 * @returns {Promise<AvailabilitySlot|null>}
 */
AvailabilitySlotSchema.statics.atomicRelease = async function atomicRelease(slotId) {
  return this.findOneAndUpdate(
    { _id: slotId, currentBookings: { $gt: 0 } },
    { $inc: { currentBookings: -1 } },
    { new: true },
  );
};

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Block this slot manually (admin action — vacation, maintenance, etc.).
 *
 * @param {string} reason
 */
AvailabilitySlotSchema.methods.block = async function block(reason) {
  if (this.currentBookings > 0) {
    throw new Error('لا يمكن حجب موعد لديه حجوزات قائمة');
  }
  this.status = 'blocked';
  this.isAvailable = false;
  this.blockedReason = reason || '';
  return this.save();
};

/**
 * Unblock a previously blocked slot.
 */
AvailabilitySlotSchema.methods.unblock = async function unblock() {
  if (this.status !== 'blocked') {
    throw new Error('الموعد ليس محجوب');
  }
  this.blockedReason = undefined;
  // Pre-save will recompute status based on capacity
  this.status = 'available';
  return this.save();
};

module.exports = mongoose.model('AvailabilitySlot', AvailabilitySlotSchema);