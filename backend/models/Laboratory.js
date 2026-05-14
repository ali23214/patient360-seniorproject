/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Laboratory Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: laboratories
 *  Source of truth: patient360_db_final.js (collection 12)
 *
 *  Laboratory registry. Referenced by:
 *    • lab_technicians.laboratoryId — staff affiliation
 *    • lab_tests.laboratoryId       — where the test is being performed
 *    • appointments.laboratoryId    — sample collection appointments
 *    • availability_slots.laboratoryId
 *
 *  Each lab maintains a `testCatalog` listing the tests it can perform along
 *  with prices and turnaround times. Doctors querying for labs can filter by
 *  testCode to find labs that offer a specific test.
 *
 *  GeoJSON `location` field follows the same [lng, lat] convention as
 *  Pharmacy.location — see Pharmacy.js for the full explanation.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const GOVERNORATES = [
  'damascus', 'aleppo', 'homs', 'hama', 'latakia', 'tartus',
  'idlib', 'deir_ez_zor', 'raqqa', 'hasakah', 'daraa',
  'as_suwayda', 'quneitra', 'rif_dimashq',
];

const LAB_TYPES = [
  'independent', 'hospital_based', 'clinic_based', 'specialized',
];

const TEST_CATEGORIES = [
  'blood', 'urine', 'stool', 'imaging',
  'microbiology', 'molecular', 'biopsy', 'other',
];

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
];

const SYRIA_LNG_MIN = 35.5;
const SYRIA_LNG_MAX = 42.5;
const SYRIA_LAT_MIN = 32.0;
const SYRIA_LAT_MAX = 37.5;

// ── Sub-schemas ─────────────────────────────────────────────────────────────

const OperatingHoursSchema = new Schema(
  {
    day: { type: String, enum: WEEKDAYS, required: true },
    openTime: { type: String, trim: true },
    closeTime: { type: String, trim: true },
    is24Hours: { type: Boolean, default: false },
  },
  { _id: false },
);

const GeoJSONPointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator(coords) {
          if (!Array.isArray(coords) || coords.length !== 2) return false;
          const [lng, lat] = coords;
          if (typeof lng !== 'number' || typeof lat !== 'number') return false;
          return (
            lng >= SYRIA_LNG_MIN && lng <= SYRIA_LNG_MAX
            && lat >= SYRIA_LAT_MIN && lat <= SYRIA_LAT_MAX
          );
        },
        message: 'الإحداثيات يجب أن تكون [خط الطول، خط العرض] داخل سوريا',
      },
    },
  },
  { _id: false },
);

const TestCatalogItemSchema = new Schema(
  {
    testCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      // e.g. CBC, FBS, HbA1c, LFT, KFT
    },
    testName: { type: String, required: true, trim: true },
    arabicName: { type: String, trim: true },
    category: { type: String, enum: TEST_CATEGORIES, default: 'other' },
    price: { type: Number, min: 0 },
    turnaroundTime: { type: String, trim: true }, // e.g. "2 hours", "24 hours"
    isAvailable: { type: Boolean, default: true },
  },
  { _id: false },
);

// ── Main schema ──────────────────────────────────────────────────────────────

const LaboratorySchema = new Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'اسم المختبر مطلوب'],
      trim: true,
    },
    arabicName: { type: String, trim: true },
    registrationNumber: {
      type: String,
      required: [true, 'رقم التسجيل مطلوب'],
      unique: true,
      trim: true,
    },
    labLicense: { type: String, trim: true },
    labType: { type: String, enum: LAB_TYPES, default: 'independent' },

    // ── Contact ───────────────────────────────────────────────────────────
    phoneNumber: {
      type: String,
      required: [true, 'رقم الهاتف مطلوب'],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'البريد الإلكتروني غير صحيح'],
    },

    // ── Location (text) ───────────────────────────────────────────────────
    governorate: {
      type: String,
      enum: GOVERNORATES,
      required: [true, 'المحافظة مطلوبة'],
    },
    city: {
      type: String,
      required: [true, 'المدينة مطلوبة'],
      trim: true,
    },
    district: { type: String, trim: true },
    address: {
      type: String,
      required: [true, 'العنوان مطلوب'],
      trim: true,
    },

    // ── Location (GeoJSON — REQUIRED for nearest-lab queries) ─────────────
    location: {
      type: GeoJSONPointSchema,
      required: [true, 'إحداثيات GPS للمختبر مطلوبة'],
    },

    // ── Test catalog ──────────────────────────────────────────────────────
    testCatalog: { type: [TestCatalogItemSchema], default: [] },

    // ── Operating hours ───────────────────────────────────────────────────
    operatingHours: { type: [OperatingHoursSchema], default: [] },

    // ── Status ────────────────────────────────────────────────────────────
    isActive: { type: Boolean, default: true },
    isAcceptingTests: { type: Boolean, default: true },

    // ── Ratings (denormalized) ────────────────────────────────────────────
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    collection: 'laboratories',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

