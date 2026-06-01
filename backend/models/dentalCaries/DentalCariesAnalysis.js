/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DentalCariesAnalysis Model
 * Patient 360° — Syrian National Medical Platform
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Persists results from the Dental Caries AI detection model.
 *
 *   Model         : DentalCaries_Binary_EfficientNetV2B0
 *   Architecture  : EfficientNetV2-B0 (Transfer Learning, ImageNet)
 *   Dataset       : DENTEX 2023 (MICCAI Challenge)
 *   Performance   : 90.19% accuracy, 93.45% AUC, 91.59% sensitivity
 *   FastAPI host  : http://localhost:8004  (Pak Team service)
 *
 * Storage pattern : Proxy + MongoDB  (matches KneeXrayAnalysis).
 * Collection      : `dental_caries_analyses` — registered DYNAMICALLY by
 *                   Mongoose. NOT defined inside `patient360_db_final.js`,
 *                   which is locked.
 *
 * Each analysis is stored for:
 *   • audit  — who ran which image when, with what result
 *   • history — list view in the doctor / dentist dashboard
 *   • patient record linkage — chronological view per patient
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

/* ═══════════════════════════════════════════════════════════════════════════
   EMBEDDED SUB-SCHEMAS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The uploaded image record. We store the file on disk under
 * `backend/uploads/dental-caries/`, and keep a normalized URL the
 * frontend can render.
 */
const ImageRefSchema = new Schema(
  {
    filename:     { type: String, required: true },
    originalName: { type: String },
    path:         { type: String, required: true },
    url:          { type: String },
    size:         { type: Number, min: 0 },
    mimeType:     { type: String },
  },
  { _id: false }
);

/**
 * Grad-CAM visualization images (optional). Populated only when the analysis
 * is performed via /predict_with_gradcam. The Node controller writes the
 * base64 payloads from FastAPI as PNGs under
 * `backend/uploads/dental-caries/gradcam/` and stores the URLs here.
 */
const VisualizationSchema = new Schema(
  {
    enhancedXrayUrl:        { type: String },
    gradcamOverlayUrl:      { type: String },
    boxesOverlayUrl:        { type: String },
    suspiciousRegionsCount: { type: Number, min: 0, default: 0 },
    generatedAt:            { type: Date,   default: Date.now },
  },
  { _id: false }
);

/**
 * The AI classifier output, normalized to a fixed shape regardless of any
 * future changes to the upstream FastAPI service response.
 *
 * The model is a binary classifier with a single sigmoid output:
 *   probabilityCaries     → direct sigmoid output (0..1)
 *   probabilityNotCaries  → 1 − probabilityCaries
 *   prediction            → derived: "Caries" if ≥ threshold else "Not_Caries"
 *   confidence            → argmax probability (the higher of the two)
 *
 * `severity` is a UI hint that maps to the existing CSS classes already in
 * use by the X-Ray / Knee OA tools (normal / warning / critical).
 *
 * `recommendationAr` is generated server-side from the prediction so the
 * clinical wording is consistent regardless of frontend caching.
 */
const ResultSchema = new Schema(
  {
    prediction: {
      type: String,
      enum: ['Caries', 'Not_Caries'],
      required: true,
    },
    predictedClass:       { type: String, required: true },               // raw label
    confidence:           { type: Number, min: 0, max: 1, required: true },
    probabilityCaries:    { type: Number, min: 0, max: 1, required: true },
    probabilityNotCaries: { type: Number, min: 0, max: 1, required: true },
    decisionThreshold:    { type: Number, min: 0, max: 1, default: 0.5 },
    interpretation:       { type: String, maxlength: 500 },
    recommendationAr:     { type: String, maxlength: 1000 },
    severity: {
      type: String,
      enum: ['normal', 'warning', 'critical'],
      required: true,
    },
  },
  { _id: false }
);

/**
 * Model metadata — useful for future model rotation, A/B testing, and
 * debugging when a result looks off.
 */
const ModelInfoSchema = new Schema(
  {
    name:         { type: String, default: 'DentalCaries_Binary_EfficientNetV2B0' },
    version:      { type: String, default: '1.0' },
    architecture: { type: String, default: 'EfficientNetV2-B0' },
    dataset:      { type: String, default: 'DENTEX 2023' },
  },
  { _id: false }
);

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN SCHEMA
   ═══════════════════════════════════════════════════════════════════════════ */

