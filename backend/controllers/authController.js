/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Authentication Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/controllers/authController.js
 *  🔧 Version: 2.0 (Security audit logging integrated)
 *
 *  Responsibilities:
 *    1. Signup (adult + minor with child registration number flow)
 *    2. Login + comprehensive failure tracking
 *    3. Logout (NEW — invalidates FCM token, audit logged)
 *    4. Password reset via OTP email
 *    5. Doctor / Pharmacist / Lab Technician professional registration
 *    6. Token verification and last-login tracking
 *
 *  Security Events Audited (NEW in v2.0):
 *    ✓ LOGIN_SUCCESS       — successful authentication
 *    ✓ LOGIN_FAILED        — wrong password, no account, inactive, locked
 *    ✓ LOGOUT              — explicit user-initiated logout
 *    ✓ PASSWORD_RESET_REQUESTED — forgot-password OTP issued
 *    ✓ PASSWORD_CHANGED    — password reset completed
 *    ✓ ACCOUNT_LOCKED      — too many failed attempts (auto-triggered)
 *    ✓ OTP_VERIFIED        — OTP successfully validated
 *    ✓ OTP_FAILED          — wrong or expired OTP entered
 *    ✓ SIGNUP_SUCCESS      — new account registered
 *
 *  All audit calls use AuditLog.record() which is safe and never throws.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const mongoose = require('mongoose');

// ── Models ──────────────────────────────────────────────────────────────────
const {
  Account,
  Person,
  Children,
  Patient,
  Doctor,
  Pharmacist,
  LabTechnician,
  Pharmacy,
  Laboratory,
  DoctorRequest,
  AuditLog,
} = require('../models');

// ── Utilities ───────────────────────────────────────────────────────────────
const {
  sendEmail,
  generateOTP,
  createOTPEmailTemplate,
} = require('../utils/sendEmail');

// ============================================================================
// CONSTANTS
// ============================================================================

const JWT_EXPIRES_IN     = process.env.JWT_EXPIRES_IN || '7d';
const OTP_VALIDITY_MS    = 10 * 60 * 1000; // 10 minutes
const ADULT_AGE_THRESHOLD = 14;            // Patient360 dual-patient model

// ============================================================================
// HELPER — Generate JWT token
// ============================================================================

