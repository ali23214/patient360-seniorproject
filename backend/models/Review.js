/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Review Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: reviews
 *  Source of truth: patient360_db_final.js (collection 24)
 *
 *  Patient ratings for doctors, dentists, labs, pharmacies, hospitals.
 *
 *  Anti-fake-review safeguards:
 *    • Either visitId OR appointmentId is REQUIRED — a patient can't
 *      review a provider they never interacted with
 *    • One review per (reviewer × target × visit/appointment) — enforced
 *      via compound unique index below
 *    • status starts as 'pending' — admin must approve before public display
 *
 *  Workflow:
 *    1. Patient completes visit → visit.status='completed'
 *    2. App prompts patient to leave review
 *    3. Review created with status='pending'
 *    4. Moderator (admin) reviews: approves, rejects, or flags
 *    5. On approve: target's averageRating + totalReviews recomputed via
 *       target.refreshRating() (defined on Doctor/Dentist/Pharmacy/etc.)
 *
 *  Anonymity: when isAnonymous=true, the public display hides the reviewer's
 *  name. The reviewerPersonId/reviewerChildId is still stored for moderation
 *  and to enforce the one-review-per-event rule.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const STATUSES = ['pending', 'approved', 'rejected', 'flagged'];

// ── Main schema ──────────────────────────────────────────────────────────────

const ReviewSchema = new Schema(
  {
    // ── Reviewer (XOR — adult or parent-of-child) ─────────────────────────
    reviewerPersonId: {
      type: Schema.Types.ObjectId,
      ref: 'Person',
      sparse: true,
    },
    reviewerChildId: {
      type: Schema.Types.ObjectId,
      ref: 'Children',
      sparse: true,
    },

    // ── Target (exactly one must be set) ──────────────────────────────────
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor', sparse: true },
    dentistId: { type: Schema.Types.ObjectId, ref: 'Dentist', sparse: true },
    laboratoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Laboratory',
      sparse: true,
    },
    pharmacyId: {
      type: Schema.Types.ObjectId,
      ref: 'Pharmacy',
      sparse: true,
    },
    hospitalId: {
      type: Schema.Types.ObjectId,
      ref: 'Hospital',
      sparse: true,
    },

    // ── Linked event (REQUIRED — anti-fake safeguard) ─────────────────────
    visitId: { type: Schema.Types.ObjectId, ref: 'Visit', sparse: true },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      sparse: true,
    },

    // ── Rating & content ──────────────────────────────────────────────────
    rating: {
      type: Number,
      required: [true, 'التقييم مطلوب'],
      min: [1, 'التقييم يجب أن يكون 1 على الأقل'],
      max: [5, 'التقييم يجب ألا يتجاوز 5'],
    },
    reviewText: {
      type: String,
      trim: true,
      maxlength: [1000, 'نص التقييم يجب ألا يتجاوز 1000 حرف'],
    },

    // ── Moderation ────────────────────────────────────────────────────────
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    isAnonymous: { type: Boolean, default: false },
    adminNote: { type: String, trim: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'Account' }, // moderator
    reviewedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'reviews',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

ReviewSchema.index(
  { reviewerPersonId: 1, createdAt: -1 },
  { name: 'idx_reviewer_adult_date' },
);
ReviewSchema.index(
  { reviewerChildId: 1, createdAt: -1 },
  { name: 'idx_reviewer_child_date' },
);
ReviewSchema.index({ doctorId: 1, status: 1 }, { name: 'idx_doctor_status' });
ReviewSchema.index({ dentistId: 1, status: 1 }, { name: 'idx_dentist_status' });
ReviewSchema.index(
  { laboratoryId: 1, status: 1 },
  { name: 'idx_lab_status' },
);
ReviewSchema.index(
  { pharmacyId: 1, status: 1 },
  { name: 'idx_pharmacy_status' },
);
ReviewSchema.index(
  { hospitalId: 1, status: 1 },
  { name: 'idx_hospital_status' },
);
ReviewSchema.index({ rating: 1 }, { name: 'idx_rating' });
ReviewSchema.index({ visitId: 1 }, { sparse: true, name: 'idx_visitId' });

