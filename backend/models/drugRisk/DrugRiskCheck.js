/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DrugRiskCheck — Mongoose model  (collection: drug_risk_checks)
 *  ─────────────────────────────────────────────────────────────────────────
 *  Stores every drug-risk check performed against Kinan's FastAPI service,
 *  whether triggered by a patient (self-inquiry) or by a doctor (proactive
 *  conflict screening while prescribing).
 *
 *  Why we store these:
 *    1. Audit trail for medical-legal traceability
 *    2. Patient history: lets the patient review their past inquiries
 *    3. Doctor visibility: lets the doctor see what the patient has been
 *       asking about before the consultation
 *    4. Analytics: which drugs most frequently trigger conflicts, etc.
 *
 *  Document size is small (~1-2 KB) so this collection scales linearly with
 *  usage. Heavy indexes on patient + date + isOutOfScope for fast lookups.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const drugRiskCheckSchema = new mongoose.Schema(
  {
    // ── Who triggered the check ─────────────────────────────────────────
    // Exactly one of patientPersonId / patientChildId is set (matches the
    // platform's adult-vs-child polymorphism).
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

    // The role of the user who initiated the check. Doctor-initiated checks
    // include doctorId; patient self-checks do not.
    initiatedBy: {
      type: String,
      enum: ['patient', 'doctor'],
      required: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      index: true,
      // Only set when initiatedBy === 'doctor'
    },

    // ── What the user actually submitted ────────────────────────────────
    // The raw text exactly as sent to the FastAPI pipeline. Useful for
    // debugging unexpected outputs.
    inputText: {
      type: String,
      required: true,
      maxlength: 500,
    },

    // Snapshot of the profile we built and sent to FastAPI. Stored so a
    // result can be reproduced and explained months later even if the
    // patient's record changes.
    profileSnapshot: {
      allergies: [{ type: String }],
      chronicDiseases: [{ type: String }],
      geneticDiseases: [{ type: String }],
      currentMedications: [{ type: String }],
    },

    // ── The FastAPI response (verbatim — all 7 fields from format_patient_output_v2) ─
    result: {
      drugNameAr: { type: String },
      normalizedDrug: { type: String },
      riskLevelAr: {
        type: String,
        enum: ['مرتفع', 'متوسط', 'منخفض', 'غير مؤكد', 'غير معروف', null],
      },
      reasonAr: { type: String },
      adviceAr: { type: String },
      warningAr: { type: String },
      interactionWarningAr: { type: String },
    },

    // ── Backend-computed flags (don't come from FastAPI — we derive them) ─
    // True when the patient asked about a drug we don't have in our supported
    // categories (painkillers / respiratory / digestive). For doctors we
    // silently skip; for patients we show a transparent "غير مدعوم" message.
    isOutOfScope: {
      type: Boolean,
      default: false,
      index: true,
    },

    // True when the FastAPI returned a non-low risk that warrants attention
    // (anything other than 'منخفض' or null).
    isHighRisk: {
      type: Boolean,
      default: false,
      index: true,
    },

    // For doctor-initiated checks: did the doctor proceed with prescribing
    // despite the conflict? Set later via PATCH when the doctor confirms.
    doctorOverride: {
      acknowledged: { type: Boolean, default: false },
      acknowledgedAt: { type: Date },
      justification: { type: String, maxlength: 500 },
    },

    // ── FastAPI call telemetry (for ops) ────────────────────────────────
    fastApiRequestMs: { type: Number },
    fastApiStatus: { type: Number }, // HTTP status returned
    fastApiError: { type: String },  // Set only on failure
  },
  {
    timestamps: true,
    collection: 'drug_risk_checks',
  }
);

// ── Compound indexes for common queries ────────────────────────────────
// "Show me this patient's check history, newest first"
drugRiskCheckSchema.index({ patientPersonId: 1, createdAt: -1 });
drugRiskCheckSchema.index({ patientChildId: 1, createdAt: -1 });

// "Show me all checks a doctor performed for a given patient"
drugRiskCheckSchema.index({ doctorId: 1, patientPersonId: 1, createdAt: -1 });

// "What were the most common high-risk drugs this month?" (analytics)
drugRiskCheckSchema.index({ isHighRisk: 1, createdAt: -1 });

module.exports = mongoose.model('DrugRiskCheck', drugRiskCheckSchema);
