/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Authentication Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/controllers/authController.js
 *  🔧 Version: 2.1 (Transactions removed — Standalone MongoDB compatible)
 *
 *  Responsibilities:
 *    1. Signup (adult + minor with child registration number flow)
 *    2. Login + comprehensive failure tracking
 *    3. Logout (with FCM token cleanup + audit logging)
 *    4. Password reset via OTP email
 *    5. Doctor / Pharmacist / Lab Technician professional registration
 *    6. Token verification and last-login tracking
 *
 *  v2.1 Changes:
 *    - Signup no longer uses MongoDB transactions (Standalone-compatible).
 *    - Manual rollback deletes partial documents on failure → preserves
 *      atomicity behavior even without replica set.
 *
 *  Security Events Audited:
 *    ✓ LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT
 *    ✓ PASSWORD_RESET_REQUESTED, PASSWORD_CHANGED
 *    ✓ ACCOUNT_LOCKED, OTP_VERIFIED, OTP_FAILED
 *    ✓ SIGNUP_SUCCESS, SIGNUP_FAILED
 * ═══════════════════════════════════════════════════════════════════════════
 */

const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const mongoose = require('mongoose');

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a multer-produced filesystem path into a public URL that the
 * Express static middleware serves at /uploads/...
 *
 * Why this exists:
 *   multer's `file.path` can be either:
 *     - relative: "uploads\\doctor-requests\\pending\\req_xxx\\file.png"
 *                 (when multer's destination uses a relative path —
 *                 our `uploadDoctorFiles.js` middleware does this)
 *     - absolute: "C:\\...\\backend\\uploads\\doctor-requests\\file.png"
 *
 *   Storing that in MongoDB and returning it to the frontend doesn't work
 *   because the browser can't load `C:\...` or `uploads\...` as an image
 *   source — it needs an HTTP URL.
 *
 *   The static mount in index.js is:
 *     app.use('/uploads', express.static(UPLOADS_ROOT))
 *   so any file under /backend/uploads/... is served at /uploads/...
 *
 *   This helper:
 *     1. Normalizes Windows backslashes to forward slashes.
 *     2. Finds the "uploads/" segment in the path (without leading slash,
 *        so it matches BOTH relative and absolute paths).
 *     3. Returns a leading-slash URL like "/uploads/doctor-requests/...".
 *
 *   That URL can be loaded by the browser as
 *   http://localhost:5000/uploads/doctor-requests/...
 *
 *   Returns null on bad input so callers can use it inside ternary
 *   spreads safely.
 */
function toPublicUrl(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const normalized = filePath.replace(/\\/g, '/');
  // Search for "uploads/" — handles both relative ("uploads/foo")
  // and absolute ("/abs/path/backend/uploads/foo") paths.
  const idx = normalized.lastIndexOf('uploads/');
  if (idx === -1) return null;
  return '/' + normalized.slice(idx);
}

/**
 * Parse JSON-stringified fields back into objects/arrays inside `req.body`.
 *
 * Why this exists:
 *   multipart/form-data can only carry strings and files — it has no concept
 *   of nested objects or arrays. So the frontend has to JSON.stringify any
 *   nested value before appending it to FormData, e.g.:
 *
 *     formData.append('scheduleTemplate', JSON.stringify(template))
 *     formData.append('availableDays',    JSON.stringify(['Sunday','Monday']))
 *
 *   On the server side, multer parses the multipart body and puts everything
 *   into `req.body` as raw strings. Mongoose then expects `scheduleTemplate`
 *   to be an object (it's a Mongoose subdocument), but receives a string and
 *   throws `ObjectExpectedError`.
 *
 *   This helper walks a list of known JSON-stringified fields and parses
 *   each one back into its real type. It mutates `body` in place so the
 *   caller can keep using the same reference (e.g. `...req.body` spread).
 *
 * Safety:
 *   - Non-string values are left untouched (already an object — e.g. from
 *     a JSON-bodied request, not multipart).
 *   - Invalid JSON is left untouched and Mongoose will produce a clearer
 *     error than a generic "SyntaxError: Unexpected token".
 */