LaboratorySchema.index({ governorate: 1, city: 1 }, { name: 'idx_location_text' });
LaboratorySchema.index(
  { isActive: 1, isAcceptingTests: 1 },
  { name: 'idx_status' },
);
LaboratorySchema.index(
  { 'testCatalog.testCode': 1 },
  { name: 'idx_testCode' },
);
LaboratorySchema.index({ averageRating: -1 }, { name: 'idx_rating_desc' });

// 2dsphere — REQUIRED for $near
LaboratorySchema.index({ location: '2dsphere' }, { name: 'idx_location_geo' });

// ── Static methods ──────────────────────────────────────────────────────────

LaboratorySchema.statics.findNearby = function findNearby(longitude, latitude, maxDistanceMeters = 5000) {
  return this.find({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [longitude, latitude] },
        $maxDistance: maxDistanceMeters,
      },
    },
    isActive: true,
    isAcceptingTests: true,
  });
};

/**
 * Find labs that can perform a specific test, optionally near a location.
 *
 * @param {string} testCode - e.g. "CBC", "HbA1c"
 * @param {object} [opts]
 * @param {number} [opts.longitude]
 * @param {number} [opts.latitude]
 * @param {number} [opts.maxDistanceMeters=10000]
 * @returns {mongoose.Query}
 */
LaboratorySchema.statics.findOfferingTest = function findOfferingTest(testCode, opts = {}) {
  const query = {
    'testCatalog.testCode': testCode.toUpperCase(),
    'testCatalog.isAvailable': true,
    isActive: true,
    isAcceptingTests: true,
  };

  if (typeof opts.longitude === 'number' && typeof opts.latitude === 'number') {
    query.location = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [opts.longitude, opts.latitude],
        },
        $maxDistance: opts.maxDistanceMeters || 10000,
      },
    };
  }

  return this.find(query);
};

// ── Instance methods ────────────────────────────────────────────────────────

LaboratorySchema.methods.isOpenNow = function isOpenNow() {
  const now = new Date();
  const damascusFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Damascus',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = damascusFormatter.formatToParts(now);
  const today = parts.find((p) => p.type === 'weekday')?.value;
  const hh = parts.find((p) => p.type === 'hour')?.value;
  const mm = parts.find((p) => p.type === 'minute')?.value;
  const currentTime = `${hh}:${mm}`;

  const todaySchedule = this.operatingHours.find((h) => h.day === today);
  if (!todaySchedule) return false;
  if (todaySchedule.is24Hours) return true;
  if (!todaySchedule.openTime || !todaySchedule.closeTime) return false;
  return currentTime >= todaySchedule.openTime
    && currentTime <= todaySchedule.closeTime;
};

/**
 * Get the price and turnaround time for a specific test, or null if not offered.
 */
LaboratorySchema.methods.getTestInfo = function getTestInfo(testCode) {
  const item = this.testCatalog.find(
    (t) => t.testCode === testCode.toUpperCase() && t.isAvailable,
  );
  return item || null;
};

LaboratorySchema.methods.refreshRating = async function refreshRating() {
  const Review = mongoose.model('Review');
  const result = await Review.aggregate([
    { $match: { laboratoryId: this._id, status: 'approved' } },
    {
      $group: {
        _id: '$laboratoryId',
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

module.exports = mongoose.model('Laboratory', LaboratorySchema);