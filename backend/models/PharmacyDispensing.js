/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PharmacyDispensing Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: pharmacy_dispensing
 *  Source of truth: patient360_db_final.js (collection 16)
 *
 *  Records every dispensing event at a pharmacy. Two distinct workflows:
 *
 *  (A) prescription_based — pharmacist fulfills a doctor's prescription:
 *      • prescriptionId is REQUIRED
 *      • prescriptionNumber denormalized for quick display
 *      • Triggers prescription.markMedicationDispensed() per line
 *
 *  (B) otc — over-the-counter, pharmacist dispenses without an Rx:
 *      • prescriptionId stays null
 *      • otcReason is REQUIRED (auditable justification)
 *      • Drug must have requiresPrescription=false in medications collection
 *
 *  Both scenarios:
 *    • Decrement stock from pharmacy_inventory using FEFO via
 *      PharmacyInventory.dispense() (see PharmacyInventory.js)
 *    • Record batch numbers actually drawn (for traceability)
 *    • Increment pharmacist.totalPrescriptionsDispensed
 *
 *  Generic substitution: pharmacist may substitute a generic for a brand
 *  if the generic has the same active ingredient. Each line item has an
 *  `isGenericSubstitute` flag for this case.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const DISPENSING_TYPES = ['prescription_based', 'otc'];

const PAYMENT_METHODS = ['cash', 'card', 'insurance', 'free'];

const CURRENCIES = ['SYP', 'USD'];

// ── Sub-schema: dispensed medication line item ──────────────────────────────

const DispensedMedicationSchema = new Schema(
  {
    medicationId: { type: Schema.Types.ObjectId, ref: 'Medication' },
    medicationName: {
      type: String,
      required: [true, 'اسم الدواء مطلوب'],
      trim: true,
    },
    quantityDispensed: {
      type: Number,
      required: [true, 'الكمية المصروفة مطلوبة'],
      min: [1, 'الكمية المصروفة يجب أن تكون 1 على الأقل'],
    },

    // ── Batch traceability (which batch was drawn from inventory) ────────
    batchNumber: { type: String, trim: true },
    expiryDate: { type: Date },

    // ── Pricing snapshot (price at time of dispense) ─────────────────────
    unitPrice: { type: Number, min: 0 },

    // ── Substitution tracking ────────────────────────────────────────────
    isGenericSubstitute: { type: Boolean, default: false },

    pharmacistNotes: { type: String, trim: true },
  },
  { _id: false },
);

// ── Main schema ──────────────────────────────────────────────────────────────

const PharmacyDispensingSchema = new Schema(
  {
    // ── Auto-generated identifier ─────────────────────────────────────────
    dispensingNumber: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
      // Format: DISP-YYYYMMDD-XXXXX
    },

    // ── Pharmacy & pharmacist ─────────────────────────────────────────────
    pharmacyId: {
      type: Schema.Types.ObjectId,
      ref: 'Pharmacy',
      required: [true, 'الصيدلية مطلوبة'],
      index: true,
    },
    pharmacistId: {
      type: Schema.Types.ObjectId,
      ref: 'Pharmacist',
      required: [true, 'الصيدلاني مطلوب'],
      index: true,
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

    // ── Type ──────────────────────────────────────────────────────────────
    dispensingType: {
      type: String,
      enum: DISPENSING_TYPES,
      required: [true, 'نوع الصرف مطلوب'],
      index: true,
    },

    // ── Prescription link (only for prescription_based) ───────────────────
    prescriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'Prescription',
      sparse: true,
    },
    prescriptionNumber: {
      type: String,
      trim: true,
      uppercase: true,
      // Denormalized copy of prescription.prescriptionNumber for display
    },

    // ── Medications dispensed ─────────────────────────────────────────────
    medicationsDispensed: {
      type: [DispensedMedicationSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 1,
        message: 'يجب صرف دواء واحد على الأقل',
      },
    },

    // ── Timing & financials ───────────────────────────────────────────────
    dispensingDate: { type: Date, default: Date.now, required: true },
    totalCost: { type: Number, min: 0, default: 0 },
    currency: { type: String, enum: CURRENCIES, default: 'SYP' },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'cash' },

    // ── OTC-specific fields ───────────────────────────────────────────────
    otcReason: { type: String, trim: true }, // required by validator below
    otcNotes: { type: String, trim: true },

    // ── Patient acknowledgment (optional) ─────────────────────────────────
    patientSignature: { type: String, trim: true }, // base64 or URL

    notes: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'pharmacy_dispensing',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

