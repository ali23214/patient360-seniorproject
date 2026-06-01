/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Emergency Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at /api/emergency
 *
 *  Multipart upload accepts: image (required field name 'image') and
 *  audio (field name 'audio'). Both saved to /uploads/emergency/.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const emergencyController = require('../controllers/emergencyController');
const { protect, authorize } = require('../middleware/auth');

// ============================================================================
// MULTER CONFIG
// ============================================================================

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'emergency');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('📁 Created emergency upload directory:', UPLOAD_DIR);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = `emergency_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, safeName);
  }
});

const fileFilter = (req, file, cb) => {
  // Validate by file extension (more reliable than MIME type — different
  // Android / iOS / web clients report different MIMEs for the same format).
  // We still log the MIME for debugging.
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (file.fieldname === 'image') {
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
    if (allowedExts.includes(ext)) return cb(null, true);
    console.warn(`⚠️  Rejected image: ext=${ext}, mime=${file.mimetype}, name=${file.originalname}`);
    return cb(new Error('الصور المسموحة: JPG, PNG, WebP'), false);
  }

  if (file.fieldname === 'audio') {
    // Mobile recording libs report inconsistent MIMEs — Flutter `record`
    // on Android emits audio/wave or audio/x-wav for WAV, iOS reports
    // audio/x-m4a, and some clients fall back to application/octet-stream.
    // Extension-based validation avoids all of that.
    const allowedExts = ['.wav', '.mp3', '.mp4', '.m4a', '.webm', '.ogg', '.aac'];
    if (allowedExts.includes(ext)) return cb(null, true);
    console.warn(`⚠️  Rejected audio: ext=${ext}, mime=${file.mimetype}, name=${file.originalname}`);
    return cb(new Error('صيغة التسجيل الصوتي غير مدعومة'), false);
  }

  cb(new Error('حقل ملف غير معروف'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 } // 15 MB per file
});

// Accept up to 1 image + 1 audio in a single request
const emergencyUpload = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'audio', maxCount: 1 }
]);

// ============================================================================
// ROUTES
// ============================================================================

// Patient submits emergency
router.post('/',
  protect,
  authorize('patient'),
  emergencyUpload,
  emergencyController.submitEmergencyReport
);

// Patient lists their own reports
router.get('/mine',
  protect,
  authorize('patient'),
  emergencyController.getMyEmergencyReports
);

// Dispatcher views (PUT BEFORE /:id)
router.get('/active',
  protect,
  authorize('admin'),
  emergencyController.getActiveEmergencies
);

router.get('/nearby',
  protect,
  authorize('admin'),
  emergencyController.getNearbyEmergencies
);

// Actions on a single report
router.post('/:id/call-ambulance',
  protect,
  authorize('patient', 'admin'),
  emergencyController.callAmbulance
);

router.post('/:id/resolve',
  protect,
  authorize('patient', 'admin'),
  emergencyController.resolveEmergencyReport
);

// Single report detail (last to avoid catching /active or /nearby)
router.get('/:id',
  protect,
  authorize('patient', 'admin'),
  emergencyController.getEmergencyReportById
);

module.exports = router;