/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Children Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: children
 *  Source of truth: patient360_db_final.js (collection 02)
 *
 *  Children under 14 who do not yet have a Syrian national ID.
 *
 *  Two valid `childRegistrationNumber` formats are accepted:
 *    • v2.3 (Muath's spec, current):  {parentNationalId}-NN
 *        e.g. 01222333444-02  ← second child of parent 01222333444
 *        Generated inline by authController.signup() using a per-parent
 *        sequence so each child's ID is human-readable and traceable to
 *        their guardian.
 *    • Legacy (pre-v2.3):             CRN-YYYYMMDD-XXXXX
 *        e.g. CRN-20260525-00008
 *        Generated atomically by the `generateRegistrationNumber` static
 *        below (kept for backward-compat with existing rows and the
 *        seedCounters.js seed file).
 *
 *  Migration lifecycle (3 states tracked by `migrationStatus`):
 *    1. pending   → child is under 14, has no nationalId yet
 *    2. ready     → child has received their nationalId, ready to migrate
 *    3. migrated  → admin has copied the record to `persons` and set
 *                   migratedToPersonId pointing at the new persons._id
 *
 *  This model is intentionally separate from `Person` because:
 *    • Schema requirements differ (no nationalId required for children)
 *    • Parent linking (parentNationalId, parentPersonId) only applies here
 *    • Guardian fields, school info only apply here
 *    • Mixing the two collections led to the bugs we're now fixing
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

// Eagerly load Counter so `mongoose.model('Counter')` is available
// inside generateRegistrationNumber. This avoids ordering issues in
// models/index.js and ensures the atomic counter is always ready.
require('./Counter');

const { Schema } = mongoose;

// ── Reusable enums (kept in sync with the locked schema) ────────────────────

const GOVERNORATES = [
  'damascus', 'aleppo', 'homs', 'hama', 'latakia', 'tartus',
  'idlib', 'deir_ez_zor', 'raqqa', 'hasakah', 'daraa',
  'as_suwayda', 'quneitra', 'rif_dimashq',
];

const GUARDIAN_RELATIONSHIPS = [
  'father', 'mother', 'grandfather', 'grandmother',
  'uncle', 'aunt', 'sibling', 'other',
];

const MIGRATION_STATUSES = ['pending', 'ready', 'migrated'];

const GENDERS = ['male', 'female'];

// ── CRN format regex (single source of truth) ───────────────────────────────
//
// Accepts either format documented in the header:
//   • v2.3:   ^\d{11}-\d{2}$        →  01222333444-02
//   • legacy: ^CRN-\d{8}-\d{5}$     →  CRN-20260525-00008
//
// Exported as a constant so we can reuse it in tests and admin tooling
// without rewriting the pattern.
const CRN_FORMAT_REGEX = /^(\d{11}-\d{2}|CRN-\d{8}-\d{5})$/;

// ── Sub-schemas ─────────────────────────────────────────────────────────────

const ProfilePhotoSchema = new Schema(
  {
    url: { type: String, trim: true },
    uploadedAt: { type: Date },
  },
  { _id: false },
);

// ── Main schema ──────────────────────────────────────────────────────────────

const ChildrenSchema = new Schema(
  {
    // ── Child identity ────────────────────────────────────────────────────
    childRegistrationNumber: {
      type: String,
      required: [true, 'رقم تسجيل الطفل مطلوب'],
      unique: true,
      trim: true,
      // Accepts both v2.3 ({parentNationalId}-NN) and legacy (CRN-YYYYMMDD-XXXXX).
      // See CRN_FORMAT_REGEX above for the canonical definition.
      match: [
        CRN_FORMAT_REGEX,
        'تنسيق رقم تسجيل الطفل غير صحيح (يجب أن يكون: {الرقم الوطني للوالد}-XX أو CRN-YYYYMMDD-XXXXX)',
      ],
    },
    birthCertificateNumber: {
      type: String,
      trim: true,
      sparse: true,
    },

    // ── Parent / Guardian link (REQUIRED) ─────────────────────────────────
    parentNationalId: {
      type: String,
      required: [true, 'الرقم الوطني للوالد مطلوب'],
      match: [/^\d{11}$/, 'الرقم الوطني يجب أن يكون 11 رقم بالضبط'],
      trim: true,
      index: true,
    },
    parentPersonId: {
      type: Schema.Types.ObjectId,
      ref: 'Person',
      required: [true, 'معرّف الوالد في جدول الأشخاص مطلوب'],
      index: true,
    },

    // ── Personal details ──────────────────────────────────────────────────
    firstName: {
      type: String,
      required: [true, 'الاسم الأول مطلوب'],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    fatherName: {
      type: String,
      required: [true, 'اسم الأب مطلوب'],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: [true, 'اسم العائلة مطلوب'],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    motherName: {
      type: String,
      required: [true, 'اسم الأم مطلوب'],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    dateOfBirth: {
      type: Date,
      required: [true, 'تاريخ الميلاد مطلوب'],
      validate: {
        validator: (v) => v < new Date(),
        message: 'تاريخ الميلاد يجب أن يكون في الماضي',
      },
    },
    gender: {
      type: String,
      enum: GENDERS,
      required: [true, 'الجنس مطلوب'],
    },

    // ── Contact (usually the parent's) ────────────────────────────────────
    phoneNumber: { type: String, trim: true },
    alternativePhoneNumber: { type: String, trim: true },

    // ── Address ───────────────────────────────────────────────────────────
    governorate: {
      type: String,
      enum: GOVERNORATES,
      required: [true, 'المحافظة مطلوبة'],
    },
    city: { type: String, required: true, trim: true },
    district: { type: String, trim: true },
    street: { type: String, trim: true },
    building: { type: String, trim: true },
    address: { type: String, required: true, trim: true },

    // ── Guardian (only set if different from parent) ──────────────────────
    guardianName: { type: String, trim: true },
    guardianRelationship: { type: String, enum: GUARDIAN_RELATIONSHIPS },
    guardianPhoneNumber: { type: String, trim: true },

    // ── School info ───────────────────────────────────────────────────────
    schoolName: { type: String, trim: true },
    grade: { type: String, trim: true },

    // ── Profile photo ─────────────────────────────────────────────────────
    profilePhoto: { type: ProfilePhotoSchema, default: undefined },

    // ── Migration system ──────────────────────────────────────────────────
    nationalId: {
      type: String,
      match: [/^\d{11}$/, 'الرقم الوطني يجب أن يكون 11 رقم بالضبط'],
      trim: true,
      sparse: true,
      // unique enforced by the sparse index below
    },
    nationalIdReceivedAt: { type: Date },
    hasReceivedNationalId: { type: Boolean, default: false, index: true },
    migrationStatus: {
      type: String,
      enum: MIGRATION_STATUSES,
      default: 'pending',
      index: true,
    },
    migratedToPersonId: {
      type: Schema.Types.ObjectId,
      ref: 'Person',
      sparse: true,
    },
    migratedAt: { type: Date },
    migratedBy: { type: Schema.Types.ObjectId, ref: 'Account' },

    // ── Status & soft delete ──────────────────────────────────────────────
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    notes: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'children',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes (compound + sparse uniques) ─────────────────────────────────────

ChildrenSchema.index(
  { nationalId: 1 },
  { unique: true, sparse: true, name: 'idx_nationalId_unique' },
);
ChildrenSchema.index(
  { birthCertificateNumber: 1 },
  { unique: true, sparse: true, name: 'idx_birthCert_unique' },
);
ChildrenSchema.index(
  { firstName: 1, fatherName: 1, lastName: 1 },
  { name: 'idx_fullname' },
);
ChildrenSchema.index({ governorate: 1, city: 1 }, { name: 'idx_location' });
ChildrenSchema.index({ isDeleted: 1, isActive: 1 }, { name: 'idx_status' });
ChildrenSchema.index(
  { dateOfBirth: 1, hasReceivedNationalId: 1 },
  { name: 'idx_dob_hasId_compound' },
);
ChildrenSchema.index(
  { dateOfBirth: 1, migrationStatus: 1 },
  { name: 'idx_dob_migration_compound' },
);
ChildrenSchema.index(
  { migratedToPersonId: 1 },
  { sparse: true, name: 'idx_migratedToPersonId' },
);

// ── Virtuals ────────────────────────────────────────────────────────────────

ChildrenSchema.virtual('fullName').get(function () {
  return [this.firstName, this.fatherName, this.lastName]
    .filter(Boolean)
    .join(' ');
});

ChildrenSchema.virtual('age').get(function () {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birth = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
});

/**
 * True when the child has aged past 14 AND has been issued a nationalId
 * but has not yet been migrated. UI should surface these for admin action.
 */
ChildrenSchema.virtual('isReadyToMigrate').get(function () {
  return (
    this.hasReceivedNationalId === true
    && this.migrationStatus !== 'migrated'
    && this.age !== null
    && this.age >= 14
  );
});

// ── Pre-save hook: auto-flip migrationStatus when nationalId arrives ────────

ChildrenSchema.pre('save', function autoSetMigrationStatus(next) {
  // When admin sets nationalId for the first time, automatically:
  //   - flip hasReceivedNationalId to true
  //   - move migrationStatus from 'pending' → 'ready'
  if (this.isModified('nationalId') && this.nationalId) {
    if (!this.hasReceivedNationalId) {
      this.hasReceivedNationalId = true;
      this.nationalIdReceivedAt = this.nationalIdReceivedAt || new Date();
    }
    if (this.migrationStatus === 'pending') {
      this.migrationStatus = 'ready';
    }
  }
  next();
});

// ── Static helpers ──────────────────────────────────────────────────────────

/**
 * Generate a CRN in the LEGACY format: CRN-YYYYMMDD-XXXXX
 * (5-digit zero-padded daily counter)
 *
 *  ⚠️  NOTE — v2.3+ child registrations DO NOT call this helper.
 *  The canonical v2.3 format ({parentNationalId}-NN) is generated inline
 *  by authController.signup() because the sequence is per-parent, not
 *  per-day. This helper is preserved for:
 *    • Backward compatibility with rows already in the DB
 *    • The seedCounters.js migration script
 *    • Admin tooling that may still mint legacy IDs (e.g. bulk imports)
 *
 * Concurrency-safe by design:
 *   Uses the `counters` collection with MongoDB's atomic `findOneAndUpdate`
 *   + `$inc`. Two simultaneous registrations cannot receive the same
 *   sequence value — MongoDB serializes the write at the document level.
 *
 *   This replaces the previous `countDocuments` + `+1` implementation,
 *   which suffered from a classic read-then-write race condition that
 *   would throw E11000 (duplicate key) when two children registered in
 *   the same millisecond.
 *
 * @returns {Promise<string>} e.g. "CRN-20260525-00008"
 */
ChildrenSchema.statics.generateRegistrationNumber = async function generateRegistrationNumber() {
  const Counter = mongoose.model('Counter');

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yyyy}${mm}${dd}`;

  // Atomic increment — race-condition-safe.
  // First call of the day creates the counter via upsert and returns 1.
  const seq = await Counter.next(`child_${datePart}`);

  const sequence = String(seq).padStart(5, '0');
  return `CRN-${datePart}-${sequence}`;
};

/**
 * Export the CRN format regex as a static so callers (controllers,
 * routes, validators) can validate strings against the same source
 * of truth without re-declaring the pattern.
 *
 * @example
 *   if (!Children.CRN_FORMAT_REGEX.test(input)) { ... }
 */
ChildrenSchema.statics.CRN_FORMAT_REGEX = CRN_FORMAT_REGEX;

// ── Query helpers ───────────────────────────────────────────────────────────

ChildrenSchema.query.notDeleted = function notDeleted() {
  return this.where({ isDeleted: { $ne: true } });
};

ChildrenSchema.query.pendingMigration = function pendingMigration() {
  return this.where({
    migrationStatus: 'ready',
    isDeleted: { $ne: true },
  });
};

module.exports = mongoose.model('Children', ChildrenSchema);