function signToken(accountId, roles) {
  return jwt.sign(
    { id: accountId, roles },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

// ============================================================================
// HELPER — Extract IP address robustly (proxy-aware)
// ============================================================================

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

// ============================================================================
// HELPER — Calculate age from date of birth
// ============================================================================

function calculateAge(dateOfBirth) {
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

// ============================================================================
// 1. SIGNUP — Adult or Minor patient registration
// ============================================================================

/**
 * POST /api/auth/signup
 * Public route — creates a new patient account.
 *
 * Body (adult, age ≥ 14):
 *   { firstName, fatherName, lastName, motherName, nationalId,
 *     dateOfBirth, gender, phoneNumber, email, password,
 *     governorate, city, address, bloodType?, allergies?, ... }
 *
 * Body (minor, age < 14):
 *   { firstName, fatherName, lastName, motherName, dateOfBirth, gender,
 *     parentNationalId, ... (no nationalId field for the child) }
 */
exports.signup = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      // Names
      firstName, fatherName, lastName, motherName,
      // Identity
      nationalId, dateOfBirth, gender,
      // Contact
      phoneNumber, email, password,
      // Address
      governorate, city, district, street, building, address,
      // Medical (optional)
      bloodType, allergies, chronicDiseases, height, weight,
      // For minor flow
      parentNationalId,
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────────
    if (!firstName || !fatherName || !lastName || !motherName) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'الاسم الكامل مطلوب (الاسم، اسم الأب، اسم العائلة، اسم الأم)',
      });
    }

    if (!dateOfBirth || !gender) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'تاريخ الميلاد والجنس مطلوبان',
      });
    }

    if (!email || !password) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني وكلمة المرور مطلوبان',
      });
    }

    // ── Check if email already exists ───────────────────────────────────
    const existingAccount = await Account.findOne({ email: email.toLowerCase() }).session(session);
    if (existingAccount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مستخدم بالفعل',
      });
    }

    // ── Determine patient type by age ───────────────────────────────────
    const age = calculateAge(dateOfBirth);
    const isAdult = age >= ADULT_AGE_THRESHOLD;

    let personDoc = null;
    let childDoc  = null;
    let patientDoc = null;

    if (isAdult) {
      // ── ADULT FLOW ────────────────────────────────────────────────────
      if (!nationalId || !/^\d{11}$/.test(nationalId)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'الرقم الوطني مطلوب ويجب أن يكون 11 رقماً',
        });
      }

      // Check nationalId uniqueness
      const existingPerson = await Person.findOne({ nationalId }).session(session);
      if (existingPerson) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'الرقم الوطني مستخدم بالفعل',
        });
      }

      // Create Person document
      [personDoc] = await Person.create([{
        nationalId,
        firstName, fatherName, lastName, motherName,
        dateOfBirth, gender,
        phoneNumber, email: email.toLowerCase(),
        governorate, city, district, street, building, address,
        isActive: true,
        isDeleted: false,
      }], { session });

      // Create Patient profile linked to Person
      [patientDoc] = await Patient.create([{
        personId: personDoc._id,
        bloodType: bloodType || 'unknown',
        allergies: allergies || [],
        chronicDiseases: chronicDiseases || [],
        height, weight,
        totalVisits: 0,
      }], { session });
    } else {
      // ── MINOR FLOW (under 14) ─────────────────────────────────────────
      if (!parentNationalId || !/^\d{11}$/.test(parentNationalId)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'الرقم الوطني للوالد/الوصي مطلوب ويجب أن يكون 11 رقماً',
        });
      }

      // Find parent person
      const parent = await Person.findOne({ nationalId: parentNationalId }).session(session);
      if (!parent) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'لم يتم العثور على الوالد/الوصي بالرقم الوطني المُدخل',
        });
      }

      // Generate child registration number
      const childRegistrationNumber = await Children.generateRegistrationNumber();

      // Create Child document
      [childDoc] = await Children.create([{
        childRegistrationNumber,
        parentNationalId,
        parentPersonId: parent._id,
        firstName, fatherName, lastName, motherName,
        dateOfBirth, gender,
        phoneNumber, governorate, city, district, street, building, address,
        hasReceivedNationalId: false,
        migrationStatus: 'pending',
        isActive: true,
        isDeleted: false,
      }], { session });

      // Create Patient profile linked to Child
      [patientDoc] = await Patient.create([{
        childId: childDoc._id,
        bloodType: bloodType || 'unknown',
        allergies: allergies || [],
        chronicDiseases: chronicDiseases || [],
        totalVisits: 0,
      }], { session });
    }

    // ── Create Account ──────────────────────────────────────────────────
    const accountData = {
      email: email.toLowerCase(),
      password, // Auto-hashed by Account.js pre-validate hook
      roles: ['patient'],
      isActive: true,
      isVerified: false,
      language: 'ar',
      timezone: 'Asia/Damascus',
    };

    if (isAdult) {
      accountData.personId = personDoc._id;
    } else {
      accountData.childId = childDoc._id;
    }

    const [account] = await Account.create([accountData], { session });

    await session.commitTransaction();

    // ── Audit log (outside transaction — safe never-throws) ─────────────
    await AuditLog.record({
      userId: account._id,
      userEmail: account.email,
      userRole: 'patient',
      action: 'SIGNUP_SUCCESS',
      description: isAdult
        ? `New adult patient registered: ${firstName} ${lastName}`
        : `New minor patient registered: ${firstName} ${lastName} (CRN: ${childDoc.childRegistrationNumber})`,
      resourceType: isAdult ? 'persons' : 'children',
      resourceId: isAdult ? personDoc._id : childDoc._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      platform: req.headers['x-platform'] || 'web',
      success: true,
      metadata: {
        accountType: isAdult ? 'adult' : 'minor',
        ageAtSignup: age,
        ...(childDoc && { childRegistrationNumber: childDoc.childRegistrationNumber }),
      },
    });

    // ── Generate JWT and return ─────────────────────────────────────────
    const token = signToken(account._id, account.roles);

    console.log(`✅ Signup successful: ${email} (${isAdult ? 'adult' : 'minor'})`);

    // Build user object matching frontend expectation (same shape as login)
    const profile = personDoc || childDoc || {};
    const safeUser = {
      _id:        account._id,
      email:      account.email,
      roles:      account.roles,
      role:       account.roles?.[0] || null,
      isActive:   account.isActive,
      isVerified: account.isVerified,

      // Flattened profile
      firstName:  profile.firstName  || '',
      fatherName: profile.fatherName || '',
      lastName:   profile.lastName   || '',
      motherName: profile.motherName || '',
      phoneNumber: profile.phoneNumber || '',
      gender:     profile.gender,
      dateOfBirth: profile.dateOfBirth,
      governorate: profile.governorate,
      city:       profile.city,

      nationalId:              profile.nationalId              || null,
      childRegistrationNumber: profile.childRegistrationNumber || null,

      // Nested versions
      person: isAdult ? {
        _id:        personDoc._id,
        firstName:  personDoc.firstName,
        lastName:   personDoc.lastName,
        nationalId: personDoc.nationalId,
      } : null,
      child: !isAdult ? {
        _id:        childDoc._id,
        firstName:  childDoc.firstName,
        lastName:   childDoc.lastName,
        childRegistrationNumber: childDoc.childRegistrationNumber,
      } : null,
    };

    return res.status(201).json({
      success: true,
      message: isAdult
        ? 'تم إنشاء الحساب بنجاح'
        : `تم إنشاء حساب الطفل بنجاح. رقم التسجيل: ${childDoc.childRegistrationNumber}`,
      token,
      user:    safeUser,    // ← Primary key for frontend
      account: safeUser,    // ← Alias for legacy callers
      ...(childDoc && {
        childRegistrationNumber: childDoc.childRegistrationNumber,
      }),
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Signup error:', error);

    // Try to log failure (best-effort)
    await AuditLog.record({
      userEmail: req.body?.email,
      action: 'SIGNUP_FAILED',
      description: `Signup failed: ${error.message}`,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      platform: req.headers['x-platform'] || 'web',
      success: false,
      errorMessage: error.message,
    });

    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إنشاء الحساب',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// ============================================================================
// 2. LOGIN — With comprehensive audit logging
// ============================================================================

/**
 * POST /api/auth/login
 * Public route — authenticates user and returns JWT.
 *
 * Body: { email, password }
 *
 * Audit events emitted:
 *   ✓ LOGIN_FAILED  — email not found, wrong password, inactive, locked
 *   ✓ LOGIN_SUCCESS — successful authentication
 *   ✓ ACCOUNT_LOCKED — after 5th failed attempt (auto by Account model)
 */
exports.login = async (req, res) => {
  const ipAddress = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const platform  = req.headers['x-platform'] || 'web';

  try {
    const { email, password } = req.body;

    // ── Basic validation ────────────────────────────────────────────────
    if (!email || !password) {
      await AuditLog.record({
        userEmail: email || null,
        action: 'LOGIN_FAILED',
        description: 'Login attempt with missing credentials',
        ipAddress, userAgent, platform,
        success: false,
        errorMessage: 'Missing email or password',
      });

      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني وكلمة المرور مطلوبان',
      });
    }

    // ── Find account (with password field) ──────────────────────────────
    const account = await Account.findOne({ email: email.toLowerCase() })
      .select('+password +failedLoginAttempts +accountLockedUntil')
      .populate('personId')
      .populate('childId');

    // ── Account not found ────────────────────────────────────────────────
    if (!account) {
      await AuditLog.record({
        userEmail: email.toLowerCase(),
        action: 'LOGIN_FAILED',
        description: `Login attempt with non-existent email: ${email}`,
        ipAddress, userAgent, platform,
        success: false,
        errorMessage: 'Account not found',
      });

      return res.status(401).json({
        success: false,
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      });
    }

    // ── Account inactive ────────────────────────────────────────────────
    if (!account.isActive) {
      await AuditLog.record({
        userId: account._id,
        userEmail: account.email,
        userRole: account.roles?.[0],
        action: 'LOGIN_FAILED',
        description: 'Login attempt on inactive account',
        ipAddress, userAgent, platform,
        success: false,
        errorMessage: 'Account inactive',
        metadata: { deactivationReason: account.deactivationReason },
      });

      return res.status(403).json({
        success: false,
        message: 'هذا الحساب غير نشط. يرجى التواصل مع الإدارة',
      });
    }

    // ── Account locked ──────────────────────────────────────────────────
    if (typeof account.isLocked === 'function' && account.isLocked()) {
      const lockMinutes = Math.ceil(
        (account.accountLockedUntil - new Date()) / 60000,
      );

      await AuditLog.record({
        userId: account._id,
        userEmail: account.email,
        userRole: account.roles?.[0],
        action: 'LOGIN_FAILED',
        description: `Login attempt on locked account (${lockMinutes} minutes remaining)`,
        ipAddress, userAgent, platform,
        success: false,
        errorMessage: 'Account locked',
        metadata: { lockedUntil: account.accountLockedUntil, minutesRemaining: lockMinutes },
      });

      return res.status(423).json({
        success: false,
        message: `الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة. حاول مرة أخرى بعد ${lockMinutes} دقيقة`,
      });
    }

    // ── Verify password ─────────────────────────────────────────────────
    const isPasswordValid = await bcrypt.compare(password, account.password);

    if (!isPasswordValid) {
      // Record the failed attempt — Account model handles lockout
      if (typeof account.recordFailedLogin === 'function') {
        await account.recordFailedLogin();
      }

      // Check if this attempt triggered a lockout
      const justLocked = account.failedLoginAttempts >= 5;

      await AuditLog.record({
        userId: account._id,
        userEmail: account.email,
        userRole: account.roles?.[0],
        action: 'LOGIN_FAILED',
        description: `Wrong password (attempt ${account.failedLoginAttempts}/5)`,
        ipAddress, userAgent, platform,
        success: false,
        errorMessage: 'Invalid password',
        metadata: { attemptCount: account.failedLoginAttempts },
      });

      // Separate ACCOUNT_LOCKED event when threshold reached
      if (justLocked) {
        await AuditLog.record({
          userId: account._id,
          userEmail: account.email,
          userRole: account.roles?.[0],
          action: 'ACCOUNT_LOCKED',
          description: 'Account auto-locked after 5 consecutive failed login attempts',
          ipAddress, userAgent, platform,
          success: false,
          errorMessage: 'Lockout triggered',
          metadata: { lockedUntil: account.accountLockedUntil },
        });
      }

      return res.status(401).json({
        success: false,
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
        ...(justLocked && {
          locked: true,
          lockMessage: 'تم قفل الحساب لمدة 15 دقيقة بسبب محاولات دخول متعددة',
        }),
      });
    }

    // ── Success — Record successful login ───────────────────────────────
    if (typeof account.recordSuccessfulLogin === 'function') {
      await account.recordSuccessfulLogin(ipAddress);
    }

    await AuditLog.record({
      userId: account._id,
      userEmail: account.email,
      userRole: account.roles?.[0],
      action: 'LOGIN_SUCCESS',
      description: 'User logged in successfully',
      ipAddress, userAgent, platform,
      success: true,
      metadata: {
        roles: account.roles,
        loginTime: new Date(),
      },
    });

    // ── Generate token and return ───────────────────────────────────────
    const token = signToken(account._id, account.roles);

    console.log(`✅ Login successful: ${account.email}`);

    // ── Build user object matching the shape the frontend expects ─────
    // Login.jsx reads response.user.firstName, .lastName, .roles[0]
    // (or .role for legacy support). Personal profile fields are
    // flattened to the top level for easy access; nested person/child
    // sub-objects are preserved for components that want full detail.
    const profile = account.personId || account.childId || {};
    const safeUser = {
      _id:        account._id,
      email:      account.email,
      roles:      account.roles,
      role:       account.roles?.[0] || null,  // Legacy single-role alias
      isActive:   account.isActive,
      isVerified: account.isVerified,
      language:   account.language,

      // ── Flattened profile fields (top-level for frontend convenience)
      firstName:  profile.firstName  || '',
      fatherName: profile.fatherName || '',
      lastName:   profile.lastName   || '',
      motherName: profile.motherName || '',
      phoneNumber: profile.phoneNumber || '',
      gender:     profile.gender,
      dateOfBirth: profile.dateOfBirth,
      governorate: profile.governorate,
      city:       profile.city,

      // ── Identity (one of these is set depending on adult/child)
      nationalId:              profile.nationalId              || null,
      childRegistrationNumber: profile.childRegistrationNumber || null,

      // ── Nested objects for components that need full detail
      person: account.personId ? {
        _id:        account.personId._id,
        firstName:  account.personId.firstName,
        fatherName: account.personId.fatherName,
        lastName:   account.personId.lastName,
        motherName: account.personId.motherName,
        nationalId: account.personId.nationalId,
        phoneNumber: account.personId.phoneNumber,
        gender:     account.personId.gender,
        dateOfBirth: account.personId.dateOfBirth,
        governorate: account.personId.governorate,
        city:       account.personId.city,
      } : null,
      child: account.childId ? {
        _id:        account.childId._id,
        firstName:  account.childId.firstName,
        fatherName: account.childId.fatherName,
        lastName:   account.childId.lastName,
        motherName: account.childId.motherName,
        childRegistrationNumber: account.childId.childRegistrationNumber,
        dateOfBirth: account.childId.dateOfBirth,
        gender:     account.childId.gender,
      } : null,
    };

    return res.status(200).json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user:    safeUser,    // ← Primary key — matches frontend expectation
      account: safeUser,    // ← Alias for any caller still reading .account
    });
  } catch (error) {
    console.error('❌ Login error:', error);

    await AuditLog.record({
      userEmail: req.body?.email,
      action: 'LOGIN_FAILED',
      description: `Login system error: ${error.message}`,
      ipAddress, userAgent, platform,
      success: false,
      errorMessage: error.message,
    });

    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم',
      error: error.message,
    });
  }
};

