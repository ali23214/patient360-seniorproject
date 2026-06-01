/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Professional Registration File Upload Middleware
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/middleware/uploadDoctorFiles.js
 *
 *  Storage layout (v3 — organized by role + national ID):
 *
 *    backend/uploads/requests/
 *    ├── doctor/
 *    │   └── <nationalId>/
 *    │       ├── licenseDocument/
 *    │       │   └── <timestamp>.<ext>
 *    │       ├── medicalCertificate/
 *    │       │   └── <timestamp>.<ext>
 *    │       └── profilePhoto/
 *    │           └── <timestamp>.<ext>
 *    ├── dentist/
 *    │   └── <nationalId>/...
 *    ├── pharmacist/
 *    │   └── <nationalId>/
 *    │       ├── licenseDocument/
 *    │       ├── degreeDocument/
 *    │       └── profilePhoto/
 *    └── lab-technician/
 *        └── <nationalId>/...
 *
 *  Why this layout:
 *    - The admin opens \uploads\requests\<role>\<nationalId>\ and sees
 *      exactly which professional type and which person the documents
 *      belong to. No cross-contamination between doctor, dentist,
 *      pharmacist, and lab technician applications.
 *    - Easy to audit one role at a time.
 *    - Approval flow (future) can rename the parent folder per role.
 *
 *  How role + nationalId are detected inside multer's destination callback:
 *    - role: derived from the request URL — /register-doctor → 'doctor',
 *      /register-pharmacist → 'pharmacist', etc. The URL is the source of
 *      truth here because req.body doesn't carry a role field.
 *    - nationalId: the frontend appends it to FormData BEFORE the file
 *      fields. Multer parses text fields as they arrive, so by the time
 *      the destination callback runs, req.body.nationalId is populated.
 *      Falls back to a timestamp-based temp folder if missing.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_ROOT = path.join(__dirname, '../uploads/requests');

// Ensure the top-level requests folder exists at startup.
if (!fs.existsSync(UPLOADS_ROOT)) {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
  console.log('📁 Created uploads root:', UPLOADS_ROOT);
}

/**
 * Sanitize a value before using it as a folder name.
 * Strips anything that isn't alphanumeric or dash so a malicious / weird
 * value can't escape the requests directory.
 */
function sanitizeFolderName(value) {
  if (!value || typeof value !== 'string') return '';
  return value.trim().replace(/[^a-zA-Z0-9-]/g, '');
}

/**
 * Derive the professional role from the request URL.
 * Returns one of: 'doctor' | 'dentist' | 'pharmacist' | 'lab-technician' | 'other'
 *
 * We read it from the URL (not req.body) because:
 *   1. req.body doesn't have a role field — each endpoint knows its own role.
 *   2. The URL is set by routing, so it can't be spoofed by the client.
 */
function detectRoleFromRequest(req) {
  const url = String(req.originalUrl || req.url || '');
  if (url.includes('register-doctor'))         return 'doctor';
  if (url.includes('register-dentist'))        return 'dentist';
  if (url.includes('register-pharmacist'))     return 'pharmacist';
  if (url.includes('register-lab-technician')) return 'lab-technician';
  return 'other';
}

// ── Storage configuration ────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      // 1) Determine role from the URL.
      const role = detectRoleFromRequest(req);

      // 2) Pull national ID from the form body (frontend sends it first).
      const rawNationalId = req.body && req.body.nationalId;
      const cleanNationalId = sanitizeFolderName(rawNationalId);
      const folderName = cleanNationalId || `temp_${Date.now()}`;

      // 3) Final directory: requests/<role>/<nationalId>/<fieldname>/
      const directory = path.join(
        UPLOADS_ROOT,
        role,
        folderName,
        file.fieldname
      );

      // Create recursively if it doesn't exist.
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
        console.log('📁 Created:', directory);
      }

      cb(null, directory);
    } catch (error) {
      console.error('❌ destination error:', error);
      cb(error, null);
    }
  },

  filename: (req, file, cb) => {
    try {
      // Timestamp-based name to avoid collisions across re-uploads.
      const ext = path.extname(file.originalname).toLowerCase();
      const filename = `${Date.now()}${ext}`;
      cb(null, filename);
    } catch (error) {
      console.error('❌ filename error:', error);
      cb(error, null);
    }
  },
});

// ── File filter — accept only images and PDFs ────────────────────────────────

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
  ];

  console.log('🔎 File received:', file.originalname, '| Field:', file.fieldname);

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.log('❌ Rejected:', file.mimetype);
    cb(
      new Error(
        `نوع الملف غير مدعوم: ${file.mimetype}. الرجاء رفع صور (JPG, PNG) أو ملفات PDF فقط.`
      ),
      false
    );
  }
};

// ── Base multer config (shared) ──────────────────────────────────────────────

const baseUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
  },
});

// ── Per-profession upload fields ─────────────────────────────────────────────

// Doctor + Dentist (the dentist signup reuses this exact configuration).
const uploadFields = baseUpload.fields([
  { name: 'medicalCertificate', maxCount: 1 },
  { name: 'licenseDocument',    maxCount: 1 },
  { name: 'profilePhoto',       maxCount: 1 },
]);

const uploadPharmacistFields = baseUpload.fields([
  { name: 'licenseDocument', maxCount: 1 },
  { name: 'degreeDocument',  maxCount: 1 },
  { name: 'profilePhoto',    maxCount: 1 },
]);

const uploadLabTechFields = baseUpload.fields([
  { name: 'licenseDocument', maxCount: 1 },
  { name: 'degreeDocument',  maxCount: 1 },
  { name: 'profilePhoto',    maxCount: 1 },
]);

// ── Error handling middleware ────────────────────────────────────────────────

const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('❌ Multer error:', err);

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'حجم الملف كبير جداً. الحد الأقصى 10 ميغابايت لكل ملف',
      });
    }

    return res.status(400).json({
      success: false,
      message: 'خطأ في رفع الملف: ' + err.message,
    });
  }

  if (err) {
    console.error('❌ File upload error:', err);
    return res.status(400).json({
      success: false,
      message: err.message || 'خطأ في رفع الملف',
    });
  }

  next();
};

module.exports = {
  uploadFields,
  uploadPharmacistFields,
  uploadLabTechFields,
  handleUploadErrors,
};
