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

// Models needed to resolve the patient folder from a labTest :id
const { LabTest, Person, Children } = require('../models');

// ============================================================================
// MULTER CONFIG FOR PDF UPLOADS
// ────────────────────────────────────────────────────────────────────────────
// Result PDFs are organized into per-patient subfolders:
//
//     uploads/lab-results/<patientId>/labtest_<id>_<timestamp>.pdf
//
// where <patientId> is the adult's nationalId or the child's
// childRegistrationNumber. The upload route is POST /:id/upload-pdf, so at
// multer time we only have the labTest :id — we look it up, resolve the
// patient, and build the folder before writing the file (multer allows an
// async destination callback). Falls back to "_unsorted" if unresolved so an
// upload never hard-fails over folder organization.
// ============================================================================

// Base directory + fallback bucket
const BASE_DIR = path.join(__dirname, '..', 'uploads', 'lab-results');
const UNSORTED = '_unsorted';

// Ensure base directory exists at startup (multer doesn't auto-create)
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  console.log('📁 Created lab-results upload directory:', BASE_DIR);
}

/**
 * Sanitize an identifier into a safe single folder name.
 */
function safeFolderName(id) {
  if (!id) return UNSORTED;
  const cleaned = String(id).trim().replace(/[^A-Za-z0-9_-]/g, '');
  return cleaned.length ? cleaned : UNSORTED;
}

/**
 * Resolve the patient folder name (nationalId or CRN) from a labTest id.
 * Never throws — falls back to UNSORTED.
 *
 * @param {string} labTestId
 * @returns {Promise<string>}
 */
async function resolveLabPatientFolder(labTestId) {
  try {
    if (!labTestId || !String(labTestId).match(/^[0-9a-fA-F]{24}$/)) {
      return UNSORTED;
    }

    const test = await LabTest.findById(labTestId)
      .select('patientPersonId patientChildId')
      .lean();
    if (!test) return UNSORTED;

    if (test.patientPersonId) {
      const person = await Person.findById(test.patientPersonId)
        .select('nationalId')
        .lean();
      if (person?.nationalId) return safeFolderName(person.nationalId);
    }

    if (test.patientChildId) {
      const child = await Children.findById(test.patientChildId)
        .select('childRegistrationNumber nationalId')
        .lean();
      if (child?.nationalId) return safeFolderName(child.nationalId);
      if (child?.childRegistrationNumber) {
        return safeFolderName(child.childRegistrationNumber);
      }
    }

    return UNSORTED;
  } catch (err) {
    console.error('⚠️  resolveLabPatientFolder error:', err.message);
    return UNSORTED;
  }
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const folder = await resolveLabPatientFolder(req.params.id);
      const targetDir = path.join(BASE_DIR, folder);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Expose resolved folder so the controller can build the public URL.
      req.uploadPatientFolder = folder;

      cb(null, targetDir);
    } catch (err) {
      cb(err);
    }
  },
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

// ── Doctor / Dentist side: order tests, view, cancel ────────────────────────
router.post('/',
  protect,
  authorize('doctor', 'dentist'),
  labTestController.createLabTest
);

router.post('/:id/cancel',
  protect,
  authorize('doctor', 'dentist', 'admin'),
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
  authorize('doctor', 'dentist', 'patient'),
  labTestController.markViewed
);

// ── Generic GET ─────────────────────────────────────────────────────────────
router.get('/:id',
  protect,
  authorize('doctor', 'dentist', 'lab_technician', 'patient', 'admin'),
  labTestController.getLabTestById
);

module.exports = router;