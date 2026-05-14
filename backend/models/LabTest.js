/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  LabTest Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: lab_tests
 *  Source of truth: patient360_db_final.js (collection 17)
 *
 *  Lab test orders and results. Lifecycle:
 *
 *    1. ordered           — doctor creates the order from a Visit
 *    2. scheduled         — patient books an appointment at the lab
 *    3. sample_collected  — lab tech collects the sample, prints barcode
 *    4. in_progress       — sample is being processed
 *    5. completed         — results entered + PDF uploaded; both view flags
 *                           reset to false to trigger notifications
 *    6. (terminal)        — cancelled / rejected
 *
 *  Result data:
 *    • testResults[]   — structured key/value results for each individual test
 *                        (e.g. CBC has WBC, RBC, Hgb, Plt as separate items)
 *                        Each has reference range, isAbnormal, isCritical
 *    • resultPdfUrl    — the official PDF report from the lab
 *
 *  Critical results (isCritical=true on any line item) trigger the
 *  lab_results_critical notification type with priority='urgent' so the
 *  ordering doctor is alerted immediately.
 *
 *  View tracking (isViewedByDoctor / isViewedByPatient) lets the
 *  notification dispatcher know who still needs to be pinged.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const TEST_CATEGORIES = [
  'blood', 'urine', 'stool', 'imaging', 'biopsy',
  'microbiology', 'molecular', 'other',
];

const PRIORITIES = ['routine', 'urgent', 'stat'];

const SAMPLE_TYPES = [
  'blood', 'urine', 'stool', 'tissue', 'swab', 'saliva', 'other',
];

const STATUSES = [
  'ordered', 'scheduled', 'sample_collected',
  'in_progress', 'completed', 'cancelled', 'rejected',
];

const CURRENCIES = ['SYP', 'USD'];

// ── Sub-schemas ─────────────────────────────────────────────────────────────

const TestOrderedSchema = new Schema(
  {
    testCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    testName: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
  },
  { _id: false },
);

const TestResultSchema = new Schema(
  {
    testCode: { type: String, trim: true, uppercase: true },
    testName: {
      type: String,
      required: [true, 'اسم الاختبار مطلوب'],
      trim: true,
    },
    value: {
      type: String,
      required: [true, 'قيمة النتيجة مطلوبة'],
      trim: true,
      // Stored as string to support qualitative results ("Positive", "Trace")
      // alongside numeric values
    },
    numericValue: { type: Number },     // for trend/graph plotting
    unit: { type: String, trim: true }, // e.g. mg/dL, g/L, %
    referenceRange: { type: String, trim: true }, // e.g. "70-100"
    isAbnormal: { type: Boolean, default: false },
    isCritical: { type: Boolean, default: false },
  },
  { _id: false },
);

// ── Main schema ──────────────────────────────────────────────────────────────

