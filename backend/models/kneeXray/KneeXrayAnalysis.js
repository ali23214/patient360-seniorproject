/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  KneeXrayAnalysis — Mongoose Model
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: knee_xray_analyses
 *  Purpose:    Persists every knee OA (osteoarthritis) AI analysis performed
 *              by orthopedist doctors on patient knee X-rays.
 *
 *  ⚠️  NOTE ON THE LOCKED DB SCHEMA
 *      The `patient360_db_final.js` script (25 collections) is locked.
 *      This model adds a 26th collection dynamically via Mongoose — it does
 *      NOT touch the locked initialization file. Same pattern used for
 *      `drug_risk_checks` in the Drug Risk integration phase.
 *
 *  Model output (from FastAPI on port 8003):
 *      {
 *        predicted_class: "Mild_OA" | "Normal" | "Severe_OA",
 *        description:     "Grade 1-2: Doubtful to Minimal Osteoarthritis",
 *        confidence:      78.45,
 *        all_probabilities: {
 *          Mild_OA:   78.45,
 *          Normal:    15.20,
 *          Severe_OA:  6.35
 *        }
 *      }
 *
 *  Usage:
 *      const { KneeXrayAnalysis } = require('../models');
 *      const analysis = new KneeXrayAnalysis({ ... });
 *      await analysis.save();
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

// ════════════════════════════════════════════════════════════════════════════
// ENUMS — exposed so controllers/services use the same source of truth
// ════════════════════════════════════════════════════════════════════════════

/** The 3 classes the model can predict. */
const KNEE_OA_CLASSES = ['Normal', 'Mild_OA', 'Severe_OA'];

/** Arabic display labels for each class (used in audit logs + dashboards). */
const KNEE_OA_CLASS_LABELS_AR = {
  Normal:    'سليم',
  Mild_OA:   'التهاب خفيف',
  Severe_OA: 'التهاب شديد',
};

// ════════════════════════════════════════════════════════════════════════════
// SUB-SCHEMA — per-class probability breakdown
// ════════════════════════════════════════════════════════════════════════════

const probabilitiesSchema = new mongoose.Schema(
  {
    Normal:    { type: Number, min: 0, max: 100, required: true },
    Mild_OA:   { type: Number, min: 0, max: 100, required: true },
    Severe_OA: { type: Number, min: 0, max: 100, required: true },
  },
  { _id: false }
);

// ════════════════════════════════════════════════════════════════════════════
// MAIN SCHEMA
// ════════════════════════════════════════════════════════════════════════════

const kneeXrayAnalysisSchema = new mongoose.Schema(
  {
    // ── Patient identification (one of these must be set) ──────────────────
    // Mirrors the locked DB pattern: persons vs children separation.
    patientPersonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Person',
      index: true,
    },
    patientChildId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Children',
      index: true,
    },

    // ── Cached patient identifier (denormalized for quick display) ─────────
    patientNationalId: {
      type: String,
      index: true,
    },
    patientChildRegistrationNumber: {
      type: String,
      index: true,
    },
    patientFullName: { type: String },

    // ── Doctor who performed the analysis ──────────────────────────────────
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    doctorAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      index: true,
    },
    doctorFullName: { type: String },

    // ── Linked clinical record (optional — set if analyzed during a visit) ─
    visitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Visit',
      sparse: true,
      index: true,
    },

    // ── The uploaded X-ray image ───────────────────────────────────────────
    image: {
      filename:     { type: String, required: true }, // saved filename on disk
      originalName: { type: String },                  // user's original name
      mimetype:     { type: String },                  // image/jpeg | image/png
      sizeBytes:    { type: Number },
      url:          { type: String, required: true },  // /uploads/knee-xray/...
      uploadedAt:   { type: Date,   default: Date.now },
    },

    // ── AI model response (verbatim from FastAPI) ──────────────────────────
    aiPredictedClass: {
      type:     String,
      enum:     KNEE_OA_CLASSES,
      required: true,
      index:    true,
    },
    aiPredictedClassArabic: {
      type: String,
    },
    aiDescription: {
      type: String,
      required: true,
    },
    aiDescriptionArabic: {
      type: String,
    },
    aiConfidence: {
      type:     Number,
      min:      0,
      max:      100,
      required: true,
    },
    aiAllProbabilities: {
      type:     probabilitiesSchema,
      required: true,
    },
    aiModelVersion: {
      type:    String,
      default: 'DenseNet121_KneeOA_3Class',
    },
    aiProcessedAt: {
      type:    Date,
      default: Date.now,
    },
    aiRawResponse: {
      type: String, // stringified JSON — useful for debugging model drift
    },

    // ── Optional: doctor's clinical notes on top of the AI output ──────────
    doctorNotes: {
      type:      String,
      maxlength: 2000,
    },

    // ── Workflow status ────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    ['analyzed', 'reviewed_by_doctor', 'archived'],
      default: 'analyzed',
      index:   true,
    },

    // ── Audit trail ────────────────────────────────────────────────────────
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: true, // adds createdAt + updatedAt
    collection: 'knee_xray_analyses',
  }
);