function parseJsonFields(body, fieldNames) {
  if (!body || typeof body !== 'object') return body;
  for (const name of fieldNames) {
    const value = body[name];
    if (typeof value === 'string' && value.trim()) {
      try {
        body[name] = JSON.parse(value);
      } catch (e) {
        // Leave as-is — let downstream validation surface the error.
      }
    }
  }
  return body;
}

// ── Models ──────────────────────────────────────────────────────────────────
const {
  Account,
  Person,
  Children,
  Patient,
  Doctor,
  Dentist,
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

const BCRYPT_SALT_ROUNDS = 12;             // matches Account.js

/**
 * Prepare professional-request credentials for safe storage.
 *
 * SECURITY FIX: previously the four professional register functions spread
 * `...req.body` straight into DoctorRequest.create(), which stored the raw
 * password as plaintext in the `doctor_requests` collection — anyone with DB
 * read access could see every applicant's password.
 *
 * This helper returns the credential fields to persist:
 *   • password      → bcrypt hash (used to create the real Account on approval;
 *                     Account.js detects an existing hash and won't re-hash it,
 *                     so login keeps working — no double-hashing).
 *   • plainPassword → the original plaintext, kept ONLY so the admin approval
 *                     response can echo it back once. This field is select:false
 *                     in the DoctorRequest schema and must never be returned to
 *                     the public status-check endpoint. Ideally dropped entirely
 *                     once the applicant is told to reuse their own password.
 *
 * @param {string} rawPassword
 * @returns {Promise<{ password: string, plainPassword: string }>}
 */
async function prepareRequestCredentials(rawPassword) {
  if (!rawPassword || typeof rawPassword !== 'string') {
    // Let downstream validation surface the "password required" message.
    return { password: rawPassword, plainPassword: rawPassword };
  }
  // If somehow already hashed, don't re-hash.
  const looksHashed = /^\$2[aby]\$\d{2}\$.{53}$/.test(rawPassword);
  const hashed = looksHashed
    ? rawPassword
    : await bcrypt.hash(rawPassword, BCRYPT_SALT_ROUNDS);
  return { password: hashed, plainPassword: rawPassword };
}

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
// 1. SIGNUP — Adult or Minor patient registration (NO TRANSACTIONS)
// ============================================================================

/**
 * POST /api/auth/signup
 * Public route — creates a new patient account.
 *
 * Atomicity strategy:
 *   This function does NOT use MongoDB transactions (which require
 *   replica set). Instead, it tracks every document created and rolls
 *   back manually on failure. This gives the same end-state guarantee:
 *   either a complete account is created, or no traces remain in the DB.
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
  // ── Track created documents for manual rollback on error ────────────────
  // Replaces MongoDB transactions (which require replica set). Manual
  // cleanup of partially-created records preserves atomicity on Standalone.
  let personDoc  = null;
  let childDoc   = null;
  let patientDoc = null;
  let accountDoc = null;

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
      return res.status(400).json({
        success: false,
        message: 'الاسم الكامل مطلوب (الاسم، اسم الأب، اسم العائلة، اسم الأم)',
      });
    }

    if (!dateOfBirth || !gender) {
      return res.status(400).json({
        success: false,
        message: 'تاريخ الميلاد والجنس مطلوبان',
      });
    }

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني وكلمة المرور مطلوبان',
      });
    }

    // ── Check if email already exists ───────────────────────────────────
    const existingAccount = await Account.findOne({ email: email.toLowerCase() });
    if (existingAccount) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مستخدم بالفعل',
      });
    }

    // ── Determine patient type by age ───────────────────────────────────
    const age = calculateAge(dateOfBirth);
    const isAdult = age >= ADULT_AGE_THRESHOLD;

    if (isAdult) {
      // ── ADULT FLOW ────────────────────────────────────────────────────
      if (!nationalId || !/^\d{11}$/.test(nationalId)) {
        return res.status(400).json({
          success: false,
          message: 'الرقم الوطني مطلوب ويجب أن يكون 11 رقماً',
        });
      }

      // Check nationalId uniqueness
      const existingPerson = await Person.findOne({ nationalId });
      if (existingPerson) {
        return res.status(400).json({
          success: false,
          message: 'الرقم الوطني مستخدم بالفعل',
        });
      }

      // Create Person document
      personDoc = await Person.create({
        nationalId,
        firstName, fatherName, lastName, motherName,
        dateOfBirth, gender,
        phoneNumber, email: email.toLowerCase(),
        governorate, city, district, street, building, address,
        isActive: true,
        isDeleted: false,
      });

      // Create Patient profile linked to Person
      patientDoc = await Patient.create({
        personId: personDoc._id,
        bloodType: bloodType || 'unknown',
        allergies: allergies || [],
        chronicDiseases: chronicDiseases || [],
        height, weight,
        totalVisits: 0,
      });
    } else {
      // ── MINOR FLOW (under 14) ─────────────────────────────────────────
      if (!parentNationalId || !/^\d{11}$/.test(parentNationalId)) {
        return res.status(400).json({
          success: false,
          message: 'الرقم الوطني للوالد/الوصي مطلوب ويجب أن يكون 11 رقماً',
        });
      }

      // Find parent person
      const parent = await Person.findOne({ nationalId: parentNationalId });
      if (!parent) {
        return res.status(404).json({
          success: false,
          message: 'لم يتم العثور على الوالد/الوصي بالرقم الوطني المُدخل',
        });
      }

      // ── Generate child registration number ──────────────────────────────
      // v2.3 (Muath's spec) — Format: {parentNationalId}-NN  (2-digit padded)
      // Examples:
      //   01222333444-01  → first child of this parent
      //   01222333444-02  → second child
      //   01222333444-03  → third child
      //
      // The sequence increments per parent — counts existing children under
      // this parentNationalId (including soft-deleted ones so numbers don't
      // get reused after a deletion).
      const existingChildrenCount = await Children.countDocuments({
        parentNationalId,
      });
      const sequenceNumber = String(existingChildrenCount + 1).padStart(2, '0');
      const childRegistrationNumber = `${parentNationalId}-${sequenceNumber}`;
      console.log(`📝 Generated child ID: ${childRegistrationNumber} (child #${existingChildrenCount + 1} for parent ${parentNationalId})`);

      // Create Child document
      childDoc = await Children.create({
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
      });

      // Create Patient profile linked to Child
      patientDoc = await Patient.create({
        childId: childDoc._id,
        bloodType: bloodType || 'unknown',
        allergies: allergies || [],
        chronicDiseases: chronicDiseases || [],
        totalVisits: 0,
      });
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

    accountDoc = await Account.create(accountData);

    // ── Audit log (best-effort, never throws) ─────────────
    try {
      await AuditLog.record({
        userId: accountDoc._id,
        userEmail: accountDoc.email,
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
    } catch (auditErr) {
      console.warn('⚠️  AuditLog (signup success) skipped:', auditErr.message);
    }

    // ── Generate JWT and return ─────────────────────────────────────────
    const token = signToken(accountDoc._id, accountDoc.roles);

    console.log(`✅ Signup successful: ${email} (${isAdult ? 'adult' : 'minor'})`);

    // Build user object matching frontend expectation (same shape as login)
    const profile = personDoc || childDoc || {};
    const safeUser = {
      _id:        accountDoc._id,
      email:      accountDoc.email,
      roles:      accountDoc.roles,
      role:       accountDoc.roles?.[0] || null,
      isActive:   accountDoc.isActive,
      isVerified: accountDoc.isVerified,

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
    console.error('❌ Signup error:', error);

    // ── MANUAL ROLLBACK ────────────────────────────────────────────────
    // Delete any documents that were created before the failure point.
    // Order matters: delete in reverse-creation order so the cleanup runs
    // children before their parents.
    try {
      if (accountDoc) await Account.findByIdAndDelete(accountDoc._id);
      if (patientDoc) await Patient.findByIdAndDelete(patientDoc._id);
      if (childDoc)   await Children.findByIdAndDelete(childDoc._id);
      if (personDoc)  await Person.findByIdAndDelete(personDoc._id);
      if (accountDoc || patientDoc || childDoc || personDoc) {
        console.log('🧹 Rollback complete — partial documents removed');
      }
    } catch (rollbackErr) {
      console.error('⚠️  Rollback failed:', rollbackErr.message);
    }

    // Try to log failure (best-effort)
    try {
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
    } catch (auditErr) {
      // Swallow — audit log shouldn't break the response
    }

    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إنشاء الحساب',
      error: error.message,
    });
  }
  // ── No finally block needed — no session to close ──
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

    // ── Fetch role-specific professional data ───────────────────────────
    // For doctors/pharmacists/lab technicians we lookup their professional
    // records (specialization, license, pharmacy/lab affiliation, etc.)
    // and embed them as `roleData` so the frontend dashboards can render
    // role-specific UI without an additional API round-trip.
    //
    // This is critical for DoctorDashboard.jsx which uses
    // `user.roleData.doctor.specialization` to conditionally render the
    // ECG AI tool (cardiologists) and X-Ray fracture AI tool (orthopedists).
    const roleData = {};
    if (account.personId && account.personId._id) {
      const personId = account.personId._id;

      if (account.roles.includes('doctor')) {
        const doctorRecord = await Doctor.findOne({ personId }).lean();
        if (doctorRecord) roleData.doctor = doctorRecord;
      }

      if (account.roles.includes('dentist')) {
        const dentistRecord = await Dentist.findOne({ personId }).lean();
        if (dentistRecord) roleData.dentist = dentistRecord;
      }

      if (account.roles.includes('pharmacist')) {
        const pharmacistRecord = await Pharmacist.findOne({ personId }).lean();
        if (pharmacistRecord) roleData.pharmacist = pharmacistRecord;
      }

      if (account.roles.includes('lab_technician')) {
        const labTechRecord = await LabTechnician.findOne({ personId }).lean();
        if (labTechRecord) roleData.labTechnician = labTechRecord;
      }
    }

    const profile = account.personId || account.childId || {};
    const safeUser = {
      _id:        account._id,
      email:      account.email,
      roles:      account.roles,
      role:       account.roles?.[0] || null,
      isActive:   account.isActive,
      isVerified: account.isVerified,
      language:   account.language,

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

      // Role-specific professional data — populated for doctors,
      // pharmacists, and lab technicians. Empty object for patients/admins.
      roleData,
    };

    return res.status(200).json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user:    safeUser,
      account: safeUser,
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
// 3. LOGOUT — With FCM token cleanup + audit logging
// ============================================================================

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

    let tokensRemoved = 0;
    if (fcmToken) {
      const result = await Account.updateOne(
        { _id: accountId },
        { $pull: { pushNotificationTokens: { token: fcmToken } } },
      );
      tokensRemoved = result.modifiedCount;
    }

    const account = await Account.findById(accountId).select('email roles').lean();

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

    if (!account) {
      await AuditLog.record({
        userEmail: email.toLowerCase(),
        action: 'PASSWORD_RESET_REQUESTED',
        description: 'Password reset requested for non-existent email',
        ipAddress, userAgent, platform,
        success: false,
        errorMessage: 'Email not found',
      });

      return res.status(200).json({
        success: true,
        message: 'إذا كان البريد الإلكتروني مسجلاً، سيتم إرسال رمز التحقق',
      });
    }

    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + OTP_VALIDITY_MS);

    account.resetPasswordOTP     = otp;
    account.resetPasswordExpires = otpExpires;
    await account.save({ validateBeforeSave: false });

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

    const account = await Account.findById(payload.id).select('+password');
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'الحساب غير موجود',
      });
    }

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
// 6b. CHANGE PASSWORD — Logged-in user changes their own password
// ============================================================================
//
// Requires authentication (protect middleware). The user supplies their
// CURRENT password plus the new one. We verify the current password before
// changing, so a stolen/forgotten session can't silently reset it.

exports.changePassword = async (req, res) => {
  const ipAddress = getClientIp(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const platform  = req.headers['x-platform'] || 'web';

  try {
    const accountId = req.user?._id || req.account?._id;
    if (!accountId) {
      return res.status(401).json({ success: false, message: 'غير مصرّح' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور الحالية والجديدة مطلوبتان',
      });
    }

    // Enforce a minimum strength for the new password.
    const strongEnough = newPassword.length >= 8
      && /[a-z]/.test(newPassword)
      && /[A-Z]/.test(newPassword)
      && /\d/.test(newPassword);
    if (!strongEnough) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف كبير وصغير ورقم',
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية',
      });
    }

    const account = await Account.findById(accountId).select('+password');
    if (!account) {
      return res.status(404).json({ success: false, message: 'الحساب غير موجود' });
    }

    // Verify the current password.
    const isMatch = await account.comparePassword(currentPassword);
    if (!isMatch) {
      await AuditLog.record({
        userId: account._id,
        userEmail: account.email,
        userRole: account.roles?.[0],
        action: 'PASSWORD_CHANGED',
        description: 'Change-password failed: current password incorrect',
        ipAddress, userAgent, platform,
        success: false,
      });
      return res.status(401).json({
        success: false,
        message: 'كلمة المرور الحالية غير صحيحة',
      });
    }

    // Assign plaintext; Account.js pre-validate hook hashes it.
    account.password          = newPassword;
    account.passwordChangedAt = new Date();
    await account.save();

    await AuditLog.record({
      userId: account._id,
      userEmail: account.email,
      userRole: account.roles?.[0],
      action: 'PASSWORD_CHANGED',
      description: 'Password changed by the account owner',
      ipAddress, userAgent, platform,
      success: true,
      metadata: { changedAt: account.passwordChangedAt },
    });

    return res.status(200).json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح',
    });
  } catch (error) {
    console.error('❌ Change password error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم',
      error: error.message,
    });
  }
};

// ============================================================================
// 7. VERIFY TOKEN
// ============================================================================

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

    const profile = account.personId || account.childId || {};
    const safeUser = {
      _id:        account._id,
      email:      account.email,
      roles:      account.roles,
      role:       account.roles?.[0] || null,
      isActive:   account.isActive,
      isVerified: account.isVerified,
      language:   account.language,

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
      account: safeUser,
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
// 8. UPDATE LAST LOGIN
// ============================================================================

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

    if (fcmToken && platform) {
      const account = await Account.findById(accountId);
      const existing = (account.pushNotificationTokens || []).find(t => t.token === fcmToken);

      if (existing) {
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
                $slice: -10,
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
// 9. PROFESSIONAL REGISTRATION ROUTES
// ============================================================================

exports.registerDoctor = async (req, res) => {
  const ipAddress = getClientIp(req);

  try {
    // multipart/form-data sends nested values as JSON strings — convert them
    // back to real objects/arrays so Mongoose can validate them properly.
    parseJsonFields(req.body, ['scheduleTemplate', 'availableDays']);

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

    // SECURITY: hash the password before persisting; keep plaintext separately
    // (select:false) only for the one-time admin approval echo.
    const docCreds = await prepareRequestCredentials(req.body.password);
    const request = await DoctorRequest.create({
      ...req.body,
      email: req.body.email.toLowerCase(),
      password: docCreds.password,
      plainPassword: docCreds.plainPassword,
      requestType: 'doctor',
      status: 'pending',
      ...(req.files?.licenseDocument && { licenseDocumentUrl: toPublicUrl(req.files.licenseDocument[0].path) }),
      ...(req.files?.degreeDocument && { degreeDocumentUrl: toPublicUrl(req.files.degreeDocument[0].path) }),
      ...(req.files?.nationalIdDocument && { nationalIdDocumentUrl: toPublicUrl(req.files.nationalIdDocument[0].path) }),
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

exports.registerPharmacist = async (req, res) => {
  const ipAddress = getClientIp(req);

  try {
    // multipart/form-data sends nested values as JSON strings — convert them
    // back to real objects so Mongoose can validate them properly.
    parseJsonFields(req.body, ['newPharmacyData']);

    // SECURITY: hash password before persisting (see prepareRequestCredentials).
    const pharmCreds = await prepareRequestCredentials(req.body.password);
    const request = await DoctorRequest.create({
      ...req.body,
      email: req.body.email.toLowerCase(),
      password: pharmCreds.password,
      plainPassword: pharmCreds.plainPassword,
      requestType: 'pharmacist',
      status: 'pending',
      ...(req.files?.licenseDocument && { licenseDocumentUrl: toPublicUrl(req.files.licenseDocument[0].path) }),
      ...(req.files?.degreeDocument && { degreeDocumentUrl: toPublicUrl(req.files.degreeDocument[0].path) }),
      ...(req.files?.nationalIdDocument && { nationalIdDocumentUrl: toPublicUrl(req.files.nationalIdDocument[0].path) }),
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

exports.registerLabTechnician = async (req, res) => {
  const ipAddress = getClientIp(req);

  try {
    // multipart/form-data sends nested values as JSON strings — convert them
    // back to real objects so Mongoose can validate them properly.
    parseJsonFields(req.body, ['newLaboratoryData']);

    // SECURITY: hash password before persisting (see prepareRequestCredentials).
    const labCreds = await prepareRequestCredentials(req.body.password);
    const request = await DoctorRequest.create({
      ...req.body,
      email: req.body.email.toLowerCase(),
      password: labCreds.password,
      plainPassword: labCreds.plainPassword,
      requestType: 'lab_technician',
      status: 'pending',
      ...(req.files?.licenseDocument && { licenseDocumentUrl: toPublicUrl(req.files.licenseDocument[0].path) }),
      ...(req.files?.degreeDocument && { degreeDocumentUrl: toPublicUrl(req.files.degreeDocument[0].path) }),
      ...(req.files?.nationalIdDocument && { nationalIdDocumentUrl: toPublicUrl(req.files.nationalIdDocument[0].path) }),
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

// ──────────────────────────────────────────────────────────────────────────
// REGISTER DENTIST — POST /api/auth/register-dentist
// ──────────────────────────────────────────────────────────────────────────
// Persists a dental-professional registration request into `doctor_requests`
// with requestType='dentist'. On admin approval, adminController creates:
//   (1) persons document
//   (2) accounts document with role='dentist'
//   (3) dentists document (in the separate `dentists` collection) with
//       dentalLicenseNumber + specialization (from one of 9 dental enums)
//
// Required fields:
//   firstName, fatherName, lastName, motherName, nationalId, email,
//   phoneNumber, dateOfBirth, gender, governorate, city, address, password,
//   dentalLicenseNumber, specialization (one of DENTIST_SPECIALIZATIONS),
//   yearsOfExperience, consultationFee
exports.registerDentist = async (req, res) => {
  const ipAddress = getClientIp(req);

  try {
    // multipart/form-data sends nested values as JSON strings — convert them
    // back to real objects/arrays so Mongoose can validate them properly.
    parseJsonFields(req.body, ['scheduleTemplate', 'availableDays']);

    const requiredFields = [
      'firstName', 'fatherName', 'lastName', 'motherName',
      'nationalId', 'email', 'phoneNumber', 'dateOfBirth', 'gender',
      'governorate', 'city', 'address',
      'dentalLicenseNumber', 'specialization', 'yearsOfExperience',
      'hospitalAffiliation', 'consultationFee',
    ];

    for (const field of requiredFields) {
      if (!req.body[field] && req.body[field] !== 0) {
        return res.status(400).json({
          success: false,
          message: `الحقل ${field} مطلوب`,
        });
      }
    }

    // Uniqueness checks — exclude rejected requests so applicants can re-apply
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
      dentalLicenseNumber: req.body.dentalLicenseNumber,
      status: { $ne: 'rejected' },
    });
    if (existingByLicense) {
      return res.status(400).json({
        success: false,
        message: 'يوجد طلب سابق بنفس رقم ترخيص طب الأسنان',
      });
    }

    // ── Parse JSON-encoded fields from multipart/form-data ──────────────
    // The frontend serialises arrays/objects as JSON strings because
    // multipart can't carry nested structures natively.
    let availableDays = [];
    if (req.body.availableDays) {
      try {
        const parsed = JSON.parse(req.body.availableDays);
        if (Array.isArray(parsed)) availableDays = parsed;
      } catch (_) { /* swallow — fall back to empty */ }
    }

    let scheduleTemplate = null;
    if (req.body.scheduleTemplate) {
      try {
        scheduleTemplate = JSON.parse(req.body.scheduleTemplate);
      } catch (_) { /* swallow — schedule remains null */ }
    }

    // ── Build the request payload (whitelisted to avoid storing junk) ────
    // SECURITY: hash password before persisting (see prepareRequestCredentials).
    const dentistCreds = await prepareRequestCredentials(req.body.password);

    const payload = {
      // Personal
      firstName:   req.body.firstName,
      fatherName:  req.body.fatherName,
      lastName:    req.body.lastName,
      motherName:  req.body.motherName,
      nationalId:  req.body.nationalId,
      email:       req.body.email.toLowerCase(),
      phoneNumber: req.body.phoneNumber,
      dateOfBirth: req.body.dateOfBirth,
      gender:      req.body.gender,
      governorate: req.body.governorate,
      city:        req.body.city,
      address:     req.body.address,
      password:    dentistCreds.password,
      plainPassword: dentistCreds.plainPassword,

      // Professional (dental-specific)
      dentalLicenseNumber: req.body.dentalLicenseNumber,
      specialization:      req.body.specialization,
      subSpecialization:   req.body.subSpecialization || '',
      yearsOfExperience:   parseInt(req.body.yearsOfExperience, 10) || 0,
      hospitalAffiliation: req.body.hospitalAffiliation,
      consultationFee:     parseFloat(req.body.consultationFee) || 0,
      currency:            req.body.currency || 'SYP',
      availableDays,
      ...(scheduleTemplate && { scheduleTemplate }),
      ...(req.body.additionalNotes && { additionalNotes: req.body.additionalNotes }),

      // Type discriminator + status
      requestType: 'dentist',
      status:      'pending',

      // Files (multer stores them under req.files keyed by fieldname)
      ...(req.files?.licenseDocument    && { licenseDocumentUrl: toPublicUrl(req.files.licenseDocument[0].path) }),
      ...(req.files?.medicalCertificate && { degreeDocumentUrl: toPublicUrl(req.files.medicalCertificate[0].path) }),
      ...(req.files?.profilePhoto       && { profilePhotoUrl: toPublicUrl(req.files.profilePhoto[0].path) }),
    };

    const request = await DoctorRequest.create(payload);

    await AuditLog.record({
      userEmail: request.email,
      action: 'DENTIST_REQUEST_SUBMITTED',
      description: `New dentist application: ${request.firstName} ${request.lastName} (${request.specialization})`,
      resourceType: 'doctor_requests',
      resourceId: request._id,
      ipAddress,
      userAgent: req.headers['user-agent'],
      platform: req.headers['x-platform'] || 'web',
      success: true,
      metadata: {
        specialization: request.specialization,
        yearsOfExperience: request.yearsOfExperience,
        consultationFee: request.consultationFee,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'تم استلام الطلب بنجاح. ستتم مراجعته من قبل الإدارة',
      requestId: request._id,
    });
  } catch (error) {
    console.error('❌ Register dentist error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إرسال الطلب',
      error: error.message,
    });
  }
};

