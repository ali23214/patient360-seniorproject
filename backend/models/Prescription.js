/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Prescription Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: prescriptions
 *  Source of truth: patient360_db_final.js (collection 15)
 *
 *  Formal prescription document. Created from a Visit by a doctor or dentist.
 *  Pharmacist scans the QR code (or types the verificationCode) at the
 *  pharmacy counter to fulfill it.
 *
 *  Lifecycle:
 *    1. Doctor creates Visit → Visit autocreates a Prescription
 *    2. Prescription gets prescriptionNumber (RX-YYYYMMDD-XXXXX) and
 *       a 6-digit verificationCode + QR string
 *    3. Patient takes the printed/digital Rx to a pharmacy
 *    4. Pharmacist verifies via QR or code → fetches this document
 *    5. Pharmacist dispenses → creates pharmacy_dispensing record
 *    6. status: active → dispensed (or partially_dispensed)
 *
 *  The `medications` array embeds the actual drug list. Each item has
 *  its own `isDispensed` flag so partial dispensing works correctly
 *  (e.g. pharmacy is out of one drug, dispenses the other two).
 *
 *  Default validity is 30 days from prescriptionDate (Syrian Ministry of
 *  Health convention) — caller can override via expiryDate field.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const STATUSES = [
  'active', 'dispensed', 'partially_dispensed', 'expired', 'cancelled',
];

const ROUTES = [
  'oral', 'topical', 'injection', 'inhalation',
  'sublingual', 'rectal', 'other',
];

// Default Rx validity in days
const DEFAULT_VALIDITY_DAYS = 30;

// ── Sub-schema: medication line item ────────────────────────────────────────

const PrescriptionMedicationSchema = new Schema(
  {
    medicationId: { type: Schema.Types.ObjectId, ref: 'Medication' },
    medicationName: {
      type: String,
      required: [true, 'اسم الدواء مطلوب'],
      trim: true,
    },
    arabicName: { type: String, trim: true },
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
    route: { type: String, enum: ROUTES, default: 'oral' },
    instructions: { type: String, trim: true },
    quantity: { type: Number, min: 0 },

    // ── Dispensing state per-medication ──────────────────────────────────
    isDispensed: { type: Boolean, default: false },
    dispensedAt: { type: Date },
  },
  { _id: false },
);

// ── Main schema ──────────────────────────────────────────────────────────────

const PrescriptionSchema = new Schema(
  {
    // ── Auto-generated identifier ─────────────────────────────────────────
    prescriptionNumber: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
      // Format: RX-YYYYMMDD-XXXXX
    },

    // ── Patient (XOR) ─────────────────────────────────────────────────────
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

    // ── Prescriber (one of doctor or dentist) ─────────────────────────────
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', sparse: true },
    dentistId: { type: Schema.Types.ObjectId, ref: 'Dentist', sparse: true },

    // ── Originating visit ─────────────────────────────────────────────────
    visitId: {
      type: Schema.Types.ObjectId,
      ref: 'Visit',
      required: [true, 'يجب ربط الوصفة بزيارة'],
    },

    // ── Dates ─────────────────────────────────────────────────────────────
    prescriptionDate: { type: Date, default: Date.now, required: true },
    expiryDate: { type: Date }, // set by pre-save if not provided

    // ── Medications (the actual drug list) ────────────────────────────────
    medications: {
      type: [PrescriptionMedicationSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 1,
        message: 'يجب وصف دواء واحد على الأقل',
      },
    },

    // ── Status ────────────────────────────────────────────────────────────
    status: { type: String, enum: STATUSES, default: 'active' },

    // ── Pharmacist scan workflow ──────────────────────────────────────────
    verificationCode: {
      type: String,
      sparse: true,
      // 6-digit code; pharmacist types this if QR scanner unavailable
    },
    qrCode: {
      type: String,
      sparse: true,
      // Encoded data string: "RX-{prescriptionNumber}|{verificationCode}"
    },
    printCount: { type: Number, default: 0, min: 0 },

    // ── Dispensing reference ──────────────────────────────────────────────
    dispensingId: {
      type: Schema.Types.ObjectId,
      ref: 'PharmacyDispensing',
      sparse: true,
    },

    // ── Doctor notes ──────────────────────────────────────────────────────
    prescriptionNotes: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'prescriptions',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

PrescriptionSchema.index(
  { patientPersonId: 1, prescriptionDate: -1 },
  { name: 'idx_patient_adult_date' },
);
PrescriptionSchema.index(
  { patientChildId: 1, prescriptionDate: -1 },
  { name: 'idx_patient_child_date' },
);
PrescriptionSchema.index(
  { doctorId: 1, prescriptionDate: -1 },
  { name: 'idx_doctor_date' },
);
PrescriptionSchema.index({ visitId: 1 }, { name: 'idx_visitId' });
PrescriptionSchema.index({ status: 1 }, { name: 'idx_status' });
PrescriptionSchema.index({ expiryDate: 1 }, { name: 'idx_expiryDate' });

// ── Static helpers ──────────────────────────────────────────────────────────

/**
 * Generate the next available prescriptionNumber: RX-YYYYMMDD-XXXXX.
 * Sequence is scoped to the calendar day.
 *
 * @returns {Promise<string>}
 */
PrescriptionSchema.statics.generatePrescriptionNumber = async function generatePrescriptionNumber() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `RX-${datePart}-`;

  const todayCount = await this.countDocuments({
    prescriptionNumber: { $regex: `^${prefix}` },
  });

  const sequence = String(todayCount + 1).padStart(5, '0');
  return `${prefix}${sequence}`;
};