// ════════════════════════════════════════════════════════════════════════════
// INDEXES — compound indexes for the dashboard query patterns
// ════════════════════════════════════════════════════════════════════════════

// Doctor's own history, newest first
kneeXrayAnalysisSchema.index({ doctorId: 1, createdAt: -1 });

// Per-patient history (adult)
kneeXrayAnalysisSchema.index({ patientPersonId: 1, createdAt: -1 });

// Per-patient history (child)
kneeXrayAnalysisSchema.index({ patientChildId: 1, createdAt: -1 });

// Class-based analytics (e.g., "how many severe cases this month?")
kneeXrayAnalysisSchema.index({ aiPredictedClass: 1, createdAt: -1 });

// ════════════════════════════════════════════════════════════════════════════
// PRE-SAVE HOOK — auto-populate Arabic labels
// ════════════════════════════════════════════════════════════════════════════

kneeXrayAnalysisSchema.pre('save', function (next) {
  if (this.aiPredictedClass && !this.aiPredictedClassArabic) {
    this.aiPredictedClassArabic = KNEE_OA_CLASS_LABELS_AR[this.aiPredictedClass] || '';
  }
  next();
});

// ════════════════════════════════════════════════════════════════════════════
// STATIC HELPERS — exported for use in controllers
// ════════════════════════════════════════════════════════════════════════════

/**
 * Validates that an AI response from FastAPI has the expected shape.
 * Returns `{ valid: true }` or `{ valid: false, reason: '...' }`.
 */
kneeXrayAnalysisSchema.statics.validateAiResponse = function (resp) {
  if (!resp || typeof resp !== 'object') {
    return { valid: false, reason: 'Empty AI response' };
  }
  if (!KNEE_OA_CLASSES.includes(resp.predicted_class)) {
    return { valid: false, reason: `Unknown class: ${resp.predicted_class}` };
  }
  if (typeof resp.confidence !== 'number' || resp.confidence < 0 || resp.confidence > 100) {
    return { valid: false, reason: 'Confidence out of range' };
  }
  if (!resp.all_probabilities || typeof resp.all_probabilities !== 'object') {
    return { valid: false, reason: 'Missing all_probabilities' };
  }
  for (const cls of KNEE_OA_CLASSES) {
    if (typeof resp.all_probabilities[cls] !== 'number') {
      return { valid: false, reason: `Missing probability for class ${cls}` };
    }
  }
  return { valid: true };
};

// ════════════════════════════════════════════════════════════════════════════
// MODEL EXPORT
// ════════════════════════════════════════════════════════════════════════════

const KneeXrayAnalysis = mongoose.model('KneeXrayAnalysis', kneeXrayAnalysisSchema);

module.exports = KneeXrayAnalysis;
module.exports.KNEE_OA_CLASSES = KNEE_OA_CLASSES;
module.exports.KNEE_OA_CLASS_LABELS_AR = KNEE_OA_CLASS_LABELS_AR;
