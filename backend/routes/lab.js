/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Lab Routes — Patient 360°  (Frontend-facing layer)
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at /api/lab.
 *
 *  These routes serve the Lab Dashboard (LabDashboard.jsx) exclusively.
 *  They mirror the labAPI contract in frontend/src/services/api.js.
 *
 *  All routes require the lab_technician role (admin also allowed for
 *  support / debugging, except for the mutating flows which are lab-tech only).
 *
 *  ────────────────────────────────────────────────────────────────────────
 *  PDF upload note:
 *  The /tests/:id/complete endpoint is multipart/form-data. Multer is
 *  configured below to accept a single file in the `resultPdf` field,
 *  max 10 MB, PDF/JPG/PNG mime types (PDF strongly preferred).
 *
 *  Files land at:  <backend>/uploads/lab-results/lab_<testId>_<timestamp>.<ext>
 *
 *  express.static('/uploads') is already wired in backend/index.js, so the
 *  saved URL (/uploads/lab-results/<filename>) is immediately browsable.
 *  ────────────────────────────────────────────────────────────────────────
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const labController = require('../controllers/labController');
const { protect, authorize } = require('../middleware/auth');

// ────────────────────────────────────────────────────────────────────────────
// MULTER CONFIG — lab result PDF uploads
// ────────────────────────────────────────────────────────────────────────────

// Ensure the destination directory exists on server boot. Multer won't
// create it automatically, and a missing directory causes a cryptic
// ENOENT error mid-request.
const LAB_UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'lab-results');
if (!fs.existsSync(LAB_UPLOADS_DIR)) {
  fs.mkdirSync(LAB_UPLOADS_DIR, { recursive: true });
  console.log('📁 Created lab-results upload directory:', LAB_UPLOADS_DIR);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, LAB_UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
    const safeName = `lab_${req.params.id}_${Date.now()}${ext}`;
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
  limits: { fileSize: 10 * 1024 * 1024 }  // 10 MB
});

/**
 * Friendly multer error handler — translates raw multer errors into the
 * { success: false, message: ... } shape the frontend expects.
 *
 * Usage: place AFTER the upload.single(...) middleware but BEFORE the
 * controller. Any error originating in multer gets caught here.
 */
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'حجم الملف كبير جداً — الحد الأقصى 10 ميغابايت'
      });
    }
    return res.status(400).json({
      success: false,
      message: `خطأ في رفع الملف: ${err.message}`
    });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};

// ────────────────────────────────────────────────────────────────────────────
// ACCESS CONTROL
// ────────────────────────────────────────────────────────────────────────────

const labTechOnly = [protect, authorize('lab_technician', 'admin')];

// ════════════════════════════════════════════════════════════════════════════
// SECTION 1 — DASHBOARD KPIs
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/lab/dashboard/kpis
 * Returns 6 KPI counters + recent activity feed + the technician's
 * laboratory info, in a single round-trip to keep the dashboard snappy.
 */
router.get('/dashboard/kpis', labTechOnly, labController.getDashboardKPIs);

// ════════════════════════════════════════════════════════════════════════════
// SECTION 2 — NOTIFICATIONS
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/lab/notifications
 * Reads from the notifications collection where recipientType='lab_technician'
 * and recipientId is the current account._id.
 */
router.get('/notifications', labTechOnly, labController.getMyNotifications);

/**
 * PATCH /api/lab/notifications/:id/read
 * Marks a single notification as read. Only allowed if the notification
 * actually belongs to this account (guard inside the controller).
 */
router.patch('/notifications/:id/read', labTechOnly, labController.markNotificationRead);

// ════════════════════════════════════════════════════════════════════════════
// SECTION 3 — PATIENT LOOKUP (for sample collection)
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/lab/patient/:nationalId
 * 11-digit Syrian national ID → patient profile + their active lab_tests
 * at THIS lab. Searches both the persons and children collections.
 */
router.get('/patient/:nationalId', labTechOnly, labController.searchPatientByNationalId);

// ════════════════════════════════════════════════════════════════════════════
// SECTION 4 — TEST LISTS
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/lab/tests/ready
 * All tests at this lab where status='sample_collected'. These are the
 * tests awaiting results entry / PDF upload.
 *
 * NOTE: This route MUST come BEFORE `/tests/:id` (any _id path),
 * otherwise Express will match 'ready' as an :id param.
 */
router.get('/tests/ready', labTechOnly, labController.getReadyTests);

/**
 * GET /api/lab/tests?status=<filter>
 * Full list with optional status filter. Used by the History tab.
 */
router.get('/tests', labTechOnly, labController.getMyTests);

// ════════════════════════════════════════════════════════════════════════════
// SECTION 5 — WORKFLOW ACTIONS
// ════════════════════════════════════════════════════════════════════════════

/**
 * PUT /api/lab/tests/:id/collect-sample
 * Body: { sampleId: string, sampleType: 'blood'|'urine'|... }
 * ordered/scheduled → sample_collected
 */
router.put('/tests/:id/collect-sample', labTechOnly, labController.collectSample);

/**
 * PUT /api/lab/tests/:id/start
 * No body required.
 * sample_collected → in_progress
 */
router.put('/tests/:id/start', labTechOnly, labController.startProcessing);

/**
 * PUT /api/lab/tests/:id/complete
 * Multipart form-data:
 *   - resultPdf (file, REQUIRED)
 *   - testResults (JSON string)
 *   - labNotes (string)
 *   - isCritical ('true' | 'false')
 * in_progress or sample_collected → completed
 */
router.put(
  '/tests/:id/complete',
  labTechOnly,
  upload.single('resultPdf'),
  handleMulterError,
  labController.submitResults
);

/**
 * POST /api/lab/tests/:id/reject
 * Body: { rejectionReason: string }
 * any non-terminal → rejected
 */
router.post('/tests/:id/reject', labTechOnly, labController.rejectTest);

module.exports = router;