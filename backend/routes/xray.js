/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  X-Ray Fracture Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at /api/xray
 *
 *  Two endpoints, both forwarding to the same Kinan FastAPI service:
 *
 *    POST /api/xray/analyze-hand   (orthopedist) → fracture detection
 *    POST /api/xray/analyze-leg    (orthopedist) → fracture detection
 *
 *  Multipart upload field name (from frontend): xray_image
 *  We rename it to `file` when forwarding because that is the field name
 *  Kinan's FastAPI endpoint expects.
 *
 *  IMPORTANT: This route does NOT transform the model response. The body
 *  returned to the React client is exactly what Kinan's /predict returned,
 *  with one additional field (`bodyPart`) so the UI can label the result.
 *
 *  Pipeline:
 *      React (FormData: xray_image)
 *           │  Authorization: Bearer <JWT>
 *           ▼
 *      Express (this file) — auth + multer + file validation
 *           │  axios POST multipart (field renamed to `file`)
 *           ▼
 *      FastAPI (Kinan) — runs DenseNet model
 *           │  JSON response
 *           ▼
 *      Express → React (response passed through verbatim)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const { protect, authorize } = require('../middleware/auth');

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Base URL of Kinan's FastAPI service. Override per environment via .env:
 *     XRAY_FASTAPI_URL=http://127.0.0.1:8002
 * Defaults to localhost:8002 to keep the dev experience zero-config.
 */
const XRAY_FASTAPI_URL = process.env.XRAY_FASTAPI_URL || 'http://127.0.0.1:8002';

/** Hard cap on upload size in bytes. Mirrors Kinan's FastAPI limit. */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

/** Total network timeout for the upstream call (ms). */
const UPSTREAM_TIMEOUT_MS = 60_000;

// ============================================================================
// MULTER — disk storage so we never hold the file fully in memory
// ============================================================================

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'xray');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('📁 Created xray upload directory:', UPLOAD_DIR);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safe = `xray_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;
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
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

// The frontend uses the field name `xray_image`. Keep it.
const xrayUpload = upload.single('xray_image');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Best-effort cleanup of the temp file. Never throws — the model already ran.
 * @param {string} filePath
 */
function safeUnlink(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.warn('⚠️  Failed to delete temp x-ray file:', filePath, err.message);
    }
  });
}

/**
 * Forward a multer-saved file to Kinan's FastAPI /predict endpoint.
 *
 * @param {string} filePath  absolute path on disk
 * @param {string} originalName  the user's original filename
 * @param {string} mimetype  e.g. image/jpeg
 * @returns {Promise<object>} the JSON body returned by FastAPI (untouched)
 */
async function forwardToFastAPI(filePath, originalName, mimetype) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), {
    filename: originalName || path.basename(filePath),
    contentType: mimetype || 'application/octet-stream',
  });

  const response = await axios.post(`${XRAY_FASTAPI_URL}/predict`, form, {
    headers: form.getHeaders(),
    timeout: UPSTREAM_TIMEOUT_MS,
    maxBodyLength: Infinity, // form-data streams can be larger than axios default
    maxContentLength: Infinity,
    validateStatus: () => true, // we want to inspect any status, not throw
  });

  return { status: response.status, data: response.data };
}

/**
 * Translate an upstream/network failure into a clean Arabic error for the UI.
 * @param {unknown} err
 * @returns {{ status: number, message: string }}
 */
function translateUpstreamError(err) {
  // Axios connection refused / DNS / network
  if (err && err.code === 'ECONNREFUSED') {
    return {
      status: 503,
      message: 'خدمة تحليل الأشعة غير متاحة حالياً. تأكد من تشغيل خدمة الذكاء الاصطناعي.',
    };
  }
  if (err && err.code === 'ETIMEDOUT') {
    return { status: 504, message: 'انتهت مهلة الاتصال بخدمة تحليل الأشعة.' };
  }
  if (err && err.code === 'ECONNABORTED') {
    return { status: 504, message: 'تجاوز التحليل الوقت المسموح به.' };
  }
  return { status: 502, message: 'تعذّر تحليل الصورة. حاول مرة أخرى.' };
}

// ============================================================================
// CORE HANDLER (shared by both routes)
// ============================================================================

/**
 * @param {('hand'|'leg')} bodyPart  used for logging + echoed to the client
 */
function makeAnalyzeHandler(bodyPart) {
  return async (req, res) => {
    console.log(`🦴 ========== X-RAY ANALYZE (${bodyPart.toUpperCase()}) ==========`);
    console.log('   By doctor:', req.user?.email || '?');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'يجب رفع صورة الأشعة',
      });
    }

    const { path: filePath, originalname, mimetype, size } = req.file;
    console.log(`   File: ${originalname} (${(size / 1024).toFixed(1)} KB, ${mimetype})`);

    try {
      const { status: upstreamStatus, data } = await forwardToFastAPI(
        filePath,
        originalname,
        mimetype
      );

      // Upstream returned non-2xx — surface its detail to the client (in Arabic
      // when we can, otherwise pass through). DO NOT mutate the success body.
      if (upstreamStatus < 200 || upstreamStatus >= 300) {
        console.warn(`   ❌ FastAPI returned ${upstreamStatus}:`, data);
        return res.status(upstreamStatus).json({
          success: false,
          message: data?.detail || data?.message || 'فشل تحليل صورة الأشعة',
        });
      }

      console.log(
        `   ✅ ${data?.diagnosis} (${data?.confidence_percent}%) — passed through`
      );

      // Return Kinan's body verbatim, plus echo bodyPart so the React UI
      // can show the right Arabic label without keeping client-side state.
      return res.status(200).json({ ...data, bodyPart });
    } catch (err) {
      console.error('   💥 Upstream error:', err.code || err.message);
      const { status, message } = translateUpstreamError(err);
      return res.status(status).json({ success: false, message });
    } finally {
      safeUnlink(filePath);
    }
  };
}

// ============================================================================
// MULTER ERROR HANDLER (covers file-too-large, wrong mime, etc.)
// ============================================================================

function multerErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: `حجم الصورة كبير جداً. الحد الأقصى ${MAX_UPLOAD_BYTES / 1024 / 1024} ميجابايت.`,
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    // fileFilter rejection lands here (Arabic message preserved)
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
}

// ============================================================================
// ROUTES
// ============================================================================

router.post(
  '/analyze-hand',
  protect,
  authorize('doctor'),
  (req, res, next) => xrayUpload(req, res, (err) => multerErrorHandler(err, req, res, next)),
  makeAnalyzeHandler('hand')
);

router.post(
  '/analyze-leg',
  protect,
  authorize('doctor'),
  (req, res, next) => xrayUpload(req, res, (err) => multerErrorHandler(err, req, res, next)),
  makeAnalyzeHandler('leg')
);

// ============================================================================
// HEALTH (lets you verify Express ↔ FastAPI link without uploading anything)
// ============================================================================

router.get('/health', protect, authorize('doctor', 'admin'), async (req, res) => {
  try {
    const { data } = await axios.get(`${XRAY_FASTAPI_URL}/health`, { timeout: 5_000 });
    return res.json({ success: true, upstream: data });
  } catch (err) {
    return res.status(503).json({
      success: false,
      message: 'خدمة تحليل الأشعة غير متاحة',
      detail: err.code || err.message,
    });
  }
});

module.exports = router;