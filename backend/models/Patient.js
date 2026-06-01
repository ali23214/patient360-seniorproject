/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Patient Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: patients
 *  Source of truth: patient360_db_final.js (collection 04)
 *
 *  Static medical profile that persists across all visits:
 *    • Biometrics (blood type, height, weight, BMI)
 *    • Lifestyle (smoking, alcohol, exercise, diet)
 *    • Medical history (chronic diseases, allergies, family history, surgeries)
 *    • Long-term medications
 *    • Emergency contact
 *
 *  Profile linkage (XOR — exactly one must be set):
 *    • personId  → adult patients
 *    • childId   → child patients under 14
 *
 *  Per the locked schema, allergies/chronicDiseases/familyHistory are simple
 *  string arrays. Detailed structures (with ICD codes etc.) belong in the
 *  per-visit `visits.diagnosis` field, not here.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const BLOOD_TYPES = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown',
];

const RH_FACTORS = ['positive', 'negative', 'unknown'];

const SMOKING_STATUSES = ['non-smoker', 'current_smoker', 'former_smoker'];

const ALCOHOL_LEVELS = ['none', 'occasional', 'moderate', 'heavy'];

const EXERCISE_FREQUENCIES = [
  'sedentary', 'light', 'moderate', 'active', 'very_active',
];

const DIET_TYPES = ['regular', 'vegetarian', 'vegan', 'halal', 'other'];

// ── Sub-schemas ─────────────────────────────────────────────────────────────

const PreviousSurgerySchema = new Schema(
  {
    surgeryName: { type: String, required: true, trim: true },
    surgeryDate: { type: Date },
    hospital: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { _id: false },
);

const EmergencyContactSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'اسم جهة الاتصال للطوارئ مطلوب'],
      trim: true,
    },
    relationship: {
      type: String,
      required: [true, 'صلة القرابة مطلوبة'],
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, 'رقم هاتف الطوارئ مطلوب'],
      trim: true,
    },
    alternativePhoneNumber: { type: String, trim: true },
  },
  { _id: false },
);

// ── Main schema ──────────────────────────────────────────────────────────────

const PatientSchema = new Schema(
  {
    // ── Profile reference (XOR enforced by pre-validate hook) ─────────────
    personId: {
      type: Schema.Types.ObjectId,
      ref: 'Person',
      sparse: true,
    },
    childId: {
      type: Schema.Types.ObjectId,
      ref: 'Children',
      sparse: true,
    },

    // ── Biometrics ────────────────────────────────────────────────────────
    bloodType: { type: String, enum: BLOOD_TYPES, default: 'unknown' },
    rhFactor: { type: String, enum: RH_FACTORS, default: 'unknown' },
    height: {
      type: Number,
      min: [0, 'الطول لا يمكن أن يكون سالب'],
      max: [300, 'الطول يجب ألا يتجاوز 300 سم'],
    },
    weight: {
      type: Number,
      min: [0, 'الوزن لا يمكن أن يكون سالب'],
      max: [500, 'الوزن يجب ألا يتجاوز 500 كغ'],
    },
    bmi: { type: Number }, // computed by pre-save hook below

    // ── Lifestyle ─────────────────────────────────────────────────────────
    smokingStatus: { type: String, enum: SMOKING_STATUSES },
    alcoholConsumption: { type: String, enum: ALCOHOL_LEVELS },
    exerciseFrequency: { type: String, enum: EXERCISE_FREQUENCIES },
    dietType: { type: String, enum: DIET_TYPES },

    // ── Medical history (simple string arrays per locked schema) ──────────
    chronicDiseases: { type: [String], default: [] },
    allergies: { type: [String], default: [] },
    familyHistory: { type: [String], default: [] },

    // ── Previous surgeries (structured) ───────────────────────────────────
    previousSurgeries: { type: [PreviousSurgerySchema], default: [] },

    // ── Long-term medications (simple string array per locked schema) ─────
    currentMedications: { type: [String], default: [] },

    // ── Emergency contact ─────────────────────────────────────────────────
    emergencyContact: { type: EmergencyContactSchema },

    // ── Statistics (denormalized for dashboard performance) ───────────────
    medicalCardNumber: { type: String, trim: true, sparse: true },
    totalVisits: { type: Number, default: 0, min: 0 },
    lastVisitDate: { type: Date },
  },
  {
    timestamps: true,
    collection: 'patients',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

PatientSchema.index(
  { personId: 1 },
  { unique: true, sparse: true, name: 'idx_personId_unique' },
);
PatientSchema.index(
  { childId: 1 },
  { unique: true, sparse: true, name: 'idx_childId_unique' },
);
PatientSchema.index(
  { medicalCardNumber: 1 },
  { unique: true, sparse: true, name: 'idx_medCard_unique' },
);
PatientSchema.index({ bloodType: 1 }, { name: 'idx_bloodType' });

// ── Virtuals ────────────────────────────────────────────────────────────────

/**
 * BMI category per WHO classification.
 *   < 18.5  → underweight
 *   18.5-24.9 → normal
 *   25-29.9 → overweight
 *   ≥ 30 → obese
 *
 * @returns {string|null}
 */
PatientSchema.virtual('bmiCategory').get(function () {
  if (typeof this.bmi !== 'number') return null;
  if (this.bmi < 18.5) return 'underweight';
  if (this.bmi < 25) return 'normal';
  if (this.bmi < 30) return 'overweight';
  return 'obese';
});

// ── Pre-save: auto-compute BMI when height + weight are set ─────────────────

PatientSchema.pre('save', function computeBMI(next) {
  if (
    typeof this.height === 'number' && this.height > 0
    && typeof this.weight === 'number' && this.weight > 0
  ) {
    const heightInMeters = this.height / 100;
    this.bmi = Number(
      (this.weight / (heightInMeters * heightInMeters)).toFixed(1),
    );
  } else {
    this.bmi = undefined;
  }
  next();
});

// ── Pre-validate: enforce XOR between personId and childId ──────────────────

PatientSchema.pre('validate', function enforceProfileXor(next) {
  const hasPerson = !!this.personId;
  const hasChild = !!this.childId;

  if (!hasPerson && !hasChild) {
    return next(
      new mongoose.Error.ValidationError(this).addError(
        'personId',
        new mongoose.Error.ValidatorError({
          message: 'يجب تحديد personId أو childId',
          path: 'personId',
        }),
      ),
    );
  }
  if (hasPerson && hasChild) {
    return next(
      new mongoose.Error.ValidationError(this).addError(
        'childId',
        new mongoose.Error.ValidatorError({
          message: 'لا يمكن تحديد personId و childId معاً',
          path: 'childId',
        }),
      ),
    );
  }
  return next();
});

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Increment the totalVisits counter and refresh lastVisitDate.
 * Called by visitController after a visit is saved.
 */
PatientSchema.methods.recordVisit = async function recordVisit(visitDate) {
  this.totalVisits = (this.totalVisits || 0) + 1;
  this.lastVisitDate = visitDate || new Date();
  return this.save();
};

module.exports = mongoose.model('Patient', PatientSchema);