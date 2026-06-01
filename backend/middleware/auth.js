/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Authentication & Authorization Middleware — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Two middleware functions:
 *
 *    1. protect(req, res, next)
 *       - Verifies the JWT token from the Authorization header
 *       - Loads the matching Account from the database
 *       - Rejects if account is deactivated, locked, or token invalid
 *       - Attaches req.account and req.user (legacy alias) to the request
 *
 *    2. authorize(...allowedRoles)
 *       - Used after protect() to restrict by role
 *       - Example: router.get('/admin', protect, authorize('admin'), handler)
 *
 *  Conventions kept from existing code:
 *    - Arabic error messages
 *    - { success, message } response shape
 *    - Try/catch in every async function
 *    - Console.log debug markers with emojis
 * ═══════════════════════════════════════════════════════════════════════════
 */

const jwt = require('jsonwebtoken');
const { Account } = require('../models');

// ============================================================================
// PROTECT MIDDLEWARE — verifies JWT and loads the user
// ============================================================================

/**
 * Verify the request's JWT token and attach the matching Account to req.
 * Rejects with 401 if the token is missing, invalid, or expired.
 * Rejects with 403 if the account is deactivated or temporarily locked.
 *
 * On success, the following are attached to req:
 *   - req.account      — full Account document
 *   - req.user         — alias for req.account (kept for backwards compat)
 *
 * @route  Used as middleware on every protected route
 * @access Public middleware (rejects unauthenticated requests)
 */
exports.protect = async (req, res, next) => {
  try {
    // ── 1. EXTRACT TOKEN FROM Authorization HEADER ────────────────────────
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // Format: "Bearer eyJhbGc..."
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      console.log('❌ AUTH: No token provided');
      return res.status(401).json({
        success: false,
        message: 'غير مصرح. يجب تسجيل الدخول أولاً'
      });
    }

    // ── 2. VERIFY TOKEN SIGNATURE & EXPIRY ────────────────────────────────
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      console.log('❌ AUTH: Token verification failed:', jwtError.name);

      // Distinguish expired vs invalid for better UX
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'رمز الوصول غير صالح'
      });
    }

    // ── 3. LOAD ACCOUNT FROM DATABASE ──────────────────────────────────────
    // Note: password is select:false in the schema, so it's NOT loaded here.
    // That's correct — we don't need the password to verify a token.
    const account = await Account.findById(decoded.id);

    if (!account) {
      console.log('❌ AUTH: Account no longer exists for token');
      return res.status(401).json({
        success: false,
        message: 'الحساب غير موجود'
      });
    }

    // ── 4. CHECK ACCOUNT IS ACTIVE ────────────────────────────────────────
    // Deactivated accounts cannot make API calls even with a valid token.
    if (!account.isActive) {
      console.log('❌ AUTH: Account is deactivated:', account.email);
      return res.status(403).json({
        success: false,
        message: 'الحساب غير مفعّل. الرجاء التواصل مع الإدارة'
      });
    }

    // ── 5. CHECK ACCOUNT IS NOT TEMPORARILY LOCKED ────────────────────────
    // accountLockedUntil is set after 5 failed login attempts.
    // The new Account model has an isLocked() instance method we can use.
    if (account.isLocked()) {
      console.log('❌ AUTH: Account is locked until', account.accountLockedUntil);
      const minutesLeft = Math.ceil(
        (account.accountLockedUntil - new Date()) / 60000
      );
      return res.status(403).json({
        success: false,
        message: `الحساب مغلق مؤقتاً. حاول مرة أخرى بعد ${minutesLeft} دقيقة`
      });
    }

    // ── 6. ATTACH TO REQUEST OBJECT ───────────────────────────────────────
    // Both req.account (new convention) and req.user (legacy alias) so
    // existing controllers that use req.user keep working.
    req.account = account;
    req.user = account;

    console.log('✅ AUTH: Authenticated', account.email, 'roles:', account.roles);
    return next();

  } catch (error) {
    console.error('❌ AUTH ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في التحقق من الجلسة'
    });
  }
};

// ============================================================================
// AUTHORIZE MIDDLEWARE — restricts route by role
// ============================================================================

/**
 * Restrict a route to specific roles. Must be used AFTER protect().
 *
 * Usage:
 *   router.get('/doctors', protect, authorize('admin'), handler);
 *   router.post('/visits', protect, authorize('doctor', 'admin'), handler);
 *
 * @param {...string} allowedRoles - one or more role names from:
 *   patient | doctor | admin | pharmacist | lab_technician | dentist
 * @returns Express middleware function
 */
exports.authorize = (...allowedRoles) => {
  return (req, res, next) => {
    // protect() must have run first
    if (!req.account) {
      console.log('❌ AUTHORIZE: req.account missing — protect() not called?');
      return res.status(500).json({
        success: false,
        message: 'خطأ في إعداد الصلاحيات'
      });
    }

    // Account.roles is an array (a user can have multiple roles)
    // Check if any of the user's roles is in the allowed list
    const userRoles = req.account.roles || [];
    const hasPermission = userRoles.some(role => allowedRoles.includes(role));

    if (!hasPermission) {
      console.log(
        '❌ AUTHORIZE: Role denied. User has [%s], needs one of [%s]',
        userRoles.join(', '),
        allowedRoles.join(', ')
      );
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية للوصول لهذا المورد'
      });
    }

    console.log('✅ AUTHORIZE: Role check passed for', req.account.email);
    return next();
  };
};

// ============================================================================
// OPTIONAL AUTH — for routes that work both logged-in and anonymously
// ============================================================================

/**
 * Like protect() but doesn't fail if no token is provided. Used for routes
 * that personalize their response when the user is logged in but still
 * work for anonymous visitors (e.g. public doctor list).
 *
 * On no token: req.account = null, calls next()
 * On valid token: same as protect()
 * On invalid/expired token: req.account = null, calls next() (no error)
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    let token;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      // No token = anonymous request, that's OK
      req.account = null;
      req.user = null;
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const account = await Account.findById(decoded.id);

      // Only attach if account exists, is active, and not locked
      if (account && account.isActive && !account.isLocked()) {
        req.account = account;
        req.user = account;
      } else {
        req.account = null;
        req.user = null;
      }
    } catch (jwtError) {
      // Invalid token — treat as anonymous, don't fail
      req.account = null;
      req.user = null;
    }

    return next();

  } catch (error) {
    console.error('❌ OPTIONAL AUTH ERROR:', error);
    // Even on error, continue as anonymous
    req.account = null;
    req.user = null;
    return next();
  }
};

// ============================================================================
// BACKWARDS-COMPATIBILITY ALIASES
// ============================================================================
//
// Some pre-refactor route files still use the OLD function names. Rather
// than editing every old route file individually, we expose the new
// functions under their old names too. Both work identically.
//
// Old name        →  New name
// ────────────────────────────
// restrictTo()    →  authorize()
//
// Safe to keep these aliases indefinitely. They have zero runtime cost.
// ============================================================================

exports.restrictTo = exports.authorize;