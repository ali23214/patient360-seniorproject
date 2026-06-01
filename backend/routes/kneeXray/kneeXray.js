/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Knee X-Ray Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path:    backend/routes/kneeXray/kneeXray.js
 *  📌 Mount:   /api/knee-xray
 *
 *  Endpoints:
 *    POST   /api/knee-xray/analyze              (doctor)  — upload + analyze
 *    GET    /api/knee-xray/history/me           (doctor)  — calling doctor's history
 *    GET    /api/knee-xray/patient/:identifier  (doctor)  — patient-specific history
 *    GET    /api/knee-xray/:id                  (doctor)  — single analysis
 *    GET    /api/knee-xray/health               (doctor/admin) — FastAPI probe
 *
 *  Multer config:
 *    - Disk storage at backend/uploads/knee-xray/
 *    - Field name:  `knee_image`   (matches frontend FormData key)
 *    - Allowed:     image/jpeg, image/jpg, image/png
 *    - Max size:    15 MB (matches FastAPI service limit)
 *    - Files kept:  yes — they ARE the analysis image, served at /uploads/...
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const { protect, authorize } = require('../../middleware/auth');
const kneeXrayController     = require('../../controllers/kneeXray/kneeXrayController');

// ════════════════════════════════════════════════════════════════════════════
// MULTER — disk storage in backend/uploads/knee-xray/
// ════════════════════════════════════════════════════════════════════════════

const UPLOAD_DIR    = path.join(__dirname, '..', '..', 'uploads', 'knee-xray');
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('📁 Created knee-xray upload directory:', UPLOAD_DIR);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safe = `knee_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, safe);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  return cb(new Error('الصور المسموحة فقط: JPG وPNG'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

const kneeImageUpload = upload.single('knee_image');

// ════════════════════════════════════════════════════════════════════════════
// MULTER ERROR HANDLER — translate errors to clean Arabic JSON
// ════════════════════════════════════════════════════════════════════════════

function multerErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: `حجم الصورة كبير جداً. الحد الأقصى ${MAX_FILE_SIZE / 1024 / 1024} ميجابايت.`,
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    // fileFilter rejection (Arabic message preserved)
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTE DEFINITIONS
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/knee-xray/analyze
 *   Multipart upload (field: knee_image) — analyze + persist.
 */
router.post(
  '/analyze',
  protect,
  authorize('doctor'),
  (req, res, next) => kneeImageUpload(req, res, (err) => multerErrorHandler(err, req, res, next)),
  kneeXrayController.analyze
);

/**
 * GET /api/knee-xray/history/me
 *   Returns the calling doctor's last N analyses (default 20, max 100).
 */
router.get(
  '/history/me',
  protect,
  authorize('doctor'),
  kneeXrayController.myHistory
);

/**
 * GET /api/knee-xray/patient/:identifier
 *   Returns all analyses for a specific patient.
 *   `identifier` = nationalId (11 digits) OR childRegistrationNumber.
 */
router.get(
  '/patient/:identifier',
  protect,
  authorize('doctor'),
  kneeXrayController.getPatientHistory
);

/**
 * GET /api/knee-xray/health
 *   Verifies the upstream FastAPI service is reachable.
 *   Doctors + admins can probe. Used by frontend health badges.
 */
router.get(
  '/health',
  protect,
  authorize('doctor', 'admin'),
  kneeXrayController.healthCheck
);

/**
 * GET /api/knee-xray/:id
 *   Returns a single analysis by Mongo _id.
 *   ⚠️  Must be LAST — otherwise `/health`, `/history/me`, etc. match here first.
 */
router.get(
  '/:id',
  protect,
  authorize('doctor'),
  kneeXrayController.getOne
);

module.exports = router;