PharmacyDispensingSchema.index(
  { patientPersonId: 1, dispensingDate: -1 },
  { name: 'idx_patient_adult_date' },
);
PharmacyDispensingSchema.index(
  { patientChildId: 1, dispensingDate: -1 },
  { name: 'idx_patient_child_date' },
);
PharmacyDispensingSchema.index(
  { pharmacyId: 1, dispensingDate: -1 },
  { name: 'idx_pharmacy_date' },
);
PharmacyDispensingSchema.index(
  { pharmacistId: 1, dispensingDate: -1 },
  { name: 'idx_pharmacist_date' },
);
PharmacyDispensingSchema.index(
  { dispensingDate: -1 },
  { name: 'idx_date_desc' },
);

// ── Static helpers ──────────────────────────────────────────────────────────

/**
 * Generate dispensing number: DISP-YYYYMMDD-XXXXX (scoped per day).
 * @returns {Promise<string>}
 */
PharmacyDispensingSchema.statics.generateDispensingNumber = async function generateDispensingNumber() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `DISP-${datePart}-`;

  const todayCount = await this.countDocuments({
    dispensingNumber: { $regex: `^${prefix}` },
  });

  const sequence = String(todayCount + 1).padStart(5, '0');
  return `${prefix}${sequence}`;
};

// ── Pre-validate: patient XOR + dispensing-type-specific requirements ──────

PharmacyDispensingSchema.pre('validate', function enforceTypeRules(next) {
  // Patient XOR
  const hasPerson = !!this.patientPersonId;
  const hasChild = !!this.patientChildId;
  if (!hasPerson && !hasChild) {
    return next(new Error('يجب تحديد patientPersonId أو patientChildId'));
  }
  if (hasPerson && hasChild) {
    return next(new Error('لا يمكن تحديد patientPersonId و patientChildId معاً'));
  }

  // prescription_based → prescriptionId required
  if (this.dispensingType === 'prescription_based' && !this.prescriptionId) {
    return next(new Error('prescriptionId مطلوب عند الصرف بناءً على وصفة'));
  }

  // otc → otcReason required, prescriptionId must NOT be set
  if (this.dispensingType === 'otc') {
    if (!this.otcReason || this.otcReason.trim().length === 0) {
      return next(new Error('سبب الصرف بدون وصفة (otcReason) مطلوب'));
    }
    if (this.prescriptionId) {
      return next(new Error('لا يجوز ربط prescriptionId مع نوع otc'));
    }
  }

  return next();
});

// ── Pre-save: auto-generate dispensingNumber + compute totalCost ────────────

PharmacyDispensingSchema.pre('save', async function autoFields(next) {
  try {
    if (this.isNew && !this.dispensingNumber) {
      this.dispensingNumber = await this.constructor.generateDispensingNumber();
    }

    // Auto-compute totalCost from line items if not explicitly set
    if (this.isModified('medicationsDispensed') || this.isNew) {
      const computed = this.medicationsDispensed.reduce((sum, item) => {
        const lineTotal = (item.unitPrice || 0) * (item.quantityDispensed || 0);
        return sum + lineTotal;
      }, 0);
      // Only override if caller didn't set a different value
      if (!this.totalCost || this.totalCost === 0) {
        this.totalCost = Number(computed.toFixed(2));
      }
    }

    return next();
  } catch (err) {
    return next(err);
  }
});

// ── Virtuals ────────────────────────────────────────────────────────────────

PharmacyDispensingSchema.virtual('itemCount').get(function () {
  return Array.isArray(this.medicationsDispensed)
    ? this.medicationsDispensed.length
    : 0;
});

module.exports = mongoose.model('PharmacyDispensing', PharmacyDispensingSchema);