/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Pharmacy Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: pharmacies
 *  Source of truth: patient360_db_final_v2.js (collection 11)
 *
 *  Pharmacy registry. Referenced by:
 *    • pharmacists.pharmacyId         — which pharmacy each pharmacist works at
 *    • pharmacy_dispensing.pharmacyId — where each dispense happened
 *    • pharmacy_inventory.pharmacyId  — stock levels per pharmacy
 *
 *  ┌──── v2 SCHEMA CHANGE (2026-05-27) ─────────────────────────────────┐
 *  │ ✗ REMOVED: GeoJSONPointSchema sub-schema (GPS coordinates)         │
 *  │ ✗ REMOVED: `location` field on the main schema                     │
 *  │ ✗ REMOVED: `location: 2dsphere` index                              │
 *  │ ✗ REMOVED: virtual `coordinates`                                   │
 *  │ ✗ REMOVED: static method `findNearby()`                            │
 *  │                                                                    │
 *  │ Reason: Team decision — GPS-based nearest-pharmacy queries are     │
 *  │   out of MVP scope. Text address fields (governorate, city,        │
 *  │   district, address) provide sufficient location for end users.    │
 *  │   Removing GPS simplifies the SignUp and Admin workflows.          │
 *  │                                                                    │
 *  │ All other fields and methods are preserved:                        │
 *  │   ✓ Identity, contact, type, address (text only)                  │
 *  │   ✓ operatingHours[] for "is open now" calculations                │
 *  │   ✓ isOpenNow() instance method                                    │
 *  │   ✓ refreshRating() instance method                                │
 *  │   ✓ Ratings, status flags, timestamps                              │
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

const PHARMACY_TYPES = ['community', 'hospital', 'clinic', 'online'];

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

// ── Main schema ──────────────────────────────────────────────────────────────

const PharmacySchema = new Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, 'اسم الصيدلية مطلوب'],
      trim: true,
    },
    arabicName: { type: String, trim: true },
    registrationNumber: {
      type: String,
      required: [true, 'رقم التسجيل مطلوب'],
      unique: true,
      trim: true,
    },
    pharmacyLicense: {
      type: String,
      required: [true, 'رقم الترخيص مطلوب'],
      unique: true,
      trim: true,
    },

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

    // ── Type ──────────────────────────────────────────────────────────────
    pharmacyType: { type: String, enum: PHARMACY_TYPES, default: 'community' },

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

    // ── Operating hours ───────────────────────────────────────────────────
    operatingHours: { type: [OperatingHoursSchema], default: [] },

    // ── Status ────────────────────────────────────────────────────────────
    isActive: { type: Boolean, default: true },
    isAcceptingOrders: { type: Boolean, default: true },

    // ── Ratings (denormalized) ────────────────────────────────────────────
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    collection: 'pharmacies',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes (v2: 2dsphere index removed) ────────────────────────────────────

PharmacySchema.index({ governorate: 1, city: 1 }, { name: 'idx_location_text' });
PharmacySchema.index(
  { isActive: 1, isAcceptingOrders: 1 },
  { name: 'idx_status' },
);
PharmacySchema.index({ averageRating: -1 }, { name: 'idx_rating_desc' });

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Is this pharmacy currently open based on its operatingHours and the
 * current time in the Asia/Damascus timezone?
 *
 * @returns {boolean}
 */
PharmacySchema.methods.isOpenNow = function isOpenNow() {
  // Get current time in Damascus regardless of server timezone.
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
 * Recompute averageRating from approved reviews.
 */
PharmacySchema.methods.refreshRating = async function refreshRating() {
  const Review = mongoose.model('Review');
  const result = await Review.aggregate([
    { $match: { pharmacyId: this._id, status: 'approved' } },
    {
      $group: {
        _id: '$pharmacyId',
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

module.exports = mongoose.model('Pharmacy', PharmacySchema);
