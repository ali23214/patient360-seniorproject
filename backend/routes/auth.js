/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Authentication Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/routes/auth.js
 *  🔧 Version: 2.1 (HOTFIX — correct middleware imports)
 *
 *  Changes from v2.0:
 *    🔥 FIX: uploadDoctorFiles middleware exports an object
 *           {uploadFields, uploadPharmacistFields, uploadLabTechFields,
 *            handleUploadErrors} — not a single function. v2.0 imported it
 *           incorrectly as default, causing TypeError at startup.
 *
 *  Changes from v1.0:
 *    ✓ loginLimiter middleware now applied to /login (was unused before)
 *    ✓ POST /logout endpoint added (was completely missing)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');

const authController   = require('../controllers/authController');
const { protect }      = require('../middleware/auth');
const { loginLimiter } = require('../middleware/security');

// 🔧 v2.1 FIX: Destructure the three specific upload middlewares.
// Each professional type has its own file fields configuration.
const {
  uploadFields,             // for doctor registration
  uploadPharmacistFields,   // for pharmacist registration
  uploadLabTechFields,      // for lab technician registration
  handleUploadErrors,       // error handler — runs after upload middlewares
} = require('../middleware/uploadDoctorFiles');

const router = express.Router();

// ============================================================================
// PUBLIC ROUTES — No authentication required
// ============================================================================

// ── Patient signup (adult or minor) ────────────────────────────────────────
router.post('/signup',   authController.signup);
router.post('/register', authController.register); // Alias for signup

// ── Professional registration (Doctor / Pharmacist / Lab Tech) ─────────────
// Each professional type uses its own multer configuration to handle
// the specific file fields it expects (licenseDocument, degreeDocument, etc).
// handleUploadErrors runs immediately after to convert multer errors into
// proper API responses.
router.post(
  '/register-doctor',
  uploadFields,
  handleUploadErrors,
  authController.registerDoctor,
);

router.post(
  '/register-pharmacist',
  uploadPharmacistFields,
  handleUploadErrors,
  authController.registerPharmacist,
);

router.post(
  '/register-lab-technician',
  uploadLabTechFields,
  handleUploadErrors,
  authController.registerLabTechnician,
);

// ── Application status checks ──────────────────────────────────────────────
router.get('/check-doctor-status',       authController.checkDoctorStatus);
router.get('/check-professional-status', authController.checkProfessionalStatus);

// ── Login — RATE LIMITED to prevent brute-force ────────────────────────────
// loginLimiter: 5 attempts per 15 minutes per IP
router.post('/login', loginLimiter, authController.login);

// ── Password reset flow ────────────────────────────────────────────────────
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-otp',      authController.verifyOTP);
router.post('/reset-password',  authController.resetPassword);

// ============================================================================
// PROTECTED ROUTES — Require valid JWT
// ============================================================================

// ── Token verification (used by frontend bootstrap to check session) ───────
router.get('/verify', protect, authController.verify);

// ── Update last login timestamp + register FCM device token ────────────────
router.post('/update-last-login', protect, authController.updateLastLogin);

// ── Logout — invalidates FCM token + audit logs the event ──────────────────
// NEW in v2.0: was completely missing before
router.post('/logout', protect, authController.logout);

module.exports = router;
