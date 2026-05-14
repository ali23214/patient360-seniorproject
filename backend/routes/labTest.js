/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Lab Test Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at /api/lab-tests
 *
 *  PDF upload route uses multer with disk storage. Files saved to
 *  /uploads/lab-results/ — make sure that directory exists (server.js
 *  static serving already covers /uploads/*).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const labTestController = require('../controllers/labTestController');
const { protect, authorize } = require('../middleware/auth');

// ============================================================================
// MULTER CONFIG FOR PDF UPLOADS
// ============================================================================

// Ensure upload directory exists at startup (multer doesn't auto-create)
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'lab-results');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('📁 Created lab-results upload directory:', UPLOAD_DIR);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // labtest_<id>_<timestamp>.pdf — easy to identify by filename
    const ext = path.extname(file.originalname);
    const safeName = `labtest_${req.params.id}_${Date.now()}${ext}`;
    cb(null, safeName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('يُسمح فقط بملفات PDF أو JPG أو PNG'), false);
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

// ── Doctor side: order tests, view, cancel ──────────────────────────────────
router.post('/',
  protect,
  authorize('doctor'),
  labTestController.createLabTest
);

router.post('/:id/cancel',
  protect,
  authorize('doctor', 'admin'),
  labTestController.cancelLabTest
);

// ── Lab tech side: search pending tests by patient national ID ──────────────
router.get('/pending/:nationalId',
  protect,
  authorize('lab_technician'),
  labTestController.getPendingByPatient
);

// ── Lab tech side: claim a pending test (assigns lab + collects sample) ─────
router.post('/:id/claim',
  protect,
  authorize('lab_technician'),
  labTestController.claimLabTest
);

// ── Lab tech side: workflow steps ───────────────────────────────────────────
router.post('/:id/collect-sample',
  protect,
  authorize('lab_technician'),
  labTestController.collectSample
);

router.post('/:id/start-processing',
  protect,
  authorize('lab_technician'),
  labTestController.startProcessing
);

router.post('/:id/enter-results',
  protect,
  authorize('lab_technician'),
  labTestController.enterResults
);

router.post('/:id/upload-pdf',
  protect,
  authorize('lab_technician'),
  upload.single('resultPdf'),
  labTestController.uploadResultPDF
);

router.post('/:id/complete',
  protect,
  authorize('lab_technician'),
  labTestController.completeLabTest
);

router.post('/:id/reject',
  protect,
  authorize('lab_technician'),
  labTestController.rejectLabTest
);

// ── View tracking ───────────────────────────────────────────────────────────
router.post('/:id/mark-viewed',
  protect,
  authorize('doctor', 'patient'),
  labTestController.markViewed
);

// ── Generic GET ─────────────────────────────────────────────────────────────
router.get('/:id',
  protect,
  authorize('doctor', 'lab_technician', 'patient', 'admin'),
  labTestController.getLabTestById
);

module.exports = router;