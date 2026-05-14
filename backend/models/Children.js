/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Children Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: children
 *  Source of truth: patient360_db_final.js (collection 02)
 *
 *  Children under 14 who do not yet have a Syrian national ID.
 *  Identified by `childRegistrationNumber` in the format CRN-YYYYMMDD-XXXXX.
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
      // Format: CRN-YYYYMMDD-XXXXX (5-digit sequence)
      match: [
        /^CRN-\d{8}-\d{5}$/,
        'تنسيق رقم تسجيل الطفل غير صحيح (CRN-YYYYMMDD-XXXXX)',
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
 * Generate the next available childRegistrationNumber for today.
 * Format: CRN-YYYYMMDD-XXXXX where XXXXX is a 5-digit zero-padded counter
 * scoped to the current calendar day.
 *
 * @returns {Promise<string>}
 */
ChildrenSchema.statics.generateRegistrationNumber = async function generateRegistrationNumber() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `CRN-${datePart}-`;

  // Count children already registered today, then increment
  const todayCount = await this.countDocuments({
    childRegistrationNumber: { $regex: `^${prefix}` },
  });

  const sequence = String(todayCount + 1).padStart(5, '0');
  return `${prefix}${sequence}`;
};

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