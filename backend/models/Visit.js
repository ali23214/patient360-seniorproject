/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Visit Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: visits
 *  Source of truth: patient360_db_final.js (collection 14)
 *
 *  One document per clinical encounter (regular consultation, follow-up,
 *  emergency, dental, lab-only, etc.). This is the central "what happened"
 *  record that the patient timeline, doctor history, and audit trail all
 *  reference.
 *
 *  Patient linkage (XOR):
 *    • patientPersonId → adult patient
 *    • patientChildId  → child patient under 14
 *
 *  Embedded structured data (denormalized for fast dashboard rendering):
 *    • vitalSigns         — 9 measurements taken at the visit (BP, HR, etc.)
 *    • prescribedMedications — quick list of meds (full Rx is in prescriptions)
 *    • ecgAnalysis        — AI ECG result (only if doctor.isECGSpecialist=true)
 *    • visitPhotoUrl      — uploaded X-ray, scan, or medical image
 *
 *  The `appointmentId` field links back to the appointment that triggered
 *  this visit (set when an appointment transitions from 'in_progress'
 *  to 'completed' and creates the visit record).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const VISIT_TYPES = [
  'regular', 'follow_up', 'emergency', 'consultation', 'dental', 'lab_only',
];

const VISIT_STATUSES = ['in_progress', 'completed', 'cancelled'];

const PAYMENT_STATUSES = [
  'pending', 'paid', 'partially_paid', 'cancelled', 'free',
];

const PAYMENT_METHODS = ['cash', 'card', 'insurance', 'free'];

const MEDICATION_ROUTES = [
  'oral', 'topical', 'injection', 'inhalation',
  'sublingual', 'rectal', 'other',
];

// ── Sub-schema: vital signs (9 fields matching DoctorDashboard.jsx) ─────────

const VitalSignsSchema = new Schema(
  {
    bloodPressureSystolic: {
      type: Number,
      min: [0, 'الضغط الانقباضي لا يمكن أن يكون سالب'],
      max: [300, 'الضغط الانقباضي يجب ألا يتجاوز 300'],
      // mmHg
    },
    bloodPressureDiastolic: {
      type: Number,
      min: [0, 'الضغط الانبساطي لا يمكن أن يكون سالب'],
      max: [200, 'الضغط الانبساطي يجب ألا يتجاوز 200'],
      // mmHg
    },
    heartRate: {
      type: Number,
      min: [0, 'معدل ضربات القلب لا يمكن أن يكون سالب'],
      max: [300, 'معدل ضربات القلب يجب ألا يتجاوز 300'],
      // beats per minute
    },
    oxygenSaturation: {
      type: Number,
      min: [0, 'تشبع الأكسجين لا يمكن أن يكون سالب'],
      max: [100, 'تشبع الأكسجين يجب ألا يتجاوز 100%'],
      // SpO2 %
    },
    bloodGlucose: {
      type: Number,
      min: 0,
      max: 1000,
      // mg/dL
    },
    temperature: {
      type: Number,
      min: [30, 'درجة الحرارة يجب أن تكون 30 على الأقل'],
      max: [45, 'درجة الحرارة يجب ألا تتجاوز 45'],
      // Celsius
    },
    weight: { type: Number, min: 0, max: 500 },     // kg at this visit
    height: { type: Number, min: 0, max: 300 },     // cm at this visit
    respiratoryRate: { type: Number, min: 0, max: 100 }, // breaths per minute
  },
  { _id: false },
);

// ── Sub-schema: prescribed medication line item ─────────────────────────────

const PrescribedMedicationSchema = new Schema(
  {
    medicationId: { type: Schema.Types.ObjectId, ref: 'Medication' },
    medicationName: {
      type: String,
      required: [true, 'اسم الدواء مطلوب'],
      trim: true,
    },
    dosage: {
      type: String,
      required: [true, 'الجرعة مطلوبة'],
      trim: true,
    },
    frequency: {
      type: String,
      required: [true, 'تكرار الجرعة مطلوب'],
      trim: true,
    },
    duration: {
      type: String,
      required: [true, 'مدة العلاج مطلوبة'],
      trim: true,
    },
    route: { type: String, enum: MEDICATION_ROUTES, default: 'oral' },
    instructions: { type: String, trim: true },
    quantity: { type: Number, min: 0 },
  },
  { _id: false },
);

// ── Sub-schema: ECG AI prediction (one of N classes) ────────────────────────

const ECGPredictionSchema = new Schema(
  {
    class: { type: String, required: true, trim: true },
    confidence: { type: Number, min: 0, max: 100 }, // percentage 0-100
    arabicLabel: { type: String, trim: true },
    englishLabel: { type: String, trim: true },
  },
  { _id: false },
);

// ── Sub-schema: ECG analysis result ─────────────────────────────────────────

const ECGAnalysisSchema = new Schema(
  {
    analyzedAt: { type: Date, default: Date.now },
    ecgImageUrl: { type: String, trim: true },
    predictions: { type: [ECGPredictionSchema], default: [] },
    topPrediction: { type: String, trim: true },
    recommendation: { type: String, trim: true },
    modelVersion: { type: String, trim: true },
  },
  { _id: false },
);

// ── Main schema ──────────────────────────────────────────────────────────────

