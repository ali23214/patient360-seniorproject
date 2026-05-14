/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Doctor Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: doctors
 *  Source of truth: patient360_db_final.js (collection 05)
 *
 *  Doctor professional profile. Always linked to an adult Person record.
 *
 *  Specialization is the primary discriminator for what UI tools the doctor
 *  sees — the frontend uses this to decide whether to show ECG AI, X-Ray AI,
 *  etc. The `isECGSpecialist` boolean is denormalized for fast querying.
 *
 *  Verification lifecycle:
 *    • pending   → doctor has applied (via doctor_requests), not yet active
 *    • verified  → admin approved, doctor can log in and see patients
 *    • suspended → temporary disable (license under review, complaint, etc.)
 *    • revoked   → permanent disable (license cancelled by Ministry)
 *
 *  ═══════════════════════════════════════════════════════════════════════
 *  v2 — Calendly-style schedule template (May 2026)
 *  ─────────────────────────────────────────────────────────────────────
 *  Doctors no longer pick "available days" as a flat array. Instead they
 *  define a full weekly pattern (per-day time periods) plus settings:
 *    • slotDuration       — minutes per appointment slot
 *    • bufferTime         — minutes between consecutive slots
 *    • bookingWindowDays  — how far in advance patients can book
 *    • exceptions         — specific dates blocked or modified
 *
 *  The legacy `availableDays` field is kept for backward compatibility and
 *  is auto-derived from `scheduleTemplate.weeklyPattern` on save (any day
 *  with at least one period is considered an "available day").
 *
 *  Slot generation:
 *    Call `doctor.generateSlotsFromTemplate({ daysAhead })` to get an
 *    array of slot docs ready for `AvailabilitySlot.insertMany()`.
 *    This is used in two places:
 *      1. adminController.approveDoctorRequest — initial generation
 *      2. doctor "regenerate schedule" endpoint
 *  ═══════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums (kept in sync with patient360_db_final.js) ────────────────────────

const SPECIALIZATIONS = [
  'cardiology', 'dermatology', 'endocrinology', 'gastroenterology',
  'general_practice', 'gynecology', 'hematology', 'internal_medicine',
  'nephrology', 'neurology', 'oncology', 'ophthalmology',
  'orthopedics', 'otolaryngology', 'pediatrics', 'psychiatry',
  'pulmonology', 'radiology', 'rheumatology', 'surgery',
  'urology', 'vascular_surgery', 'emergency_medicine', 'anesthesiology',
];

const POSITIONS = ['consultant', 'specialist', 'resident', 'intern'];

const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'visiting'];

const VERIFICATION_STATUSES = ['pending', 'verified', 'suspended', 'revoked'];

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
];

const CURRENCIES = ['SYP', 'USD'];

// Specializations that get the ECG AI tool by default.
// Used by the pre-save hook to auto-set isECGSpecialist.
const ECG_SPECIALIZATIONS = new Set(['cardiology']);

// ── Schedule template sub-schemas (Calendly-style) ──────────────────────────

/**
 * A single working period within a day.
 * Example: { startTime: "09:00", endTime: "13:00" }
 * Doctors can have multiple periods per day (morning shift + afternoon shift).
 */
const TimePeriodSchema = new Schema(
  {
    startTime: {
      type: String,
      required: true,
      match: [/^\d{2}:\d{2}$/, 'وقت البداية يجب أن يكون بصيغة HH:MM'],
    },
    endTime: {
      type: String,
      required: true,
      match: [/^\d{2}:\d{2}$/, 'وقت النهاية يجب أن يكون بصيغة HH:MM'],
    },
  },
  { _id: false },
);

/**
 * Exception entry — overrides the weekly pattern for a specific date.
 *   type='blocked'  → no slots that day (vacation, sick day)
 *   type='modified' → custom periods that override the weekly default
 */
const ScheduleExceptionSchema = new Schema(
  {
    date: { type: Date, required: true },
    type: {
      type: String,
      enum: ['blocked', 'modified'],
      default: 'blocked',
    },
    reason: { type: String, trim: true, maxlength: 200 },
    periods: { type: [TimePeriodSchema], default: [] },
  },
  { _id: false },
);

/**
 * The weekly recurring pattern — keys are English day names matching the
 * AvailabilitySlot owner-day computation (date.toLocaleDateString('en-US',
 * { weekday: 'long' })).
 */
const WeeklyPatternSchema = new Schema(
  {
    Sunday:    { type: [TimePeriodSchema], default: [] },
    Monday:    { type: [TimePeriodSchema], default: [] },
    Tuesday:   { type: [TimePeriodSchema], default: [] },
    Wednesday: { type: [TimePeriodSchema], default: [] },
    Thursday:  { type: [TimePeriodSchema], default: [] },
    Friday:    { type: [TimePeriodSchema], default: [] },
    Saturday:  { type: [TimePeriodSchema], default: [] },
  },
  { _id: false },
);

/**
 * Top-level schedule template. Holds the weekly pattern plus the
 * generator parameters used by `generateSlotsFromTemplate()`.
 */
