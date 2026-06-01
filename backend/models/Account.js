/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Account Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: accounts
 *  Source of truth: patient360_db_final.js (collection 03)
 *
 *  Authentication credentials and session state. One account per user.
 *
 *  Profile linkage (XOR — exactly one of these must be set):
 *    • personId  → adults (references persons._id)
 *    • childId   → children under 14 (references children._id)
 *
 *  Security features:
 *    • bcrypt password hashing via pre-validate hook
 *    • Failed login lockout via accountLockedUntil
 *    • Password reset OTP with TTL via resetPasswordExpires
 *
 *  Mobile push notifications:
 *    • pushNotificationTokens[] stores Firebase Cloud Messaging (FCM) tokens
 *    • One entry per device the user logs in on
 *    • Used by notification service to dispatch push alerts
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { Schema } = mongoose;

// ── Constants ───────────────────────────────────────────────────────────────

const BCRYPT_SALT_ROUNDS = 12;

const ROLES = [
  'patient', 'doctor', 'admin', 'pharmacist',
  'lab_technician', 'dentist', 'nurse', 'receptionist',
];

const DEACTIVATION_REASONS = [
  'voluntary', 'administrative', 'security',
  'retirement', 'deceased', 'duplicate', 'fraud',
];

const PUSH_PLATFORMS = ['ios', 'android', 'web'];

const LANGUAGES = ['ar', 'en'];

// ── Sub-schema: push notification token ─────────────────────────────────────

