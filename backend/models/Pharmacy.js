/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Pharmacy Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: pharmacies
 *  Source of truth: patient360_db_final.js (collection 11)
 *
 *  Pharmacy registry. Referenced by:
 *    • pharmacists.pharmacyId       — which pharmacy each pharmacist works at
 *    • pharmacy_dispensing.pharmacyId — where each dispense happened
 *    • pharmacy_inventory.pharmacyId  — stock levels per pharmacy
 *
 *  ───────────────────────────────────────────────────────────────────────
 *  ⚠️  GeoJSON convention reminder:
 *
 *  MongoDB stores geographic coordinates in GeoJSON Point format:
 *      { type: "Point", coordinates: [longitude, latitude] }
 *
 *  Note the order: LONGITUDE FIRST, latitude second. This trips up most
 *  developers because every other API (Google Maps, Apple Maps, web GPS)
 *  uses [latitude, longitude]. The reason MongoDB chose this order is
 *  consistency with the GeoJSON spec (RFC 7946), which uses [x, y] = [lng, lat].
 *
 *  Syrian coordinate ranges to validate against:
 *    longitude: 35.5 → 42.5  (west to east)
 *    latitude:  32.0 → 37.5  (south to north)
 *
 *  Example — Damascus city center:
 *    coordinates: [36.2765, 33.5138]
 *
 *  The 2dsphere index on `location` enables $near, $geoWithin, $geoIntersects
 *  queries for the "nearest pharmacy" feature.
 *  ───────────────────────────────────────────────────────────────────────
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

// Syrian geographic bounding box (used by the GeoJSON validator).
const SYRIA_LNG_MIN = 35.5;
const SYRIA_LNG_MAX = 42.5;
const SYRIA_LAT_MIN = 32.0;
const SYRIA_LAT_MAX = 37.5;

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

/**
 * GeoJSON Point sub-schema. The `coordinates` field MUST be in
 * [longitude, latitude] order per the GeoJSON spec.
 */
const GeoJSONPointSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      validate: {
        validator(coords) {
          if (!Array.isArray(coords) || coords.length !== 2) return false;
          const [lng, lat] = coords;
          if (typeof lng !== 'number' || typeof lat !== 'number') return false;
          // Validate coordinates fall within Syria
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

    // ── Location (GeoJSON — REQUIRED for nearest-pharmacy queries) ────────
    location: {
      type: GeoJSONPointSchema,
      required: [true, 'إحداثيات GPS للصيدلية مطلوبة'],
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

// ── Indexes ─────────────────────────────────────────────────────────────────

PharmacySchema.index({ governorate: 1, city: 1 }, { name: 'idx_location_text' });
PharmacySchema.index(
  { isActive: 1, isAcceptingOrders: 1 },
  { name: 'idx_status' },
);
PharmacySchema.index({ averageRating: -1 }, { name: 'idx_rating_desc' });

// 2dsphere index — REQUIRED for $near geospatial queries
PharmacySchema.index({ location: '2dsphere' }, { name: 'idx_location_geo' });

// ── Virtuals ────────────────────────────────────────────────────────────────

/**
 * Convenience accessor: returns [longitude, latitude] or null.
 */
PharmacySchema.virtual('coordinates').get(function () {
  return this.location?.coordinates || null;
});

// ── Static methods ──────────────────────────────────────────────────────────

/**
 * Find pharmacies near a given GPS coordinate, ordered by distance.
 *
 * @param {number} longitude
 * @param {number} latitude
 * @param {number} [maxDistanceMeters=5000] - default 5km radius
 * @returns {mongoose.Query}
 */
PharmacySchema.statics.findNearby = function findNearby(longitude, latitude, maxDistanceMeters = 5000) {
  return this.find({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [longitude, latitude] },
        $maxDistance: maxDistanceMeters,
      },
    },
    isActive: true,
    isAcceptingOrders: true,
  });
};

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Is this pharmacy currently open based on its operatingHours and the
 * current time in the Asia/Damascus timezone?
 *
 * @returns {boolean}
 */
PharmacySchema.methods.isOpenNow = function isOpenNow() {
  // Get current time in Damascus regardless of server timezone
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