// One review per reviewer per visit (prevents duplicate submissions)
ReviewSchema.index(
  { reviewerPersonId: 1, visitId: 1 },
  {
    unique: true,
    sparse: true,
    name: 'idx_unique_reviewer_visit_adult',
  },
);
ReviewSchema.index(
  { reviewerChildId: 1, visitId: 1 },
  {
    unique: true,
    sparse: true,
    name: 'idx_unique_reviewer_visit_child',
  },
);

// ── Pre-validate: reviewer XOR + target XOR + event link required ──────────

ReviewSchema.pre('validate', function enforceRules(next) {
  // Reviewer XOR
  const reviewerCount = [
    this.reviewerPersonId,
    this.reviewerChildId,
  ].filter(Boolean).length;
  if (reviewerCount === 0) {
    return next(new Error('يجب تحديد reviewerPersonId أو reviewerChildId'));
  }
  if (reviewerCount > 1) {
    return next(new Error('لا يمكن تحديد reviewerPersonId و reviewerChildId معاً'));
  }

  // Target — exactly one must be set
  const targets = [
    this.doctorId,
    this.dentistId,
    this.laboratoryId,
    this.pharmacyId,
    this.hospitalId,
  ].filter(Boolean);
  if (targets.length === 0) {
    return next(new Error('يجب تحديد جهة التقييم (طبيب/مختبر/صيدلية/مستشفى)'));
  }
  if (targets.length > 1) {
    return next(new Error('يمكن تقييم جهة واحدة فقط لكل تقييم'));
  }

  // Event link — anti-fake safeguard: visitId OR appointmentId required
  if (!this.visitId && !this.appointmentId) {
    return next(new Error('يجب ربط التقييم بزيارة أو موعد سابق'));
  }

  return next();
});

// ── Virtuals ────────────────────────────────────────────────────────────────

/**
 * Identify which target type this review is about. Useful for routing the
 * refreshRating() call to the right model.
 */
ReviewSchema.virtual('targetType').get(function () {
  if (this.doctorId) return 'Doctor';
  if (this.dentistId) return 'Dentist';
  if (this.laboratoryId) return 'Laboratory';
  if (this.pharmacyId) return 'Pharmacy';
  if (this.hospitalId) return 'Hospital';
  return null;
});

ReviewSchema.virtual('targetId').get(function () {
  return this.doctorId
    || this.dentistId
    || this.laboratoryId
    || this.pharmacyId
    || this.hospitalId
    || null;
});

ReviewSchema.virtual('isPublic').get(function () {
  return this.status === 'approved';
});

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Approve this review and refresh the target's denormalized rating stats.
 *
 * @param {ObjectId} moderatorAccountId
 */
ReviewSchema.methods.approve = async function approve(moderatorAccountId) {
  if (this.status === 'approved') return this;
  this.status = 'approved';
  this.reviewedBy = moderatorAccountId;
  this.reviewedAt = new Date();
  await this.save();

  // Refresh the target's averageRating
  await this.refreshTargetRating();
  return this;
};

/**
 * Reject this review with an admin note.
 *
 * @param {ObjectId} moderatorAccountId
 * @param {string} note - reason shown to admin (not patient)
 */
ReviewSchema.methods.reject = async function reject(moderatorAccountId, note) {
  if (this.status === 'rejected') return this;
  this.status = 'rejected';
  this.reviewedBy = moderatorAccountId;
  this.reviewedAt = new Date();
  this.adminNote = note || '';
  await this.save();

  // Refresh in case the review was previously approved
  await this.refreshTargetRating();
  return this;
};

/**
 * Flag this review for further investigation (e.g. spam, abuse).
 *
 * @param {ObjectId} moderatorAccountId
 * @param {string} note
 */
ReviewSchema.methods.flag = async function flag(moderatorAccountId, note) {
  this.status = 'flagged';
  this.reviewedBy = moderatorAccountId;
  this.reviewedAt = new Date();
  this.adminNote = note || '';
  return this.save();
};

/**
 * Trigger refreshRating() on the target document.
 */
ReviewSchema.methods.refreshTargetRating = async function refreshTargetRating() {
  const targetType = this.targetType;
  const targetId = this.targetId;
  if (!targetType || !targetId) return;

  const TargetModel = mongoose.model(targetType);
  const target = await TargetModel.findById(targetId);
  if (target && typeof target.refreshRating === 'function') {
    await target.refreshRating();
  }
};

module.exports = mongoose.model('Review', ReviewSchema);