// ============================================================================
// 3. LOGOUT — NEW (with FCM token cleanup + audit logging)
// ============================================================================

/**
 * POST /api/auth/logout
 * Protected route — invalidates FCM token for this device and logs the event.
 *
 * Body (optional): { fcmToken } — to remove only this device's token.
 *                  If not provided, no tokens are removed (client just discards JWT).
 *
 * This is important because:
 *   1. Removing FCM token prevents push notifications to logged-out devices
 *   2. Audit log records explicit logout for compliance/security investigations
 *   3. Frontend can call this before clearing localStorage
 */
exports.logout = async (req, res) => {
  const ipAddress = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const platform  = req.headers['x-platform'] || 'web';

  try {
    const accountId = req.user?._id || req.account?._id;
    if (!accountId) {
      return res.status(401).json({
        success: false,
        message: 'غير مصرّح',
      });
    }

    const { fcmToken } = req.body || {};

    // ── Remove FCM token if provided ────────────────────────────────────
    let tokensRemoved = 0;
    if (fcmToken) {
      const result = await Account.updateOne(
        { _id: accountId },
        { $pull: { pushNotificationTokens: { token: fcmToken } } },
      );
      tokensRemoved = result.modifiedCount;
    }

    // ── Get account info for audit ──────────────────────────────────────
    const account = await Account.findById(accountId).select('email roles').lean();

    // ── Audit log ───────────────────────────────────────────────────────
    await AuditLog.record({
      userId: accountId,
      userEmail: account?.email,
      userRole: account?.roles?.[0],
      action: 'LOGOUT',
      description: tokensRemoved > 0
        ? 'User logged out and FCM token removed'
        : 'User logged out',
      ipAddress, userAgent, platform,
      success: true,
      metadata: {
        fcmTokensRemoved: tokensRemoved,
        logoutTime: new Date(),
      },
    });

    console.log(`✅ Logout: ${account?.email} (FCM tokens removed: ${tokensRemoved})`);

    return res.status(200).json({
      success: true,
      message: 'تم تسجيل الخروج بنجاح',
      fcmTokensRemoved: tokensRemoved,
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تسجيل الخروج',
      error: error.message,
    });
  }
};