const PushTokenSchema = new Schema(
  {
    token: { type: String, required: true, trim: true },
    platform: { type: String, enum: PUSH_PLATFORMS, required: true },
    deviceName: { type: String, trim: true },
    appVersion: { type: String, trim: true },
    addedAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { _id: false },
);

// ── Main schema ──────────────────────────────────────────────────────────────

const AccountSchema = new Schema(
  {
    // ── Credentials ───────────────────────────────────────────────────────
    email: {
      type: String,
      required: [true, 'البريد الإلكتروني مطلوب'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'البريد الإلكتروني غير صحيح',
      ],
    },
    password: {
      type: String,
      required: [true, 'كلمة المرور مطلوبة'],
      minlength: [60, 'كلمة المرور المخزنة يجب أن تكون مشفّرة'],
      select: false, // never returned by default — must be explicitly selected
    },
    roles: {
      type: [{ type: String, enum: ROLES }],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 1,
        message: 'يجب تحديد دور واحد على الأقل',
      },
    },

    // ── Profile reference (XOR enforced by pre-validate hook) ─────────────
    personId: {
      type: Schema.Types.ObjectId,
      ref: 'Person',
      sparse: true,
    },
    childId: {
      type: Schema.Types.ObjectId,
      ref: 'Children',
      sparse: true,
    },

    // ── Account status ────────────────────────────────────────────────────
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    deactivationReason: { type: String, enum: DEACTIVATION_REASONS },
    deactivatedAt: { type: Date },
    deactivatedBy: { type: Schema.Types.ObjectId, ref: 'Account' },

    // ── Security ──────────────────────────────────────────────────────────
    lastLogin: { type: Date },
    lastLoginIp: { type: String, trim: true },
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    accountLockedUntil: { type: Date },
    passwordChangedAt: { type: Date },

    // ── Password reset (OTP) ──────────────────────────────────────────────
    resetPasswordOTP: { type: String, trim: true, select: false },
    resetPasswordExpires: { type: Date, select: false },

    // ── Mobile app push notification tokens (FCM) ─────────────────────────
    pushNotificationTokens: { type: [PushTokenSchema], default: [] },

    // ── Preferences ───────────────────────────────────────────────────────
    language: { type: String, enum: LANGUAGES, default: 'ar' },
    timezone: { type: String, default: 'Asia/Damascus' },
  },
  {
    timestamps: true,
    collection: 'accounts',
    toJSON: {
      virtuals: true,
      // Strip sensitive fields when serializing to JSON
      transform(_doc, ret) {
        delete ret.password;
        delete ret.resetPasswordOTP;
        delete ret.resetPasswordExpires;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

AccountSchema.index({ personId: 1 }, { sparse: true, name: 'idx_personId' });
AccountSchema.index({ childId: 1 }, { sparse: true, name: 'idx_childId' });
AccountSchema.index({ roles: 1 }, { name: 'idx_roles' });
AccountSchema.index({ isActive: 1, isVerified: 1 }, { name: 'idx_status' });
AccountSchema.index(
  { resetPasswordOTP: 1, resetPasswordExpires: 1 },
  { sparse: true, name: 'idx_resetOTP' },
);
AccountSchema.index(
  { 'pushNotificationTokens.token': 1 },
  { sparse: true, name: 'idx_fcm_token' },
);

// ── Pre-validate: hash password if it's plaintext ───────────────────────────
//
// Why pre('validate') and not pre('save')?
// Mongoose validation runs BEFORE pre('save') hooks. The password field has
// a minlength: 60 validator (to ensure stored values look like bcrypt hashes —
// 60 chars). If we hashed in pre('save'), validation would fail first because
// plaintext passwords are 8-30 chars. By hashing in pre('validate'), the
// value is already a 60-char hash by the time the minlength check runs.
//
// This hook also runs for password resets (when the controller does
// `account.password = newPlaintext; await account.save();`) because
// account.save() triggers validation, which triggers this hook.

AccountSchema.pre('validate', async function hashPassword(next) {
  // Only hash if the password was modified AND it's not already a bcrypt hash
  if (!this.isModified('password')) return next();

  // bcrypt hashes always start with $2a$, $2b$, or $2y$ and are 60 chars
  const looksHashed = /^\$2[aby]\$\d{2}\$.{53}$/.test(this.password);
  if (looksHashed) return next();

  try {
    this.password = await bcrypt.hash(this.password, BCRYPT_SALT_ROUNDS);
    this.passwordChangedAt = new Date();
    return next();
  } catch (err) {
    return next(err);
  }
});

// ── Pre-validate: enforce XOR between personId and childId ──────────────────

AccountSchema.pre('validate', function enforceProfileXor(next) {
  const hasPerson = !!this.personId;
  const hasChild = !!this.childId;

  if (!hasPerson && !hasChild) {
    return next(
      new mongoose.Error.ValidationError(this).addError(
        'personId',
        new mongoose.Error.ValidatorError({
          message: 'يجب تحديد personId أو childId',
          path: 'personId',
        }),
      ),
    );
  }
  if (hasPerson && hasChild) {
    return next(
      new mongoose.Error.ValidationError(this).addError(
        'childId',
        new mongoose.Error.ValidatorError({
          message: 'لا يمكن تحديد personId و childId معاً',
          path: 'childId',
        }),
      ),
    );
  }
  return next();
});

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Compare a plaintext password against the stored bcrypt hash.
 * Note: requires `.select('+password')` on the query that loaded this doc,
 * because password has `select: false`.
 *
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
AccountSchema.methods.comparePassword = async function comparePassword(candidatePassword) {
  if (!this.password) {
    throw new Error('Account loaded without password field — use .select("+password")');
  }
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Increment failed-login counter and lock the account if threshold reached.
 * Lockout: 5 failed attempts → 15 minute lock.
 */
AccountSchema.methods.recordFailedLogin = async function recordFailedLogin() {
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MINUTES = 15;

  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;
  if (this.failedLoginAttempts >= MAX_ATTEMPTS) {
    this.accountLockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
  }
  return this.save();
};

/**
 * Reset failed-login state after a successful login.
 */
AccountSchema.methods.recordSuccessfulLogin = async function recordSuccessfulLogin(ip) {
  this.failedLoginAttempts = 0;
  this.accountLockedUntil = undefined;
  this.lastLogin = new Date();
  if (ip) this.lastLoginIp = ip;
  return this.save();
};

/**
 * Is the account currently locked due to failed login attempts?
 * @returns {boolean}
 */
AccountSchema.methods.isLocked = function isLocked() {
  return !!(this.accountLockedUntil && this.accountLockedUntil > new Date());
};

/**
 * Add or refresh a push notification token for a device. If a token with the
 * same value already exists, its lastUsedAt is updated; otherwise a new entry
 * is appended. Also enforces a soft cap of 10 devices per account.
 *
 * @param {object} tokenData - { token, platform, deviceName?, appVersion? }
 */
AccountSchema.methods.addPushToken = async function addPushToken(tokenData) {
  const MAX_DEVICES = 10;

  if (!tokenData || !tokenData.token || !tokenData.platform) {
    throw new Error('addPushToken requires { token, platform }');
  }

  const existing = this.pushNotificationTokens.find((t) => t.token === tokenData.token);
  if (existing) {
    existing.lastUsedAt = new Date();
    existing.isActive = true;
    if (tokenData.deviceName) existing.deviceName = tokenData.deviceName;
    if (tokenData.appVersion) existing.appVersion = tokenData.appVersion;
  } else {
    this.pushNotificationTokens.push({
      ...tokenData,
      addedAt: new Date(),
      lastUsedAt: new Date(),
      isActive: true,
    });
    // Trim oldest if over the cap
    if (this.pushNotificationTokens.length > MAX_DEVICES) {
      this.pushNotificationTokens.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
      this.pushNotificationTokens = this.pushNotificationTokens.slice(0, MAX_DEVICES);
    }
  }

  return this.save();
};

/**
 * Remove a push notification token (called on logout).
 * @param {string} token
 */
AccountSchema.methods.removePushToken = async function removePushToken(token) {
  this.pushNotificationTokens = this.pushNotificationTokens.filter(
    (t) => t.token !== token,
  );
  return this.save();
};

// ── Static helpers ──────────────────────────────────────────────────────────

/**
 * Find an account by email, including the password field for auth checks.
 * @param {string} email
 * @returns {Promise<Account|null>}
 */
AccountSchema.statics.findForLogin = function findForLogin(email) {
  return this.findOne({ email: email.trim().toLowerCase() })
    .select('+password +resetPasswordOTP +resetPasswordExpires');
};

module.exports = mongoose.model('Account', AccountSchema);