/**
 * Generate a random 6-digit verification code (zero-padded).
 * @returns {string}
 */
PrescriptionSchema.statics.generateVerificationCode = function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
};

// ── Pre-validate: patient XOR + prescriber XOR ─────────────────────────────

PrescriptionSchema.pre('validate', function enforceXor(next) {
  // Patient XOR
  const hasPerson = !!this.patientPersonId;
  const hasChild = !!this.patientChildId;
  if (!hasPerson && !hasChild) {
    return next(new Error('يجب تحديد patientPersonId أو patientChildId'));
  }
  if (hasPerson && hasChild) {
    return next(new Error('لا يمكن تحديد patientPersonId و patientChildId معاً'));
  }

  // Prescriber XOR
  const hasDoctor = !!this.doctorId;
  const hasDentist = !!this.dentistId;
  if (!hasDoctor && !hasDentist) {
    return next(new Error('يجب تحديد doctorId أو dentistId'));
  }
  if (hasDoctor && hasDentist) {
    return next(new Error('لا يمكن تحديد doctorId و dentistId معاً'));
  }

  return next();
});

// ── Pre-save: auto-generate Rx number, codes, and expiry ───────────────────

PrescriptionSchema.pre('save', async function autoGenerateFields(next) {
  try {
    if (this.isNew) {
      // 1. Auto-generate prescriptionNumber if missing
      if (!this.prescriptionNumber) {
        this.prescriptionNumber = await this.constructor.generatePrescriptionNumber();
      }

      // 2. Auto-generate verificationCode if missing
      if (!this.verificationCode) {
        this.verificationCode = this.constructor.generateVerificationCode();
      }

      // 3. Build qrCode payload from prescriptionNumber + verificationCode.
      // Pharmacist app decodes this to look up the prescription.
      if (!this.qrCode) {
        this.qrCode = `${this.prescriptionNumber}|${this.verificationCode}`;
      }

      // 4. Default expiryDate to 30 days after prescriptionDate
      if (!this.expiryDate && this.prescriptionDate) {
        const expiry = new Date(this.prescriptionDate);
        expiry.setDate(expiry.getDate() + DEFAULT_VALIDITY_DAYS);
        this.expiryDate = expiry;
      }
    }
    return next();
  } catch (err) {
    return next(err);
  }
});

// ── Virtuals ────────────────────────────────────────────────────────────────

PrescriptionSchema.virtual('isExpired').get(function () {
  return !!(this.expiryDate && this.expiryDate < new Date());
});

PrescriptionSchema.virtual('totalMedications').get(function () {
  return Array.isArray(this.medications) ? this.medications.length : 0;
});

PrescriptionSchema.virtual('dispensedCount').get(function () {
  if (!Array.isArray(this.medications)) return 0;
  return this.medications.filter((m) => m.isDispensed).length;
});

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Mark a single medication line as dispensed by index. Recomputes the
 * overall prescription status (active → partially_dispensed → dispensed).
 *
 * @param {number} medicationIndex - position in medications[] array
 */
PrescriptionSchema.methods.markMedicationDispensed = async function markMedicationDispensed(medicationIndex) {
  if (medicationIndex < 0 || medicationIndex >= this.medications.length) {
    throw new Error(`فهرس الدواء غير صالح: ${medicationIndex}`);
  }

  this.medications[medicationIndex].isDispensed = true;
  this.medications[medicationIndex].dispensedAt = new Date();

  // Recompute status
  const dispensed = this.medications.filter((m) => m.isDispensed).length;
  const total = this.medications.length;

  if (dispensed === total) {
    this.status = 'dispensed';
  } else if (dispensed > 0) {
    this.status = 'partially_dispensed';
  }

  return this.save();
};

/**
 * Verify a 6-digit code against this prescription's verificationCode.
 * Used by the pharmacist's manual verification flow.
 *
 * @param {string} code
 * @returns {boolean}
 */
PrescriptionSchema.methods.verifyCode = function verifyCode(code) {
  return String(code).trim() === this.verificationCode;
};

module.exports = mongoose.model('Prescription', PrescriptionSchema);