// ============================================================================
// 4. FORGOT PASSWORD — Send OTP via email
// ============================================================================

/**
 * POST /api/auth/forgot-password
 * Public route — sends a 6-digit OTP to the user's email for password reset.
 *
 * Body: { email }
 *
 * Security: Always returns success message (even if email not found) to
 *           prevent email enumeration attacks. Audit log records the actual
 *           outcome for administrators.
 */
exports.forgotPassword = async (req, res) => {
  const ipAddress = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const platform  = req.headers['x-platform'] || 'web';

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مطلوب',
      });
    }

    const account = await Account.findOne({ email: email.toLowerCase() });

    // ── Account not found — silent success (anti-enumeration) ───────────
    if (!account) {
      await AuditLog.record({
        userEmail: email.toLowerCase(),
        action: 'PASSWORD_RESET_REQUESTED',
        description: 'Password reset requested for non-existent email',
        ipAddress, userAgent, platform,
        success: false,
        errorMessage: 'Email not found',
      });

      // Return success message to prevent enumeration
      return res.status(200).json({
        success: true,
        message: 'إذا كان البريد الإلكتروني مسجلاً، سيتم إرسال رمز التحقق',
      });
    }

    // ── Generate OTP ────────────────────────────────────────────────────
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + OTP_VALIDITY_MS);

    account.resetPasswordOTP     = otp;
    account.resetPasswordExpires = otpExpires;
    await account.save({ validateBeforeSave: false });

    // ── Send email ──────────────────────────────────────────────────────
    try {
      await sendEmail({
        email: account.email,
        subject: 'Patient 360° — رمز التحقق لاستعادة كلمة المرور',
        message: createOTPEmailTemplate(otp, account.email),
      });

      await AuditLog.record({
        userId: account._id,
        userEmail: account.email,
        userRole: account.roles?.[0],
        action: 'PASSWORD_RESET_REQUESTED',
        description: 'OTP sent successfully for password reset',
        ipAddress, userAgent, platform,
        success: true,
        metadata: { otpExpiresAt: otpExpires },
      });

      return res.status(200).json({
        success: true,
        message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني',
      });
    } catch (emailError) {
      // Email sending failed — rollback OTP
      account.resetPasswordOTP     = undefined;
      account.resetPasswordExpires = undefined;
      await account.save({ validateBeforeSave: false });

      await AuditLog.record({
        userId: account._id,
        userEmail: account.email,
        userRole: account.roles?.[0],
        action: 'PASSWORD_RESET_REQUESTED',
        description: 'OTP generation succeeded but email send failed',
        ipAddress, userAgent, platform,
        success: false,
        errorMessage: emailError.message,
      });

      console.error('❌ Forgot password email error:', emailError);

      return res.status(500).json({
        success: false,
        message: 'فشل إرسال البريد الإلكتروني. حاول مرة أخرى لاحقاً',
      });
    }
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم',
      error: error.message,
    });
  }
};

