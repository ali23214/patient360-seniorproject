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
    hospitalId: {
      type: Schema.Types.ObjectId,
      ref: 'Hospital',
      sparse: true,
      index: true,
    },
    position: { type: String, enum: POSITIONS },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES },

    // ── Availability & fees ───────────────────────────────────────────────
    availableDays: {
      type: [{ type: String, enum: WEEKDAYS }],
      default: [],
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

module.exports = mongoose.model('Dentist', DentistSchema);