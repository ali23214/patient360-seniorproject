/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Person Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: persons
 *  Source of truth: patient360_db_final.js (collection 01)
 *
 *  Adult demographics. Used by all adult roles: doctor, patient, pharmacist,
 *  lab_technician, dentist, admin. Children under 14 live in the separate
 *  `children` collection and migrate here when they receive a national ID.
 *
 *  Identity invariants:
 *    • nationalId — 11 digits, REQUIRED, unique
 *    • Full Syrian naming convention: firstName, fatherName, lastName, motherName
 *    • All four name parts are mandatory for identity verification
 *
 *  Soft delete:
 *    • isDeleted=true marks the record as removed without losing data
 *    • Queries should default to { isDeleted: { $ne: true } }
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

const EDUCATION_LEVELS = [
  'none', 'primary', 'secondary', 'diploma',
  'bachelor', 'master', 'doctorate',
];

const MARITAL_STATUSES = ['single', 'married', 'divorced', 'widowed'];

const GENDERS = ['male', 'female'];

// ── Sub-schema: profile photo ────────────────────────────────────────────────

const ProfilePhotoSchema = new Schema(
  {
    url: { type: String, trim: true },
    uploadedAt: { type: Date },
  },
  { _id: false },
);

// ── Main schema ──────────────────────────────────────────────────────────────

const PersonSchema = new Schema(
  {
    // ── Identity (all required) ───────────────────────────────────────────
    nationalId: {
      type: String,
      required: [true, 'الرقم الوطني مطلوب'],
      unique: true,
      match: [/^\d{11}$/, 'الرقم الوطني يجب أن يكون 11 رقم بالضبط'],
      trim: true,
      index: true,
    },
    firstName: {
      type: String,
      required: [true, 'الاسم الأول مطلوب'],
      trim: true,
      minlength: [2, 'الاسم الأول يجب أن يكون حرفين على الأقل'],
      maxlength: [50, 'الاسم الأول يجب ألا يتجاوز 50 حرف'],
    },
    fatherName: {
      type: String,
      required: [true, 'اسم الأب مطلوب'],
      trim: true,
      minlength: [2, 'اسم الأب يجب أن يكون حرفين على الأقل'],
      maxlength: [50, 'اسم الأب يجب ألا يتجاوز 50 حرف'],
    },
    lastName: {
      type: String,
      required: [true, 'اسم العائلة مطلوب'],
      trim: true,
      minlength: [2, 'اسم العائلة يجب أن يكون حرفين على الأقل'],
      maxlength: [50, 'اسم العائلة يجب ألا يتجاوز 50 حرف'],
    },
    motherName: {
      type: String,
      required: [true, 'اسم الأم مطلوب'],
      trim: true,
      minlength: [2, 'اسم الأم يجب أن يكون حرفين على الأقل'],
      maxlength: [100, 'اسم الأم يجب ألا يتجاوز 100 حرف'],
    },

    // ── Personal details ──────────────────────────────────────────────────
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
      enum: { values: GENDERS, message: 'الجنس يجب أن يكون ذكر أو أنثى' },
      required: [true, 'الجنس مطلوب'],
    },
    maritalStatus: { type: String, enum: MARITAL_STATUSES },
    occupation: { type: String, trim: true, maxlength: 100 },
    education: { type: String, enum: EDUCATION_LEVELS },

    // ── Contact ───────────────────────────────────────────────────────────
    phoneNumber: {
      type: String,
      required: [true, 'رقم الهاتف مطلوب'],
      trim: true,
    },
    alternativePhoneNumber: { type: String, trim: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'البريد الإلكتروني غير صحيح',
      ],
    },

    // ── Address ───────────────────────────────────────────────────────────
    governorate: {
      type: String,
      enum: { values: GOVERNORATES, message: 'المحافظة غير صالحة' },
      required: [true, 'المحافظة مطلوبة'],
      index: true,
    },
    city: {
      type: String,
      required: [true, 'المدينة مطلوبة'],
      trim: true,
    },
    district: { type: String, trim: true },
    street: { type: String, trim: true },
    building: { type: String, trim: true },
    address: {
      type: String,
      required: [true, 'العنوان مطلوب'],
      trim: true,
    },

    // ── Profile photo ─────────────────────────────────────────────────────
    profilePhoto: { type: ProfilePhotoSchema, default: undefined },

    // ── Status & soft delete ──────────────────────────────────────────────
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'Account' },
    deletionReason: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  {
    timestamps: true, // adds createdAt + updatedAt
    collection: 'persons',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Compound indexes (single-field indexes are declared inline above) ───────

PersonSchema.index({ firstName: 1, fatherName: 1, lastName: 1 }, { name: 'idx_fullname' });
PersonSchema.index({ governorate: 1, city: 1 }, { name: 'idx_location' });
PersonSchema.index({ isDeleted: 1, isActive: 1 }, { name: 'idx_status' });
PersonSchema.index(
  { email: 1 },
  { unique: true, sparse: true, name: 'idx_email_unique' },
);

// ── Virtuals ────────────────────────────────────────────────────────────────

/**
 * Full Syrian name in conventional order.
 * @returns {string} e.g. "Ahmad Hassan Al-Sayed"
 */
PersonSchema.virtual('fullName').get(function () {
  return [this.firstName, this.fatherName, this.lastName]
    .filter(Boolean)
    .join(' ');
});

/**
 * Calculated age in completed years.
 * @returns {number|null}
 */
PersonSchema.virtual('age').get(function () {
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

// ── Query helpers ───────────────────────────────────────────────────────────

/**
 * Filter out soft-deleted persons. Use with .find().notDeleted()
 */
PersonSchema.query.notDeleted = function notDeleted() {
  return this.where({ isDeleted: { $ne: true } });
};

/**
 * Filter active accounts only. Use with .find().active()
 */
PersonSchema.query.active = function active() {
  return this.where({ isActive: true, isDeleted: { $ne: true } });
};

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Soft-delete this person record.
 * @param {ObjectId} accountId - the account performing the deletion
 * @param {string} [reason]
 */
PersonSchema.methods.softDelete = async function softDelete(accountId, reason) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = accountId;
  if (reason) this.deletionReason = reason;
  return this.save();
};

module.exports = mongoose.model('Person', PersonSchema);