// ============================================================================
// 5. VERIFY OTP — Validate 6-digit code
// ============================================================================

/**
 * POST /api/auth/verify-otp
 * Public route — verifies OTP and returns reset token.
 *
 * Body: { email, otp }
 */
exports.verifyOTP = async (req, res) => {
  const ipAddress = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const platform  = req.headers['x-platform'] || 'web';

  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني ورمز التحقق مطلوبان',
      });
    }

    const account = await Account.findOne({
      email: email.toLowerCase(),
      resetPasswordOTP: otp,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!account) {
      await AuditLog.record({
        userEmail: email.toLowerCase(),
        action: 'OTP_FAILED',
        description: 'Invalid or expired OTP entered',
        ipAddress, userAgent, platform,
        success: false,
        errorMessage: 'OTP invalid or expired',
      });

      return res.status(400).json({
        success: false,
        message: 'رمز التحقق غير صحيح أو منتهي الصلاحية',
      });
    }

    // OTP valid — issue short-lived reset token (15 minutes)
    const resetToken = jwt.sign(
      { id: account._id, purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' },
    );

    await AuditLog.record({
      userId: account._id,
      userEmail: account.email,
      userRole: account.roles?.[0],
      action: 'OTP_VERIFIED',
      description: 'OTP verified successfully — reset token issued',
      ipAddress, userAgent, platform,
      success: true,
    });

    return res.status(200).json({
      success: true,
      message: 'تم التحقق من الرمز بنجاح',
      resetToken,
    });
  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم',
      error: error.message,
    });
  }
};

