/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Laboratory Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: laboratories
 *  Source of truth: patient360_db_final_v2.js (collection 12)
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
 *  ┌──── v2 SCHEMA CHANGE (2026-05-27) ─────────────────────────────────┐
 *  │ ✗ REMOVED: GeoJSONPointSchema sub-schema (GPS coordinates)         │
 *  │ ✗ REMOVED: `location` field on the main schema                     │
 *  │ ✗ REMOVED: `location: 2dsphere` index                              │
 *  │ ✗ REMOVED: static method `findNearby()`                            │
 *  │ ✓ KEPT (simplified): static method `findOfferingTest()` — now      │
 *  │   filters by testCode + governorate/city only (no GPS distance).   │
 *  │                                                                    │
 *  │ Reason: Team decision — GPS-based nearest-lab queries are out of   │
 *  │   MVP scope. Text address fields provide sufficient location info. │
 *  └────────────────────────────────────────────────────────────────────┘
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

    // ── Location (text only — v2: GeoJSON removed) ────────────────────────
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

// ── Indexes (v2: 2dsphere index removed) ────────────────────────────────────

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

// ── Static methods ──────────────────────────────────────────────────────────

/**
 * Find labs that can perform a specific test, optionally filtered by
 * governorate and/or city.
 *
 * v2 NOTE: GPS-based proximity filtering was removed. Callers can pass
 * `governorate` and/or `city` to scope results geographically.
 *
 * @param {string} testCode - e.g. "CBC", "HbA1c"
 * @param {object} [opts]
 * @param {string} [opts.governorate] - one of GOVERNORATES
 * @param {string} [opts.city]
 * @returns {mongoose.Query}
 */
LaboratorySchema.statics.findOfferingTest = function findOfferingTest(testCode, opts = {}) {
  const query = {
    'testCatalog.testCode': testCode.toUpperCase(),
    'testCatalog.isAvailable': true,
    isActive: true,
    isAcceptingTests: true,
  };

  if (opts.governorate) query.governorate = opts.governorate;
  if (opts.city) query.city = opts.city;

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
