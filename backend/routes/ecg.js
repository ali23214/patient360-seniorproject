/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ECG Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  ECG image upload + AI analysis. Mounted at /api/ecg.
 *
 *  Routes:
 *    POST /api/ecg/analyze         — Cardiologist uploads ECG, gets AI result
 *    GET  /api/ecg/test            — Health check for the Flask AI service
 *    GET  /api/ecg/visit/:visitId  — Fetch saved ECG analysis for a visit
 *
 *  Multer config: organizes uploads via FileUploadManager into:
 *    uploads/ecgs/<year>/<month>/patient_<id>/ecg_<timestamp>_<rand>.<ext>
 *
 *  Critical fixes vs. previous version:
 *    - Function name casing: analyzeEcg → analyzeECG, testEcgService → testECGService
 *      (controller exports use uppercase 'CG' to match medical convention)
 *    - Multer field name: 'ecg_image' → 'image' to match what controller expects
 *      (controller reads req.file from form-data field named 'image')
 *    - Added GET /visit/:visitId route to expose getVisitECG controller method
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

// ── Middleware ──────────────────────────────────────────────────────────────
const { protect, authorize } = require('../middleware/auth');

// ── Utilities ───────────────────────────────────────────────────────────────
const FileUploadManager = require('../utils/fileUpload');

// ── Controller ──────────────────────────────────────────────────────────────
const ecgController = require('../controllers/ecgController');

// ============================================================================
// MULTER CONFIGURATION FOR ECG IMAGE UPLOADS
// ============================================================================

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      // Patient ID is optional in the multipart form; fall back to temp folder
      // if not provided. The controller resolves patient via visitId anyway.
      const patientId = req.body.patientId;

      if (!patientId) {
        const tempDir = path.join('uploads', 'temp');
        await FileUploadManager.ensureDirectory(tempDir);
        return cb(null, tempDir);
      }

      const fileInfo = FileUploadManager.generateFilePath(
        'ecg',
        patientId,
        file.originalname
      );
      await FileUploadManager.ensureDirectory(fileInfo.directory);
      cb(null, fileInfo.directory);
    } catch (error) {
      console.error('Error creating ECG directory:', error);
      cb(error, null);
    }
  },

  filename: (req, file, cb) => {
    try {
      const patientId = req.body.patientId;

      if (!patientId) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        return cb(null, `ecg-temp-${uniqueSuffix}${ext}`);
      }

      const fileInfo = FileUploadManager.generateFilePath(
        'ecg',
        patientId,
        file.originalname
      );
      cb(null, fileInfo.filename);
    } catch (error) {
      console.error('Error generating ECG filename:', error);
      cb(error, null);
    }
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG and PNG are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * @route   POST /api/ecg/analyze
 * @desc    Cardiologist uploads ECG image, AI analyzes, result persisted
 *          to the visit document via Visit.attachECGAnalysis().
 * @access  Private (doctor only — controller verifies isECGSpecialist)
 *
 * Multipart body:
 *   image    — ECG image file (JPG/PNG, max 10 MB)
 *   visitId  — required, the visit to attach the analysis to
 *   patientId? — optional, used for organized file storage
 */
router.post(
  '/analyze',
  protect,
  authorize('doctor', 'admin'),
  upload.single('image'),
  ecgController.analyzeECG
);

/**
 * @route   GET /api/ecg/test
 * @desc    Health check — verify the Flask AI service is reachable
 * @access  Private (any authenticated user, useful for admin troubleshooting)
 */
router.get(
  '/test',
  protect,
  ecgController.testECGService
);

/**
 * @route   GET /api/ecg/visit/:visitId
 * @desc    Fetch the persisted ECG analysis from a specific visit
 * @access  Private (treating doctor, patient owner, admin)
 */
router.get(
  '/visit/:visitId',
  protect,
  authorize('doctor', 'patient', 'admin'),
  ecgController.getVisitECG
);

// ============================================================================
// MULTER ERROR HANDLER (must come AFTER routes that use multer)
// ============================================================================

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'حجم الملف كبير جداً. الحد الأقصى 10MB'
      });
    }
    return res.status(400).json({
      success: false,
      message: 'خطأ في رفع الملف',
      error: error.message
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  next();
});

module.exports = router;