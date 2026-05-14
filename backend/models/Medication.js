/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Medication Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: medications
 *  Source of truth: patient360_db_final.js (collection 18)
 *
 *  Syrian drug database. Doctors pick from this catalog when prescribing.
 *  Pharmacists query this for OTC sales (when requiresPrescription=false).
 *
 *  Naming convention (both languages required for clarity):
 *    • tradeName            — English brand name (e.g. "Panadol")
 *    • arabicTradeName      — Arabic brand name (e.g. "بانادول")
 *    • scientificName       — INN/generic (e.g. "Paracetamol")
 *    • arabicScientificName — Arabic generic (e.g. "باراسيتامول")
 *
 *  The `interactions` array holds names of drugs this medication
 *  interacts with — used by the pharmacist UI to flag dangerous combos
 *  during the dispensing flow.
 *
 *  Note: drug interaction data should ideally come from a curated source
 *  like RxNorm or DrugBank. The free-text array here is a starting point;
 *  upgrading to a structured interaction service is a future enhancement.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums (kept in sync with locked schema) ─────────────────────────────────

const DOSAGE_FORMS = [
  'tablet', 'capsule', 'syrup', 'solution', 'injection',
  'cream', 'ointment', 'gel', 'drops', 'inhaler',
  'patch', 'suppository', 'powder', 'spray',
];

const CATEGORIES = [
  'antibiotic', 'analgesic', 'antihypertensive', 'antidiabetic',
  'antidepressant', 'antipsychotic', 'antihistamine', 'antifungal',
  'antiviral', 'cardiovascular', 'gastrointestinal', 'respiratory',
  'hormonal', 'dermatological', 'neurological', 'supplement',
  'vitamin', 'vaccine', 'contrast_agent', 'other',
];

// ── Main schema ──────────────────────────────────────────────────────────────

const MedicationSchema = new Schema(
  {
    // ── Identifiers ───────────────────────────────────────────────────────
    medicationCode: {
      type: String,
      required: [true, 'الرمز الداخلي للدواء مطلوب'],
      unique: true,
      trim: true,
      uppercase: true,
      // Convention: MED-XXXXX (5-digit sequence)
    },
    syrianDrugCode: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      // Syrian Ministry of Health drug registry code, when known
    },

    // ── Names (English + Arabic, both languages important) ────────────────
    tradeName: {
      type: String,
      required: [true, 'الاسم التجاري مطلوب'],
      trim: true,
      index: true,
    },
    arabicTradeName: { type: String, trim: true, index: true },
    scientificName: {
      type: String,
      required: [true, 'الاسم العلمي مطلوب'],
      trim: true,
      index: true,
    },
    arabicScientificName: { type: String, trim: true },

    // ── Manufacturer info ─────────────────────────────────────────────────
    manufacturer: { type: String, trim: true },
    countryOfOrigin: { type: String, trim: true, default: 'Syria' },

    // ── Strength & form ───────────────────────────────────────────────────
    strength: {
      type: String,
      trim: true,
      // e.g. "500mg", "250mg/5ml", "0.1%"
    },
    dosageForm: { type: String, enum: DOSAGE_FORMS },
    category: { type: String, enum: CATEGORIES, index: true },

    // ── Composition & safety ──────────────────────────────────────────────
    activeIngredients: { type: [String], default: [] },
    interactions: {
      type: [String],
      default: [],
      // Names of drugs this one interacts with — used by pharmacist UI
    },
    contraindications: { type: [String], default: [] },
    sideEffects: { type: [String], default: [] },

    // ── Regulatory flags ──────────────────────────────────────────────────
    requiresPrescription: { type: Boolean, default: true, index: true },
    controlledSubstance: { type: Boolean, default: false },

    // ── Availability ──────────────────────────────────────────────────────
    isAvailable: { type: Boolean, default: true },
    isDiscontinued: { type: Boolean, default: false },

    // ── Storage ───────────────────────────────────────────────────────────
    storageConditions: {
      type: String,
      trim: true,
      // e.g. "Store below 25°C", "Refrigerate 2-8°C"
    },
  },
  {
    timestamps: true,
    collection: 'medications',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

MedicationSchema.index(
  { syrianDrugCode: 1 },
  { unique: true, sparse: true, name: 'idx_syrianCode_unique' },
);
MedicationSchema.index(
  { isAvailable: 1, isDiscontinued: 1 },
  { name: 'idx_status' },
);

// ── Static methods ──────────────────────────────────────────────────────────

/**
 * Search by trade name, scientific name, or Arabic name.
 * Used by the doctor's prescription UI typeahead.
 *
 * @param {string} term
 * @returns {mongoose.Query}
 */
MedicationSchema.statics.search = function search(term) {
  if (!term || term.trim().length < 2) {
    return this.find().limit(20);
  }
  const regex = new RegExp(term.trim(), 'i');
  return this.find({
    $or: [
      { tradeName: regex },
      { scientificName: regex },
      { arabicTradeName: regex },
      { arabicScientificName: regex },
    ],
    isAvailable: true,
    isDiscontinued: false,
  }).limit(20);
};

/**
 * Generate the next available medicationCode in the format MED-XXXXX.
 *
 * @returns {Promise<string>}
 */
MedicationSchema.statics.generateMedicationCode = async function generateMedicationCode() {
  const count = await this.estimatedDocumentCount();
  const sequence = String(count + 1).padStart(5, '0');
  return `MED-${sequence}`;
};

// ── Pre-save: auto-generate medicationCode if missing ───────────────────────

MedicationSchema.pre('save', async function autoGenerateCode(next) {
  if (this.isNew && !this.medicationCode) {
    try {
      this.medicationCode = await this.constructor.generateMedicationCode();
    } catch (err) {
      return next(err);
    }
  }
  return next();
});

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Check if this medication interacts with any of the given drug names.
 * Returns the list of conflicting drugs.
 *
 * @param {string[]} otherDrugNames - drug names to check against
 * @returns {string[]} drugs that conflict
 */
MedicationSchema.methods.findInteractionsWith = function findInteractionsWith(otherDrugNames) {
  if (!Array.isArray(otherDrugNames) || otherDrugNames.length === 0) return [];

  const interactions = (this.interactions || []).map((d) => d.toLowerCase());
  return otherDrugNames.filter((name) => {
    const lower = name.toLowerCase();
    return interactions.some(
      (intDrug) => intDrug.includes(lower) || lower.includes(intDrug),
    );
  });
};

module.exports = mongoose.model('Medication', MedicationSchema);