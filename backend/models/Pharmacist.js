/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Pharmacist Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: pharmacists
 *  Source of truth: patient360_db_final.js (collection 07)
 *
 *  Pharmacist professional profile. Always linked to:
 *    • personId   → adult Person record
 *    • pharmacyId → the pharmacy where they work
 *
 *  The pharmacyId field was MISSING from the previous Mongoose schema
 *  (one of the silent bugs from the earlier analysis). It is now correctly
 *  declared as a required ref so:
 *    • PharmacistDashboard can show "your pharmacy" stats
 *    • Dispensing events can be attributed to the right pharmacy
 *    • The "nearest pharmacy" feature can find which pharmacist is on shift
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const DEGREES = ['PharmD', 'BSc Pharmacy', 'MSc Pharmacy'];

const SPECIALIZATIONS = [
  'Clinical Pharmacy', 'Hospital Pharmacy', 'Community Pharmacy',
  'Industrial Pharmacy', 'Pharmacology',
];

const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'shift-based'];

// ── Main schema ──────────────────────────────────────────────────────────────

const PharmacistSchema = new Schema(
  {
    // ── Identity link ─────────────────────────────────────────────────────
    personId: {
      type: Schema.Types.ObjectId,
      ref: 'Person',
      required: [true, 'معرّف الشخص مطلوب'],
      unique: true,
    },

    // ── License ───────────────────────────────────────────────────────────
    pharmacyLicenseNumber: {
      type: String,
      required: [true, 'رقم الترخيص الصيدلاني مطلوب'],
      unique: true,
      trim: true,
      uppercase: true,
    },

    // ── Pharmacy affiliation (REQUIRED — was missing in old schema) ───────
    pharmacyId: {
      type: Schema.Types.ObjectId,
      ref: 'Pharmacy',
      required: [true, 'الصيدلية التابع لها مطلوبة'],
      index: true,
    },

    // ── Qualifications ────────────────────────────────────────────────────
    degree: { type: String, enum: DEGREES },
    specialization: { type: String, enum: SPECIALIZATIONS },
    yearsOfExperience: { type: Number, min: 0 },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES },

    // ── Status ────────────────────────────────────────────────────────────
    isAvailable: { type: Boolean, default: true },

    // ── Statistics (denormalized) ─────────────────────────────────────────
    totalPrescriptionsDispensed: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    collection: 'pharmacists',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Query helpers ───────────────────────────────────────────────────────────

PharmacistSchema.query.byPharmacy = function byPharmacy(pharmacyId) {
  return this.where({ pharmacyId, isAvailable: true });
};

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Increment the dispensing counter. Called after a successful dispense
 * event by pharmacy_dispensing controller.
 */
PharmacistSchema.methods.recordDispense = async function recordDispense() {
  this.totalPrescriptionsDispensed = (this.totalPrescriptionsDispensed || 0) + 1;
  return this.save();
};

module.exports = mongoose.model('Pharmacist', PharmacistSchema);