const DentalCariesAnalysisSchema = new Schema(
  {
    /* ── Who performed the analysis ─────────────────────────────────────── */
    // Always set: the person who pressed "Analyze" in the dashboard.
    analyzedByPersonId: {
      type: Types.ObjectId,
      ref: 'Person',
      required: true,
      index: true,
    },
    // Exactly one of dentistId / doctorId is set, depending on the role.
    // Both indexes are sparse so empty cells don't waste space.
    dentistId: {
      type: Types.ObjectId,
      ref: 'Dentist',
      index: { sparse: true },
    },
    doctorId: {
      type: Types.ObjectId,
      ref: 'Doctor',
      index: { sparse: true },
    },
    analyzedByRole: {
      type: String,
      enum: ['dentist', 'doctor'],
      required: true,
    },

    /* ── Patient context (optional) ─────────────────────────────────────── */
    // Set when the analysis is performed inside a patient session.
    // Left empty for standalone analyses (e.g. the dentist testing the tool).
    patientPersonId: { type: Types.ObjectId, ref: 'Person', index: { sparse: true } },
    patientChildId:  { type: Types.ObjectId, ref: 'Child',  index: { sparse: true } },
    visitId:         { type: Types.ObjectId, ref: 'Visit',  index: { sparse: true } },

    /* ── Inputs / Outputs ───────────────────────────────────────────────── */
    image:         { type: ImageRefSchema,     required: true },
    result:        { type: ResultSchema,       required: true },
    visualization: { type: VisualizationSchema, default: null },
    modelInfo:     { type: ModelInfoSchema,    default: () => ({}) },

    /* ── Telemetry ──────────────────────────────────────────────────────── */
    processingTimeMs: { type: Number, min: 0 },
    fastApiVersion:   { type: String },

    /* ── Notes / soft delete ────────────────────────────────────────────── */
    notes:     { type: String, maxlength: 1000 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Types.ObjectId, ref: 'Account' },
  },
  {
    timestamps: true,
    collection: 'dental_caries_analyses',
  }
);

/* ═══════════════════════════════════════════════════════════════════════════
   INDEXES — Match the query patterns in the controller
   ═══════════════════════════════════════════════════════════════════════════ */

// Per-user history (the most common query — "my last 20 analyses")
DentalCariesAnalysisSchema.index(
  { analyzedByPersonId: 1, createdAt: -1 },
  { name: 'idx_analyzedBy_date' }
);

// Patient-record lookup (chronological)
DentalCariesAnalysisSchema.index(
  { patientPersonId: 1, createdAt: -1 },
  { name: 'idx_patient_adult_date' }
);
DentalCariesAnalysisSchema.index(
  { patientChildId: 1, createdAt: -1 },
  { name: 'idx_patient_child_date' }
);

// Result analytics — "how many positives this month?"
DentalCariesAnalysisSchema.index(
  { 'result.prediction': 1, createdAt: -1 },
  { name: 'idx_prediction_date' }
);

/* ═══════════════════════════════════════════════════════════════════════════
   VIRTUALS
   ═══════════════════════════════════════════════════════════════════════════ */

DentalCariesAnalysisSchema.virtual('patientId').get(function patientIdVirtual() {
  return this.patientPersonId || this.patientChildId || null;
});

DentalCariesAnalysisSchema.virtual('isPositive').get(function isPositiveVirtual() {
  return this.result?.prediction === 'Caries';
});

DentalCariesAnalysisSchema.set('toJSON',   { virtuals: true });
DentalCariesAnalysisSchema.set('toObject', { virtuals: true });

/* ═══════════════════════════════════════════════════════════════════════════
   PRE-VALIDATION — Invariants
   ═══════════════════════════════════════════════════════════════════════════ */

DentalCariesAnalysisSchema.pre('validate', function preValidate(next) {
  // 1. Exactly one of dentistId / doctorId
  if (this.dentistId && this.doctorId) {
    return next(new Error('Cannot set both dentistId and doctorId on a single analysis'));
  }
  if (this.analyzedByRole === 'dentist' && !this.dentistId) {
    return next(new Error('dentistId is required when analyzedByRole is "dentist"'));
  }
  if (this.analyzedByRole === 'doctor' && !this.doctorId) {
    return next(new Error('doctorId is required when analyzedByRole is "doctor"'));
  }

  // 2. Exactly one (or zero) of patientPersonId / patientChildId
  if (this.patientPersonId && this.patientChildId) {
    return next(new Error('Cannot set both patientPersonId and patientChildId'));
  }

  return next();
});

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT
   ═══════════════════════════════════════════════════════════════════════════ */

module.exports =
  mongoose.models.DentalCariesAnalysis
  || mongoose.model('DentalCariesAnalysis', DentalCariesAnalysisSchema);
