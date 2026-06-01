/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Hospital Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: hospitals
 *  Source of truth: patient360_db_final.js (collection 10)
 *
 *  Hospital registry. Referenced by:
 *    • doctors.hospitalId   — primary affiliation
 *    • dentists.hospitalId  — dental clinic affiliation
 *    • visits.hospitalId    — where the visit took place
 *    • appointments.hospitalId
 *    • availability_slots.hospitalId
 *
 *  Hospitals can be government, private, military, university, or specialized.
 *  The `accreditations` array tracks ISO/JCI/national accreditations with
 *  expiry tracking so admins can flag hospitals with lapsed accreditations.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums (kept in sync with locked schema) ─────────────────────────────────

const GOVERNORATES = [
  'damascus', 'aleppo', 'homs', 'hama', 'latakia', 'tartus',
  'idlib', 'deir_ez_zor', 'raqqa', 'hasakah', 'daraa',
  'as_suwayda', 'quneitra', 'rif_dimashq',
];

const HOSPITAL_TYPES = [
  'government', 'private', 'military', 'university', 'specialized',
];

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
];

// ── Sub-schemas ─────────────────────────────────────────────────────────────

const OperatingHoursSchema = new Schema(
  {
    day: { type: String, enum: WEEKDAYS, required: true },
    openTime: { type: String, trim: true }, // HH:MM (24h)
    closeTime: { type: String, trim: true },
    is24Hours: { type: Boolean, default: false },
  },
  { _id: false },
);

const AccreditationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    issuedBy: { type: String, trim: true },
    issueDate: { type: Date },
    expiryDate: { type: Date },
  },
  { _id: false },
);

// ── Main schema ──────────────────────────────────────────────────────────────

const HospitalSchema = new Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'اسم المستشفى مطلوب'],
      trim: true,
    },
    arabicName: { type: String, trim: true },
    registrationNumber: {
      type: String,
      required: [true, 'رقم التسجيل مطلوب'],
      unique: true,
      trim: true,
    },
    hospitalLicense: {
      type: String,
      trim: true,
      sparse: true,
    },
    hospitalType: { type: String, enum: HOSPITAL_TYPES },
    specializations: { type: [String], default: [] },

    // ── Contact ───────────────────────────────────────────────────────────
    phoneNumber: {
      type: String,
      required: [true, 'رقم الهاتف مطلوب'],
      trim: true,
    },
    emergencyPhoneNumber: { type: String, trim: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'البريد الإلكتروني غير صحيح'],
    },
    website: { type: String, trim: true },

    // ── Location ──────────────────────────────────────────────────────────
    address: {
      type: String,
      required: [true, 'العنوان مطلوب'],
      trim: true,
    },
    governorate: {
      type: String,
      enum: GOVERNORATES,
      required: [true, 'المحافظة مطلوبة'],
      index: true,
    },
    city: {
      type: String,
      required: [true, 'المدينة مطلوبة'],
      trim: true,
    },
    district: { type: String, trim: true },

    // ── Capacity ──────────────────────────────────────────────────────────
    numberOfBeds: { type: Number, min: 0 },
    numberOfOperatingRooms: { type: Number, min: 0 },

    // ── Service flags ─────────────────────────────────────────────────────
    hasEmergency: { type: Boolean, default: false },
    hasICU: { type: Boolean, default: false },
    hasLaboratory: { type: Boolean, default: false },
    hasPharmacy: { type: Boolean, default: false },
    hasRadiology: { type: Boolean, default: false },

    // ── Operating hours ───────────────────────────────────────────────────
    operatingHours: { type: [OperatingHoursSchema], default: [] },

    // ── Services & accreditations ─────────────────────────────────────────
    servicesOffered: { type: [String], default: [] },
    accreditations: { type: [AccreditationSchema], default: [] },

    // ── Status ────────────────────────────────────────────────────────────
    isActive: { type: Boolean, default: true },
    isAcceptingPatients: { type: Boolean, default: true },

    // ── Ratings (denormalized) ────────────────────────────────────────────
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    collection: 'hospitals',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

HospitalSchema.index(
  { hospitalLicense: 1 },
  { unique: true, sparse: true, name: 'idx_license_unique' },
);
HospitalSchema.index({ name: 1 }, { name: 'idx_name' });
HospitalSchema.index({ arabicName: 1 }, { name: 'idx_arabicName' });
HospitalSchema.index({ governorate: 1, city: 1 }, { name: 'idx_location' });
HospitalSchema.index({ hospitalType: 1 }, { name: 'idx_type' });
HospitalSchema.index(
  { isActive: 1, isAcceptingPatients: 1 },
  { name: 'idx_status' },
);
HospitalSchema.index({ averageRating: -1 }, { name: 'idx_rating_desc' });

// ── Query helpers ───────────────────────────────────────────────────────────

HospitalSchema.query.active = function active() {
  return this.where({ isActive: true });
};

HospitalSchema.query.acceptingPatients = function acceptingPatients() {
  return this.where({ isActive: true, isAcceptingPatients: true });
};

HospitalSchema.query.byGovernorate = function byGovernorate(gov) {
  return this.where({ governorate: gov });
};

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Check if any of this hospital's accreditations are expired.
 * @returns {boolean}
 */
HospitalSchema.methods.hasExpiredAccreditation = function hasExpiredAccreditation() {
  const now = new Date();
  return this.accreditations.some(
    (acc) => acc.expiryDate && acc.expiryDate < now,
  );
};

/**
 * Recompute averageRating from approved reviews.
 */
HospitalSchema.methods.refreshRating = async function refreshRating() {
  const Review = mongoose.model('Review');
  const result = await Review.aggregate([
    { $match: { hospitalId: this._id, status: 'approved' } },
    {
      $group: {
        _id: '$hospitalId',
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

module.exports = mongoose.model('Hospital', HospitalSchema);