// ============================================================================
// 10. STATUS CHECKS
// ============================================================================

exports.checkDoctorStatus = async (req, res) => {
  try {
    // POST body (not query) — keeps email out of access logs.
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مطلوب',
      });
    }

    const request = await DoctorRequest.findOne({
      email,
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
      requestType: request.requestType || 'doctor',
      name: [request.firstName, request.lastName].filter(Boolean).join(' '),
      email: request.email,
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

exports.checkProfessionalStatus = async (req, res) => {
  try {
    // POST body (not query). `type` is OPTIONAL: if the caller doesn't know
    // the request type, we look up the most recent professional request of
    // ANY professional type for that email.
    const email = (req.body?.email || '').trim().toLowerCase();
    const type = (req.body?.type || '').trim();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مطلوب',
      });
    }

    const PROFESSIONAL_TYPES = ['doctor', 'pharmacist', 'lab_technician', 'dentist'];

    // If a valid type was supplied, filter by it; otherwise search across all
    // professional request types.
    const query = { email };
    if (type && PROFESSIONAL_TYPES.includes(type)) {
      query.requestType = type;
    } else {
      query.requestType = { $in: PROFESSIONAL_TYPES };
    }

    const request = await DoctorRequest.findOne(query)
      .sort({ createdAt: -1 })
      .lean();

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على طلب',
      });
    }

    return res.status(200).json({
      success: true,
      status: request.status,
      requestType: request.requestType,
      name: [request.firstName, request.lastName].filter(Boolean).join(' '),
      email: request.email,
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