// ============================================================================
// 6. RESET PASSWORD — Complete password reset using reset token
// ============================================================================

/**
 * POST /api/auth/reset-password
 * Public route — sets a new password using the reset token from verify-otp.
 *
 * Body: { resetToken, newPassword }
 */
exports.resetPassword = async (req, res) => {
  const ipAddress = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const platform  = req.headers['x-platform'] || 'web';

  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'رمز إعادة التعيين وكلمة المرور الجديدة مطلوبان',
      });
    }

    // ── Verify reset token ──────────────────────────────────────────────
    let payload;
    try {
      payload = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (jwtError) {
      await AuditLog.record({
        action: 'PASSWORD_CHANGED',
        description: 'Reset token invalid or expired',
        ipAddress, userAgent, platform,
        success: false,
        errorMessage: jwtError.message,
      });

      return res.status(401).json({
        success: false,
        message: 'رمز إعادة التعيين غير صالح أو منتهي الصلاحية',
      });
    }

    if (payload.purpose !== 'password-reset') {
      return res.status(401).json({
        success: false,
        message: 'رمز إعادة التعيين غير صالح',
      });
    }

    // ── Find account and update password ────────────────────────────────
    const account = await Account.findById(payload.id).select('+password');
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'الحساب غير موجود',
      });
    }

    // Set new password (Account model auto-hashes via pre-validate hook)
    account.password = newPassword;
    account.resetPasswordOTP     = undefined;
    account.resetPasswordExpires = undefined;
    account.passwordChangedAt    = new Date();
    account.failedLoginAttempts  = 0;
    account.accountLockedUntil   = undefined;
    await account.save();

    await AuditLog.record({
      userId: account._id,
      userEmail: account.email,
      userRole: account.roles?.[0],
      action: 'PASSWORD_CHANGED',
      description: 'Password successfully reset via OTP flow',
      ipAddress, userAgent, platform,
      success: true,
      metadata: { changedAt: account.passwordChangedAt },
    });

    console.log(`✅ Password reset successful: ${account.email}`);

    return res.status(200).json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول',
    });
  } catch (error) {
    console.error('❌ Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم',
      error: error.message,
    });
  }
};

// ============================================================================
// 7. VERIFY TOKEN — Check if JWT is still valid (used by frontend bootstrap)
// ============================================================================

/**
 * GET /api/auth/verify
 * Protected route — returns current account info if token is valid.
 */
exports.verify = async (req, res) => {
  try {
    const accountId = req.user?._id || req.account?._id;
    if (!accountId) {
      return res.status(401).json({
        success: false,
        message: 'غير مصرّح',
      });
    }

    const account = await Account.findById(accountId)
      .populate('personId')
      .populate('childId')
      .lean();

    if (!account || !account.isActive) {
      return res.status(401).json({
        success: false,
        message: 'الحساب غير نشط',
      });
    }

    // Build user object matching login/signup shape for frontend consistency
    const profile = account.personId || account.childId || {};
    const safeUser = {
      _id:        account._id,
      email:      account.email,
      roles:      account.roles,
      role:       account.roles?.[0] || null,
      isActive:   account.isActive,
      isVerified: account.isVerified,
      language:   account.language,

      // Flattened profile fields
      firstName:  profile.firstName  || '',
      fatherName: profile.fatherName || '',
      lastName:   profile.lastName   || '',
      motherName: profile.motherName || '',
      phoneNumber: profile.phoneNumber || '',
      gender:     profile.gender,
      dateOfBirth: profile.dateOfBirth,
      governorate: profile.governorate,
      city:       profile.city,

      nationalId:              profile.nationalId              || null,
      childRegistrationNumber: profile.childRegistrationNumber || null,

      person: account.personId,
      child:  account.childId,
    };

    return res.status(200).json({
      success: true,
      user:    safeUser,
      account: safeUser, // Alias for legacy
    });
  } catch (error) {
    console.error('❌ Verify error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم',
      error: error.message,
    });
  }
};

// ============================================================================
// 8. UPDATE LAST LOGIN — Used by mobile app heartbeat
// ============================================================================

/**
 * POST /api/auth/update-last-login
 * Protected route — updates lastLogin timestamp + saves FCM token if provided.
 *
 * Body (optional): { fcmToken, platform, deviceName, appVersion }
 */
