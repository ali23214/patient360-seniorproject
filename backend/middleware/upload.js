// backend/middleware/upload.js
// ════════════════════════════════════════════════════════════════════════════
//  File upload middleware (multer) — VISITS
//  ───────────────────────────────────────────────────────────────────────────
//  Attachments are now organized into per-patient subfolders keyed by the
//  patient's identifier:
//
//      uploads/visits/<patientId>/<timestamp>_<originalname>
//
//  where <patientId> is:
//      • the adult's nationalId          (11-digit Syrian national ID), or
//      • the child's childRegistrationNumber (CRN-YYYYMMDD-XXXXX)
//
//  Why resolve the folder at multer time?
//      The route is POST /api/visits/:visitId/attachments, so when the file
//      arrives we only have the visitId — not the patient's nationalId. multer
//      lets the `destination` callback be asynchronous, so we look the visit up,
//      resolve its patient, and build the folder before the file is written.
//
//  Fallback: if the patient can't be resolved for any reason (missing visit,
//      orphaned record, etc.) we fall back to an "_unsorted" folder so an upload
//      never hard-fails just because of folder organization.
// ════════════════════════════════════════════════════════════════════════════

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const Visit = require('../models/Visit');
const Person = require('../models/Person');
const Children = require('../models/Children');

// Base directory for all visit uploads.
const BASE_DIR = path.join(__dirname, '../uploads/visits');
const UNSORTED = '_unsorted';

// Ensure base directory exists at startup.
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  console.log('✅ Created uploads/visits directory');
}

/**
 * Sanitize an identifier so it's always a safe single folder name.
 * Strips anything that isn't a letter, number, dash, or underscore.
 */
function safeFolderName(id) {
  if (!id) return UNSORTED;
  const cleaned = String(id).trim().replace(/[^A-Za-z0-9_-]/g, '');
  return cleaned.length ? cleaned : UNSORTED;
}

/**
 * Resolve the patient folder name (nationalId or CRN) from a visitId.
 * Returns the folder name string; never throws — falls back to UNSORTED.
 *
 * @param {string} visitId
 * @returns {Promise<string>}
 */
async function resolvePatientFolder(visitId) {
  try {
    if (!visitId || !String(visitId).match(/^[0-9a-fA-F]{24}$/)) {
      return UNSORTED;
    }

    const visit = await Visit.findById(visitId)
      .select('patientPersonId patientChildId')
      .lean();
    if (!visit) return UNSORTED;

    // Adult patient → nationalId
    if (visit.patientPersonId) {
      const person = await Person.findById(visit.patientPersonId)
        .select('nationalId')
        .lean();
      if (person?.nationalId) return safeFolderName(person.nationalId);
    }

    // Child patient → childRegistrationNumber (or nationalId once migrated)
    if (visit.patientChildId) {
      const child = await Children.findById(visit.patientChildId)
        .select('childRegistrationNumber nationalId')
        .lean();
      if (child?.nationalId) return safeFolderName(child.nationalId);
      if (child?.childRegistrationNumber) {
        return safeFolderName(child.childRegistrationNumber);
      }
    }

    return UNSORTED;
  } catch (err) {
    console.error('⚠️  resolvePatientFolder error:', err.message);
    return UNSORTED;
  }
}

// ── Storage ──────────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: async function destination(req, file, cb) {
    try {
      const folder = await resolvePatientFolder(req.params.visitId);
      const targetDir = path.join(BASE_DIR, folder);

      // Create the per-patient subfolder on demand.
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Expose the resolved folder so the route can build the public URL.
      req.uploadPatientFolder = folder;

      cb(null, targetDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: function filename(req, file, cb) {
    // timestamp_originalname — keeps original name, guarantees uniqueness
    const uniqueName = `${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

// ── File filter — images + documents ─────────────────────────────────────────

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('نوع الملف غير مدعوم. فقط الصور وملفات PDF مسموحة.'), false);
  }
};

// ── Multer instance ──────────────────────────────────────────────────────────

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});

module.exports = upload;