const VisitSchema = new Schema(
  {
    // ── Visit type & timing ───────────────────────────────────────────────
    visitType: {
      type: String,
      enum: { values: VISIT_TYPES, message: 'نوع الزيارة غير صالح' },
      required: [true, 'نوع الزيارة مطلوب'],
    },

    // ── Patient (XOR enforced by pre-validate hook) ───────────────────────
    patientPersonId: {
      type: Schema.Types.ObjectId,
      ref: 'Person',
      sparse: true,
    },
    patientChildId: {
      type: Schema.Types.ObjectId,
      ref: 'Children',
      sparse: true,
    },

    // ── Provider (one of doctor or dentist) ───────────────────────────────
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', sparse: true },
    dentistId: { type: Schema.Types.ObjectId, ref: 'Dentist', sparse: true },

    // ── Location ──────────────────────────────────────────────────────────
    hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', sparse: true },

    // ── Link to originating appointment ───────────────────────────────────
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      sparse: true,
    },

    visitDate: {
      type: Date,
      required: [true, 'تاريخ الزيارة مطلوب'],
      default: Date.now,
    },
    status: {
      type: String,
      enum: VISIT_STATUSES,
      default: 'in_progress',
    },

    // ── Clinical content ──────────────────────────────────────────────────
    chiefComplaint: {
      type: String,
      required: [true, 'الشكوى الرئيسية مطلوبة'],
      trim: true,
    },
    diagnosis: { type: String, trim: true },

    // ── Vital signs ───────────────────────────────────────────────────────
    vitalSigns: { type: VitalSignsSchema, default: undefined },

    // ── Medications prescribed at this visit ──────────────────────────────
    prescribedMedications: {
      type: [PrescribedMedicationSchema],
      default: [],
    },

    // ── Doctor notes & follow-up ──────────────────────────────────────────
    doctorNotes: { type: String, trim: true },
    followUpDate: { type: Date },
    followUpNotes: { type: String, trim: true },

    // ── Visit photo (X-ray, scan, image) ──────────────────────────────────
    visitPhotoUrl: { type: String, trim: true },
    visitPhotoUploadedAt: { type: Date },

    // ── ECG AI analysis (only for cardiology visits) ──────────────────────
    ecgAnalysis: { type: ECGAnalysisSchema, default: undefined },

    // ── Payment ───────────────────────────────────────────────────────────
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    paymentMethod: { type: String, enum: PAYMENT_METHODS },
  },
  {
    timestamps: true,
    collection: 'visits',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes (mirroring patient360_db_final.js) ──────────────────────────────

VisitSchema.index(
  { patientPersonId: 1, visitDate: -1 },
  { name: 'idx_patient_adult_date' },
);
VisitSchema.index(
  { patientChildId: 1, visitDate: -1 },
  { name: 'idx_patient_child_date' },
);
VisitSchema.index({ doctorId: 1, visitDate: -1 }, { name: 'idx_doctor_date' });
VisitSchema.index({ dentistId: 1, visitDate: -1 }, { name: 'idx_dentist_date' });
VisitSchema.index(
  { hospitalId: 1, visitDate: -1 },
  { name: 'idx_hospital_date' },
);
VisitSchema.index({ status: 1 }, { name: 'idx_status' });
VisitSchema.index({ visitDate: -1 }, { name: 'idx_visitDate_desc' });
VisitSchema.index({ visitType: 1 }, { name: 'idx_type' });

// ── Pre-validate: enforce patient XOR ───────────────────────────────────────

VisitSchema.pre('validate', function enforcePatientXor(next) {
  const hasPerson = !!this.patientPersonId;
  const hasChild = !!this.patientChildId;

  if (!hasPerson && !hasChild) {
    return next(
      new mongoose.Error.ValidationError(this).addError(
        'patientPersonId',
        new mongoose.Error.ValidatorError({
          message: 'يجب تحديد patientPersonId أو patientChildId',
          path: 'patientPersonId',
        }),
      ),
    );
  }
  if (hasPerson && hasChild) {
    return next(
      new mongoose.Error.ValidationError(this).addError(
        'patientChildId',
        new mongoose.Error.ValidatorError({
          message: 'لا يمكن تحديد patientPersonId و patientChildId معاً',
          path: 'patientChildId',
        }),
      ),
    );
  }
  return next();
});

// ── Virtuals ────────────────────────────────────────────────────────────────

/**
 * Returns the patient reference regardless of whether it's an adult or child.
 * Useful for controllers that don't care about the distinction.
 *
 * @returns {{ id: ObjectId, type: 'adult' | 'child' } | null}
 */
VisitSchema.virtual('patientRef').get(function () {
  if (this.patientPersonId) {
    return { id: this.patientPersonId, type: 'adult' };
  }
  if (this.patientChildId) {
    return { id: this.patientChildId, type: 'child' };
  }
  return null;
});

/**
 * BMI computed from vitalSigns.weight + vitalSigns.height (visit-time BMI,
 * which can differ from the patient's profile BMI if they've gained/lost).
 *
 * @returns {number|null}
 */
VisitSchema.virtual('visitBMI').get(function () {
  const { weight, height } = this.vitalSigns || {};
  if (typeof weight !== 'number' || typeof height !== 'number' || height <= 0) {
    return null;
  }
  const meters = height / 100;
  return Number((weight / (meters * meters)).toFixed(1));
});

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Mark this visit as completed and stamp the time. Triggers patient stats
 * refresh via the controller (visit count, lastVisitDate).
 */
VisitSchema.methods.markCompleted = async function markCompleted() {
  if (this.status === 'completed') return this;
  this.status = 'completed';
  return this.save();
};

/**
 * Attach an ECG AI analysis result to this visit. Used by ecgController
 * to persist the AI prediction permanently rather than just displaying it.
 *
 * @param {object} analysis - { ecgImageUrl, predictions, topPrediction,
 *                              recommendation, modelVersion }
 */
VisitSchema.methods.attachECGAnalysis = async function attachECGAnalysis(analysis) {
  this.ecgAnalysis = {
    ...analysis,
    analyzedAt: new Date(),
  };
  return this.save();
};

module.exports = mongoose.model('Visit', VisitSchema);