exports.updateLastLogin = async (req, res) => {
  try {
    const accountId = req.user?._id || req.account?._id;
    if (!accountId) {
      return res.status(401).json({
        success: false,
        message: 'غير مصرّح',
      });
    }

    const { fcmToken, platform, deviceName, appVersion } = req.body || {};
    const ipAddress = getClientIp(req);

    const updateOps = {
      $set: { lastLogin: new Date(), lastLoginIp: ipAddress },
    };

    // If FCM token provided, add it (or update if exists)
    if (fcmToken && platform) {
      const account = await Account.findById(accountId);
      const existing = (account.pushNotificationTokens || []).find(t => t.token === fcmToken);

      if (existing) {
        // Update existing token's lastUsedAt
        await Account.updateOne(
          { _id: accountId, 'pushNotificationTokens.token': fcmToken },
          {
            $set: {
              lastLogin: new Date(),
              lastLoginIp: ipAddress,
              'pushNotificationTokens.$.lastUsedAt': new Date(),
              'pushNotificationTokens.$.isActive': true,
            },
          },
        );
      } else {
        // Add new token (cap at 10 devices per Account model rules)
        await Account.updateOne(
          { _id: accountId },
          {
            $set: { lastLogin: new Date(), lastLoginIp: ipAddress },
            $push: {
              pushNotificationTokens: {
                $each: [{
                  token: fcmToken,
                  platform,
                  deviceName: deviceName || 'unknown',
                  appVersion: appVersion || 'unknown',
                  addedAt: new Date(),
                  lastUsedAt: new Date(),
                  isActive: true,
                }],
                $slice: -10, // Keep only the 10 most recent tokens
              },
            },
          },
        );
      }
    } else {
      await Account.updateOne({ _id: accountId }, updateOps);
    }

    return res.status(200).json({
      success: true,
      message: 'تم تحديث آخر دخول',
    });
  } catch (error) {
    console.error('❌ Update last login error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم',
      error: error.message,
    });
  }
};

// ============================================================================
// 9. PROFESSIONAL REGISTRATION ROUTES (Doctor / Pharmacist / Lab Tech)
//    These create DoctorRequest records for admin approval — they do NOT
//    create accounts until admin approves.
// ============================================================================

/**
 * POST /api/auth/register-doctor
 * Public route — submits a doctor application for admin review.
 */
exports.registerDoctor = async (req, res) => {
  const ipAddress = getClientIp(req);

  try {
    const requiredFields = [
      'firstName', 'fatherName', 'lastName', 'motherName',
      'nationalId', 'email', 'phoneNumber', 'dateOfBirth', 'gender',
      'governorate', 'city', 'address',
      'medicalLicenseNumber', 'specialization', 'yearsOfExperience', 'consultationFee',
    ];

    for (const field of requiredFields) {
      if (!req.body[field] && req.body[field] !== 0) {
        return res.status(400).json({
          success: false,
          message: `الحقل ${field} مطلوب`,
        });
      }
    }

    // Check for duplicate nationalId / email / license
    const existingByNationalId = await DoctorRequest.findOne({
      nationalId: req.body.nationalId,
      status: { $ne: 'rejected' },
    });
    if (existingByNationalId) {
      return res.status(400).json({
        success: false,
        message: 'يوجد طلب سابق بنفس الرقم الوطني',
      });
    }

    const existingByEmail = await DoctorRequest.findOne({
      email: req.body.email.toLowerCase(),
      status: { $ne: 'rejected' },
    });
    if (existingByEmail) {
      return res.status(400).json({
        success: false,
        message: 'يوجد طلب سابق بنفس البريد الإلكتروني',
      });
    }

    const existingByLicense = await DoctorRequest.findOne({
      medicalLicenseNumber: req.body.medicalLicenseNumber,
      status: { $ne: 'rejected' },
    });
    if (existingByLicense) {
      return res.status(400).json({
        success: false,
        message: 'يوجد طلب سابق بنفس رقم الترخيص',
      });
    }

    const request = await DoctorRequest.create({
      ...req.body,
      email: req.body.email.toLowerCase(),
      requestType: 'doctor',
      status: 'pending',
      // Document URLs come from uploadDoctorFiles middleware
      ...(req.files?.licenseDocument && { licenseDocumentUrl: req.files.licenseDocument[0].path }),
      ...(req.files?.degreeDocument && { degreeDocumentUrl: req.files.degreeDocument[0].path }),
      ...(req.files?.nationalIdDocument && { nationalIdDocumentUrl: req.files.nationalIdDocument[0].path }),
    });

    await AuditLog.record({
      userEmail: request.email,
      action: 'DOCTOR_REQUEST_SUBMITTED',
      description: `New doctor application: ${request.firstName} ${request.lastName} (${request.specialization})`,
      resourceType: 'doctor_requests',
      resourceId: request._id,
      ipAddress,
      userAgent: req.headers['user-agent'],
      platform: req.headers['x-platform'] || 'web',
      success: true,
      metadata: {
        specialization: request.specialization,
        yearsOfExperience: request.yearsOfExperience,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'تم استلام الطلب بنجاح. ستتم مراجعته من قبل الإدارة',
      requestId: request._id,
    });
  } catch (error) {
    console.error('❌ Register doctor error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إرسال الطلب',
      error: error.message,
    });
  }
};

