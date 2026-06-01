/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Dental Caries Detection — Express Router
 * Patient 360° — Syrian National Medical Platform
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Mounted at `/api/dental-caries` from `backend/index.js`.
 *
 * Security:
 *   • All routes require a valid JWT (protect middleware).
 *   • All analysis / read routes require role 'dentist' OR 'doctor'.
 *   • The /health route additionally accepts 'admin'.
 *
 * Upload handling:
 *   • multer.diskStorage — saves to backend/uploads/dental-caries/
 *   • Field name        — "tooth_image"  (matches the frontend FormData key)
 *   • Max size          — 15 MB
 *   • Allowed MIME      — image/jpeg, image/png
 *
 * Endpoints:
 *   POST   /analyze                — single-image dental caries analysis
 *   GET    /history/me             — current user's last N analyses
 *   GET    /patient/:identifier    — analyses for a specific patient
 *   GET    /health                 — upstream FastAPI health probe
 *   GET    /:id                    — a single analysis by ID  (declared last)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const dentalCariesController = require('../../controllers/dentalCaries/dentalCariesController');

// Use the project's existing auth middleware. Same import pattern as
// routes/auth.js, routes/xray.js, and the other AI route files.
const { protect } = require('../../middleware/auth');

/**
 * Inline role guard — accepts a list of allowed roles. The project doesn't
 * ship a standalone `requireRoles` middleware (it does role checks inside
 * controllers), so we keep the same convention by doing it here locally.
 *
 * Runs AFTER `protect`, so req.user is guaranteed to exist.
 */
const requireRoles = (allowedRoles) => (req, res, next) => {
  const userRoles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  const isAllowed = userRoles.some((r) => allowedRoles.includes(r));
  if (!isAllowed) {
    return res.status(403).json({
      success: false,
      message: 'ليس لديك صلاحية للوصول لهذه الميزة',
    });
  }
  return next();
};

const router = express.Router();

/* ═══════════════════════════════════════════════════════════════════════════
   FILE UPLOAD CONFIGURATION
   ═══════════════════════════════════════════════════════════════════════════ */

const UPLOAD_DIR     = path.join(__dirname, '..', '..', 'uploads', 'dental-caries');
const MAX_FILE_BYTES = 15 * 1024 * 1024;                          // 15 MB
const ALLOWED_MIME   = new Set(['image/jpeg', 'image/jpg', 'image/png']);

// Ensure target directory exists before multer first writes to it.
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ts        = Date.now();
    const safeBase  = path
      .basename(file.originalname || 'tooth.png')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(-50);                                                // bound length
    cb(null, `dental-${ts}-${safeBase}`);
  },
});

const fileFilter = (req, file, cb) => {
  const mime = (file.mimetype || '').toLowerCase();
  if (ALLOWED_MIME.has(mime)) {
    cb(null, true);
  } else {
    const err = new Error('نوع الملف غير مدعوم. الأنواع المسموحة: JPG, PNG');
    err.status = 400;
    cb(err);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_BYTES },
});

/* ═══════════════════════════════════════════════════════════════════════════
   ROUTES
   ═══════════════════════════════════════════════════════════════════════════ */

// All routes require authentication
router.use(protect);

/*
 * POST /api/dental-caries/analyze
 * ─────────────────────────────────────────────────────────────────────────
 * Body (multipart/form-data):
 *   tooth_image      — required, image/jpeg | image/png, ≤ 15 MB
 *   patientPersonId  — optional, ObjectId   (adult patient context)
 *   patientChildId   — optional, ObjectId   (child patient context)
 *   visitId          — optional, ObjectId   (link to a visit record)
 *   notes            — optional, string ≤ 1000
 */
router.post(
  '/analyze',
  requireRoles(['dentist', 'doctor']),
  upload.single('tooth_image'),
  dentalCariesController.analyze
);

/*
 * GET /api/dental-caries/history/me
 * ─────────────────────────────────────────────────────────────────────────
 * Query: limit (default 20, max 100)
 */
router.get(
  '/history/me',
  requireRoles(['dentist', 'doctor']),
  dentalCariesController.getMyHistory
);

/*
 * GET /api/dental-caries/patient/:identifier
 * ─────────────────────────────────────────────────────────────────────────
 * :identifier — either an 11-digit national ID, or a CRN like CRN-YYYYMMDD-XXXXX
 * Query: limit (default 50, max 200)
 */
router.get(
  '/patient/:identifier',
  requireRoles(['dentist', 'doctor']),
  dentalCariesController.getByPatient
);

/*
 * GET /api/dental-caries/health
 * ─────────────────────────────────────────────────────────────────────────
 * Probes the upstream FastAPI service. Declared BEFORE the `/:id` route
 * so it isn't swallowed by the wildcard.
 */
router.get(
  '/health',
  requireRoles(['dentist', 'doctor', 'admin']),
  dentalCariesController.health
);

/*
 * GET /api/dental-caries/:id
 * ─────────────────────────────────────────────────────────────────────────
 * MUST be declared last among GETs at this base to avoid shadowing.
 */
router.get(
  '/:id',
  requireRoles(['dentist', 'doctor']),
  dentalCariesController.getById
);

/* ═══════════════════════════════════════════════════════════════════════════
   ROUTER-LOCAL ERROR HANDLER
   Catches multer + fileFilter errors before they reach the global handler.
   ═══════════════════════════════════════════════════════════════════════════ */

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: `حجم الملف يتجاوز الحد الأقصى المسموح (${MAX_FILE_BYTES / (1024 * 1024)} MB)`,
      });
    }
    return res.status(400).json({
      success: false,
      message: `خطأ في رفع الملف: ${err.message}`,
    });
  }
  if (err) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'خطأ في الخادم',
    });
  }
  return next();
});

module.exports = router;
