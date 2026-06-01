/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Dentist Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: dentists
 *  Source of truth: patient360_db_final.js (collection 06)
 *
 *  Dental professional profile. Kept in a SEPARATE collection from doctors
 *  because dental specializations, visits, and fee structures differ.
 *  In the locked schema, dental visits use visitType='dental' rather than
 *  reusing the doctor visit flow.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums (note: dental specializations use Title Case per the locked schema)
//   This is the one place where the locked schema deliberately differs from
//   the snake_case convention used for medical specializations.

const DENTAL_SPECIALIZATIONS = [
  'General Dentistry', 'Orthodontics', 'Endodontics',
  'Periodontics', 'Prosthodontics', 'Oral Surgery',
  'Pediatric Dentistry', 'Cosmetic Dentistry', 'Implantology',
];

const POSITIONS = ['consultant', 'specialist', 'resident', 'intern'];

const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'visiting'];

const VERIFICATION_STATUSES = ['pending', 'verified', 'suspended', 'revoked'];

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
];

const CURRENCIES = ['SYP', 'USD'];

// ── Calendly-style sub-schemas (cloned 1:1 from Doctor.js) ──────────────────
// The dentist sign-up form (4-step wizard) submits a full scheduleTemplate
// just like the doctor flow. This was missing from the locked DB schema for
// dentists but we keep it on the Mongoose model so the admin-approval
// pipeline can persist it and the same AvailabilitySlot generation code
// can drive both providers.

const TimePeriodSchema = new Schema(
  {
    startTime: {
      type: String,
      required: [true, 'وقت البداية مطلوب'],
      match: [/^\d{2}:\d{2}$/, 'يجب أن يكون الوقت بصيغة HH:MM'],
    },
    endTime: {
      type: String,
      required: [true, 'وقت النهاية مطلوب'],
      match: [/^\d{2}:\d{2}$/, 'يجب أن يكون الوقت بصيغة HH:MM'],
    },
  },
  { _id: false },
);

const ScheduleExceptionSchema = new Schema(
  {
    date: { type: Date, required: true },
    type: { type: String, enum: ['blocked', 'modified'], required: true },
    periods: { type: [TimePeriodSchema], default: [] },
    reason: { type: String, trim: true },
  },
  { _id: false },
);

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

const DentistSchema = new Schema(
  {
    // ── Identity link ─────────────────────────────────────────────────────
    personId: {
      type: Schema.Types.ObjectId,
      ref: 'Person',
      required: [true, 'معرّف الشخص مطلوب'],
      unique: true,
    },

    // ── License & qualifications ──────────────────────────────────────────
    dentalLicenseNumber: {
      type: String,
      required: [true, 'رقم ترخيص طب الأسنان مطلوب'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    specialization: {
      type: String,
      enum: { values: DENTAL_SPECIALIZATIONS, message: 'التخصص غير صالح' },
      default: 'General Dentistry',
      index: true,
    },
    yearsOfExperience: {
      type: Number,
      required: [true, 'سنوات الخبرة مطلوبة'],
      min: 0,
      max: 60,
    },

    // ── Affiliation ───────────────────────────────────────────────────────
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

    // ── Calendly-style schedule template (cloned 1:1 from Doctor) ─────────
    // Source of truth for generating availability_slots. Identical shape to
    // the doctor's scheduleTemplate so the same slot-generator code can run
    // for both provider types.
    scheduleTemplate: {
      type: ScheduleTemplateSchema,
      default: () => ({}),
    },

    consultationFee: {
      type: Number,
      required: [true, 'رسوم الاستشارة مطلوبة'],
      min: 0,
    },
    currency: { type: String, enum: CURRENCIES, default: 'SYP' },

    // ── Flags ─────────────────────────────────────────────────────────────
    isAvailable: { type: Boolean, default: true },
    isAcceptingNewPatients: { type: Boolean, default: true },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: 'verified',
    },

    // ── Ratings (denormalized) ────────────────────────────────────────────
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    collection: 'dentists',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

DentistSchema.index({ isAvailable: 1 }, { name: 'idx_availability' });
DentistSchema.index({ averageRating: -1 }, { name: 'idx_rating_desc' });

// ── Pre-save: sync legacy availableDays from scheduleTemplate ───────────────
// Whenever the schedule template changes, recompute the flat day-name array
// so older queries and UI components continue to work without changes.
// (Cloned 1:1 from Doctor.js syncAvailableDays hook.)
DentistSchema.pre('save', function syncAvailableDays(next) {
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

DentistSchema.query.verified = function verified() {
  return this.where({ verificationStatus: 'verified' });
};

DentistSchema.query.acceptingPatients = function acceptingPatients() {
  return this.where({
    isAvailable: true,
    isAcceptingNewPatients: true,
    verificationStatus: 'verified',
  });
};

// ── Instance methods ────────────────────────────────────────────────────────

DentistSchema.methods.refreshRating = async function refreshRating() {
  const Review = mongoose.model('Review');
  const result = await Review.aggregate([
    { $match: { dentistId: this._id, status: 'approved' } },
    {
      $group: {
        _id: '$dentistId',
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
 * Generate availability_slots from this dentist's scheduleTemplate.
 * (Cloned 1:1 from Doctor.generateSlotsFromTemplate — same algorithm,
 * only the emitted slot's provider field switches from doctorId → dentistId.)
 *
 * @param {Object} [options]
 * @param {number} [options.daysAhead]    — override scheduleTemplate.bookingWindowDays
 * @param {Date}   [options.startFrom]    — override today's date
 * @returns {Array<Object>} — slot document payloads ready for insertMany
 */
DentistSchema.methods.generateSlotsFromTemplate = function generateSlotsFromTemplate(options = {}) {
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

    let periodsForDay = weeklyPattern[dayName] || [];

    const exception = exceptionsByDate[dateKey];
    if (exception) {
      if (exception.type === 'blocked') continue;
      if (exception.type === 'modified') {
        periodsForDay = exception.periods || [];
      }
    }

    if (periodsForDay.length === 0) continue;

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
          dentistId: this._id,                  // ← dentist instead of doctor
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

module.exports = mongoose.model('Dentist', DentistSchema);