const LabTestSchema = new Schema(
  {
    // ── Auto-generated identifier ─────────────────────────────────────────
    testNumber: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,
      // Format: LAB-YYYYMMDD-XXXXX
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

    // ── Ordering doctor + originating visit ───────────────────────────────
    orderedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'الطبيب الطالب مطلوب'],
    },
    visitId: { type: Schema.Types.ObjectId, ref: 'Visit', sparse: true },

   // ── Performing laboratory (optional)
   laboratoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Laboratory',
      // required removed — field is now optional
    },

    // ── Order metadata ────────────────────────────────────────────────────
    orderDate: { type: Date, default: Date.now, required: true },
    scheduledDate: { type: Date },

    // ── Tests requested ───────────────────────────────────────────────────
    testsOrdered: {
      type: [TestOrderedSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 1,
        message: 'يجب طلب اختبار واحد على الأقل',
      },
    },

    testCategory: { type: String, enum: TEST_CATEGORIES },
    priority: { type: String, enum: PRIORITIES, default: 'routine' },

    // ── Sample collection ─────────────────────────────────────────────────
    sampleType: { type: String, enum: SAMPLE_TYPES },
    sampleId: { type: String, trim: true, sparse: true }, // lab barcode
    sampleCollectedAt: { type: Date },
    sampleCollectedBy: {
      type: Schema.Types.ObjectId,
      ref: 'LabTechnician',
    },

    // ── Status ────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: STATUSES,
      default: 'ordered',
      index: true,
    },
    rejectionReason: { type: String, trim: true },

    // ── Results ───────────────────────────────────────────────────────────
    testResults: { type: [TestResultSchema], default: [] },

    resultPdfUrl: { type: String, trim: true },
    resultPdfUploadedAt: { type: Date },
    resultPdfUploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'LabTechnician',
    },

    labNotes: { type: String, trim: true },
    completedAt: { type: Date },
    completedBy: {
      type: Schema.Types.ObjectId,
      ref: 'LabTechnician',
    },

    // ── View tracking (drives notifications) ──────────────────────────────
    isCritical: { type: Boolean, default: false },
    isViewedByDoctor: { type: Boolean, default: false },
    isViewedByPatient: { type: Boolean, default: false },
    doctorViewedAt: { type: Date },
    patientViewedAt: { type: Date },

    // ── Pricing ───────────────────────────────────────────────────────────
    totalCost: { type: Number, min: 0 },
    currency: { type: String, enum: CURRENCIES, default: 'SYP' },
  },
  {
    timestamps: true,
    collection: 'lab_tests',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

LabTestSchema.index(
  { patientPersonId: 1, orderDate: -1 },
  { name: 'idx_patient_adult_date' },
);
LabTestSchema.index(
  { patientChildId: 1, orderDate: -1 },
  { name: 'idx_patient_child_date' },
);
LabTestSchema.index(
  { orderedBy: 1, orderDate: -1 },
  { name: 'idx_doctor_date' },
);
LabTestSchema.index(
  { laboratoryId: 1, status: 1 },
  { name: 'idx_lab_status' },
);
LabTestSchema.index(
  { status: 1, scheduledDate: 1 },
  { name: 'idx_status_scheduled' },
);
LabTestSchema.index({ isCritical: 1 }, { name: 'idx_critical' });
LabTestSchema.index({ isViewedByDoctor: 1 }, { name: 'idx_viewedByDoctor' });
LabTestSchema.index({ isViewedByPatient: 1 }, { name: 'idx_viewedByPatient' });
LabTestSchema.index({ visitId: 1 }, { sparse: true, name: 'idx_visitId' });

// ── Static helpers ──────────────────────────────────────────────────────────

/**
 * Generate test number: LAB-YYYYMMDD-XXXXX (scoped per day).
 * @returns {Promise<string>}
 */
LabTestSchema.statics.generateTestNumber = async function generateTestNumber() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `LAB-${datePart}-`;

  const todayCount = await this.countDocuments({
    testNumber: { $regex: `^${prefix}` },
  });

  const sequence = String(todayCount + 1).padStart(5, '0');
  return `${prefix}${sequence}`;
};

// ── Pre-validate: patient XOR ───────────────────────────────────────────────

LabTestSchema.pre('validate', function enforcePatientXor(next) {
  const hasPerson = !!this.patientPersonId;
  const hasChild = !!this.patientChildId;
  if (!hasPerson && !hasChild) {
    return next(new Error('يجب تحديد patientPersonId أو patientChildId'));
  }
  if (hasPerson && hasChild) {
    return next(new Error('لا يمكن تحديد patientPersonId و patientChildId معاً'));
  }
  return next();
});

// ── Pre-save: auto-generate testNumber + compute isCritical ────────────────

LabTestSchema.pre('save', async function autoFields(next) {
  try {
    if (this.isNew && !this.testNumber) {
      this.testNumber = await this.constructor.generateTestNumber();
    }

    // Auto-set isCritical at the test-level if any result is critical
    if (this.isModified('testResults')) {
      this.isCritical = (this.testResults || []).some((r) => r.isCritical);
    }

    return next();
  } catch (err) {
    return next(err);
  }
});

// ── Virtuals ────────────────────────────────────────────────────────────────

LabTestSchema.virtual('hasResults').get(function () {
  return Array.isArray(this.testResults) && this.testResults.length > 0;
});

LabTestSchema.virtual('hasPdfReport').get(function () {
  return !!this.resultPdfUrl;
});

LabTestSchema.virtual('abnormalCount').get(function () {
  if (!Array.isArray(this.testResults)) return 0;
  return this.testResults.filter((r) => r.isAbnormal).length;
});

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Mark this test as viewed by a specific viewer type, stamping the time.
 * Called when doctor or patient opens the result.
 *
 * @param {'doctor' | 'patient'} viewerType
 */
LabTestSchema.methods.markViewedBy = async function markViewedBy(viewerType) {
  if (viewerType === 'doctor') {
    this.isViewedByDoctor = true;
    this.doctorViewedAt = new Date();
  } else if (viewerType === 'patient') {
    this.isViewedByPatient = true;
    this.patientViewedAt = new Date();
  } else {
    throw new Error('viewerType must be "doctor" or "patient"');
  }
  return this.save();
};

/**
 * Transition to 'completed' state. Stamps completion metadata and resets
 * view flags so notifications fire.
 *
 * @param {ObjectId} labTechnicianId
 */
LabTestSchema.methods.markCompleted = async function markCompleted(labTechnicianId) {
  this.status = 'completed';
  this.completedAt = new Date();
  this.completedBy = labTechnicianId;
  // Reset view flags so notifications dispatch to both parties
  this.isViewedByDoctor = false;
  this.isViewedByPatient = false;
  return this.save();
};

module.exports = mongoose.model('LabTest', LabTestSchema);