/**
 * POST /api/auth/register-pharmacist
 */
exports.registerPharmacist = async (req, res) => {
  const ipAddress = getClientIp(req);

  try {
    const request = await DoctorRequest.create({
      ...req.body,
      email: req.body.email.toLowerCase(),
      requestType: 'pharmacist',
      status: 'pending',
      ...(req.files?.licenseDocument && { licenseDocumentUrl: req.files.licenseDocument[0].path }),
      ...(req.files?.degreeDocument && { degreeDocumentUrl: req.files.degreeDocument[0].path }),
      ...(req.files?.nationalIdDocument && { nationalIdDocumentUrl: req.files.nationalIdDocument[0].path }),
    });

    await AuditLog.record({
      userEmail: request.email,
      action: 'PHARMACIST_REQUEST_SUBMITTED',
      description: `New pharmacist application: ${request.firstName} ${request.lastName}`,
      resourceType: 'doctor_requests',
      resourceId: request._id,
      ipAddress,
      userAgent: req.headers['user-agent'],
      platform: req.headers['x-platform'] || 'web',
      success: true,
    });

    return res.status(201).json({
      success: true,
      message: 'تم استلام الطلب بنجاح',
      requestId: request._id,
    });
  } catch (error) {
    console.error('❌ Register pharmacist error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إرسال الطلب',
      error: error.message,
    });
  }
};

/**
 * POST /api/auth/register-lab-technician
 */
exports.registerLabTechnician = async (req, res) => {
  const ipAddress = getClientIp(req);

  try {
    const request = await DoctorRequest.create({
      ...req.body,
      email: req.body.email.toLowerCase(),
      requestType: 'lab_technician',
      status: 'pending',
      ...(req.files?.licenseDocument && { licenseDocumentUrl: req.files.licenseDocument[0].path }),
      ...(req.files?.degreeDocument && { degreeDocumentUrl: req.files.degreeDocument[0].path }),
      ...(req.files?.nationalIdDocument && { nationalIdDocumentUrl: req.files.nationalIdDocument[0].path }),
    });

    await AuditLog.record({
      userEmail: request.email,
      action: 'LAB_TECH_REQUEST_SUBMITTED',
      description: `New lab technician application: ${request.firstName} ${request.lastName}`,
      resourceType: 'doctor_requests',
      resourceId: request._id,
      ipAddress,
      userAgent: req.headers['user-agent'],
      platform: req.headers['x-platform'] || 'web',
      success: true,
    });

    return res.status(201).json({
      success: true,
      message: 'تم استلام الطلب بنجاح',
      requestId: request._id,
    });
  } catch (error) {
    console.error('❌ Register lab technician error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إرسال الطلب',
      error: error.message,
    });
  }
};

// ============================================================================
// 10. STATUS CHECKS — Used by applicants to track their request
// ============================================================================

/**
 * GET /api/auth/check-doctor-status?email=...
 */
exports.checkDoctorStatus = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مطلوب',
      });
    }

    const request = await DoctorRequest.findOne({
      email: email.toLowerCase(),
      requestType: 'doctor',
    }).sort({ createdAt: -1 }).lean();

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على طلب',
      });
    }

    return res.status(200).json({
      success: true,
      status: request.status,
      rejectionReason: request.rejectionReason,
      rejectionDetails: request.rejectionDetails,
      submittedAt: request.createdAt,
      reviewedAt: request.reviewedAt,
    });
  } catch (error) {
    console.error('❌ Check doctor status error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم',
      error: error.message,
    });
  }
};

/**
 * GET /api/auth/check-professional-status?email=...&type=pharmacist|lab_technician
 */
exports.checkProfessionalStatus = async (req, res) => {
  try {
    const { email, type } = req.query;
    if (!email || !type) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني ونوع الطلب مطلوبان',
      });
    }

    const request = await DoctorRequest.findOne({
      email: email.toLowerCase(),
      requestType: type,
    }).sort({ createdAt: -1 }).lean();

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على طلب',
      });
    }

    return res.status(200).json({
      success: true,
      status: request.status,
      rejectionReason: request.rejectionReason,
      rejectionDetails: request.rejectionDetails,
      submittedAt: request.createdAt,
      reviewedAt: request.reviewedAt,
    });
  } catch (error) {
    console.error('❌ Check professional status error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم',
      error: error.message,
    });
  }
};

// Register endpoint alias (some routes import as 'register')
exports.register = exports.signup;