const ScheduleTemplateSchema = new Schema(
  {
    weeklyPattern: {
      type: WeeklyPatternSchema,
      default: () => ({}),
    },
    slotDuration: {
      type: Number,
      default: 20,
      min: [5, 'مدة الموعد يجب أن تكون 5 دقائق على الأقل'],
      max: [240, 'مدة الموعد يجب ألا تتجاوز 240 دقيقة'],
    },
    bufferTime: {
      type: Number,
      default: 0,
      min: [0, 'الفاصل الزمني لا يمكن أن يكون سالب'],
      max: [60, 'الفاصل الزمني يجب ألا يتجاوز 60 دقيقة'],
    },
    bookingWindowDays: {
      type: Number,
      default: 30,
      min: [1, 'نافذة الحجز يجب أن تكون يوم واحد على الأقل'],
      max: [90, 'نافذة الحجز يجب ألا تتجاوز 90 يوم'],
    },
    exceptions: {
      type: [ScheduleExceptionSchema],
      default: [],
    },
    isActive: { type: Boolean, default: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// ── Main schema ──────────────────────────────────────────────────────────────

const DoctorSchema = new Schema(
  {
    // ── Identity link ─────────────────────────────────────────────────────
    personId: {
      type: Schema.Types.ObjectId,
      ref: 'Person',
      required: [true, 'معرّف الشخص مطلوب'],
      unique: true, // one doctor profile per person
    },

    // ── License & qualifications ──────────────────────────────────────────
    medicalLicenseNumber: {
      type: String,
      required: [true, 'رقم الترخيص الطبي مطلوب'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    specialization: {
      type: String,
      enum: { values: SPECIALIZATIONS, message: 'التخصص غير صالح' },
      required: [true, 'التخصص مطلوب'],
      index: true,
    },
    subSpecialization: { type: String, trim: true },
    yearsOfExperience: {
      type: Number,
      required: [true, 'سنوات الخبرة مطلوبة'],
      min: [0, 'سنوات الخبرة لا يمكن أن تكون سالبة'],
      max: [60, 'سنوات الخبرة يجب ألا تتجاوز 60 سنة'],
    },
    medicalDegree: {
      type: String,
      trim: true,
      // e.g. MD, MBBCh, MBBS
    },
    boardCertifications: { type: [String], default: [] },

    // ── Hospital affiliation ──────────────────────────────────────────────
    hospitalAffiliation: { type: String, trim: true },
    hospitalId: {
      type: Schema.Types.ObjectId,
      ref: 'Hospital',
      sparse: true,
      index: true,
    },
    position: { type: String, enum: POSITIONS },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES },

    // ── Availability & fees ───────────────────────────────────────────────
    // Legacy: array of weekday names. Auto-derived from scheduleTemplate
    // on save for backward compatibility with existing UI and queries.
    availableDays: {
      type: [{ type: String, enum: WEEKDAYS }],
      default: [],
    },

    // ── NEW: Calendly-style schedule template ─────────────────────────────
    // Source of truth for generating availability_slots. See top-of-file
    // comment for usage notes.
    scheduleTemplate: {
      type: ScheduleTemplateSchema,
      default: () => ({}),
    },

    consultationFee: {
      type: Number,
      required: [true, 'رسوم الاستشارة مطلوبة'],
      min: [0, 'رسوم الاستشارة لا يمكن أن تكون سالبة'],
    },
    followUpFee: { type: Number, min: 0 },
    currency: { type: String, enum: CURRENCIES, default: 'SYP' },

    // ── Flags ─────────────────────────────────────────────────────────────
    isECGSpecialist: { type: Boolean, default: false, index: true },
    isAvailable: { type: Boolean, default: true },
    isAcceptingNewPatients: { type: Boolean, default: true },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: 'verified',
    },

    // ── Ratings (denormalized for fast doctor list rendering) ─────────────
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    collection: 'doctors',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

DoctorSchema.index(
  { isAvailable: 1, isAcceptingNewPatients: 1 },
  { name: 'idx_availability' },
);
DoctorSchema.index({ averageRating: -1 }, { name: 'idx_rating_desc' });

// ── Pre-save: auto-flag isECGSpecialist based on specialization ─────────────

DoctorSchema.pre('save', function autoFlagECG(next) {
  if (this.isModified('specialization')) {
    this.isECGSpecialist = ECG_SPECIALIZATIONS.has(this.specialization);
  }
  next();
});

// ── Pre-save: sync legacy availableDays from scheduleTemplate ───────────────
// Whenever the schedule template changes, recompute the flat day-name array
// so older queries and UI components continue to work without changes.
DoctorSchema.pre('save', function syncAvailableDays(next) {
  if (this.isModified('scheduleTemplate')) {
    const pattern = this.scheduleTemplate?.weeklyPattern || {};
    const derived = WEEKDAYS.filter((day) => {
      const periods = pattern[day];
      return Array.isArray(periods) && periods.length > 0;
    });
    this.availableDays = derived;

    if (this.scheduleTemplate) {
      this.scheduleTemplate.updatedAt = new Date();
    }
  }
  next();
});

// ── Query helpers ───────────────────────────────────────────────────────────

DoctorSchema.query.verified = function verified() {
  return this.where({ verificationStatus: 'verified' });
};

DoctorSchema.query.acceptingPatients = function acceptingPatients() {
  return this.where({
    isAvailable: true,
    isAcceptingNewPatients: true,
    verificationStatus: 'verified',
  });
};

DoctorSchema.query.bySpecialization = function bySpecialization(spec) {
  return this.where({ specialization: spec });
};

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Recompute averageRating from the reviews collection. Called after a new
 * review is approved or removed. Keeps the denormalized rating fresh without
 * a full collection scan on every page load.
 *
 * @returns {Promise<void>}
 */
DoctorSchema.methods.refreshRating = async function refreshRating() {
  const Review = mongoose.model('Review');
  const result = await Review.aggregate([
    { $match: { doctorId: this._id, status: 'approved' } },
    {
      $group: {
        _id: '$doctorId',
        avg: { $avg: '$rating' },
        count: { $sum: 1 },
      },
    },
  ]);

  if (result.length > 0) {
    this.averageRating = Number(result[0].avg.toFixed(2));
    this.totalReviews = result[0].count;
  } else {
    this.averageRating = 0;
    this.totalReviews = 0;
  }
  return this.save();
};

/**
 * Generate availability_slots from this doctor's scheduleTemplate.
 *
 * The returned array is NOT persisted — the caller should pass it to
 * AvailabilitySlot.insertMany(slots, { ordered: false }) so individual
 * duplicate-key errors don't abort the whole batch.
 *
 * Behavior:
 *   • Walks every day from today through (today + daysAhead).
 *   • For each day, checks the weeklyPattern for that weekday name.
 *   • Applies exceptions (blocked days produce nothing; modified days use
 *     the override periods instead of the weekly default).
 *   • Within each period, walks startTime → endTime in slotDuration steps,
 *     inserting a bufferTime gap between consecutive slot starts.
 *   • Skips slots that would extend past the period's endTime.
 *
 * @param {Object} [options]
 * @param {number} [options.daysAhead]    — override scheduleTemplate.bookingWindowDays
 * @param {Date}   [options.startFrom]    — override today's date
 * @returns {Array<Object>} — slot document payloads ready for insertMany
 */
DoctorSchema.methods.generateSlotsFromTemplate = function generateSlotsFromTemplate(options = {}) {
  const template = this.scheduleTemplate;

  if (!template || !template.isActive) return [];

  const weeklyPattern = template.weeklyPattern || {};
  const slotDuration = template.slotDuration || 20;
  const bufferTime = template.bufferTime || 0;
  const stepMinutes = slotDuration + bufferTime;
  const daysAhead = options.daysAhead || template.bookingWindowDays || 30;

  // Index exceptions by ISO date string for O(1) lookup
  const exceptionsByDate = {};
  (template.exceptions || []).forEach((exc) => {
    if (!exc.date) return;
    const key = new Date(exc.date).toISOString().split('T')[0];
    exceptionsByDate[key] = exc;
  });

  const startFrom = options.startFrom ? new Date(options.startFrom) : new Date();
  startFrom.setHours(0, 0, 0, 0);

  const slots = [];

  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset += 1) {
    const date = new Date(startFrom);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(0, 0, 0, 0);

    const dateKey = date.toISOString().split('T')[0];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });

    // ── Resolve which periods apply on this specific date ────────────────
    let periodsForDay = weeklyPattern[dayName] || [];

    const exception = exceptionsByDate[dateKey];
    if (exception) {
      if (exception.type === 'blocked') {
        continue; // skip whole day
      }
      if (exception.type === 'modified') {
        periodsForDay = exception.periods || [];
      }
    }

    if (periodsForDay.length === 0) continue;

    // ── Walk each period and emit slot docs ──────────────────────────────
    for (const period of periodsForDay) {
      const [sh, sm] = String(period.startTime).split(':').map(Number);
      const [eh, em] = String(period.endTime).split(':').map(Number);
      if (Number.isNaN(sh) || Number.isNaN(eh)) continue;

      const startMin = (sh * 60) + (sm || 0);
      const endMin = (eh * 60) + (em || 0);

      for (let m = startMin; m + slotDuration <= endMin; m += stepMinutes) {
        const sH = Math.floor(m / 60).toString().padStart(2, '0');
        const sM = (m % 60).toString().padStart(2, '0');
        const endM = m + slotDuration;
        const eH = Math.floor(endM / 60).toString().padStart(2, '0');
        const eM = (endM % 60).toString().padStart(2, '0');

        slots.push({
          doctorId: this._id,
          date: new Date(date),
          startTime: `${sH}:${sM}`,
          endTime: `${eH}:${eM}`,
          slotDuration,
          maxBookings: 1,
          currentBookings: 0,
          isAvailable: true,
          status: 'available',
        });
      }
    }
  }

  return slots;
};

module.exports = mongoose.model('Doctor', DoctorSchema);
