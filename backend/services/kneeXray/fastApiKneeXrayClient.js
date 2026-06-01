/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FastAPI Knee OA Client — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/services/kneeXray/fastApiKneeXrayClient.js
 *
 *  Thin HTTP client that forwards uploaded knee X-ray images to the
 *  FastAPI microservice running Kinan's DenseNet121 3-class OA model.
 *
 *  Endpoint contract:
 *      POST {FASTAPI_KNEE_OA_URL}/predict
 *           multipart/form-data — field name: "file"
 *           returns:
 *             {
 *               predicted_class:   "Mild_OA" | "Normal" | "Severe_OA",
 *               description:       "...",
 *               confidence:        78.45,
 *               all_probabilities: { Mild_OA, Normal, Severe_OA }
 *             }
 *
 *      GET  {FASTAPI_KNEE_OA_URL}/health
 *           returns: { status: "ok", model: "...", classes: [...] }
 *
 *  Defaults:
 *      URL:     http://127.0.0.1:8003   (override via FASTAPI_KNEE_OA_URL)
 *      Timeout: 60 s                    (CNN inference can take a while)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs       = require('fs');
const path     = require('path');
const axios    = require('axios');
const FormData = require('form-data');

// ════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════

const FASTAPI_KNEE_OA_URL =
  process.env.FASTAPI_KNEE_OA_URL || 'http://127.0.0.1:8003';

const UPSTREAM_TIMEOUT_MS = 60_000;

// ════════════════════════════════════════════════════════════════════════════
// CORE — forward a file to the FastAPI /predict endpoint
// ════════════════════════════════════════════════════════════════════════════

/**
 * Forward a multer-saved file to the FastAPI knee-OA /predict endpoint.
 *
 * @param {string} filePath      absolute path on disk
 * @param {string} originalName  user's original filename
 * @param {string} mimetype      e.g. "image/jpeg"
 * @returns {Promise<{ status: number, data: object }>}
 */
async function predictKneeOA(filePath, originalName, mimetype) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), {
    filename:    originalName || path.basename(filePath),
    contentType: mimetype     || 'application/octet-stream',
  });

  const response = await axios.post(
    `${FASTAPI_KNEE_OA_URL}/predict`,
    form,
    {
      headers:           form.getHeaders(),
      timeout:           UPSTREAM_TIMEOUT_MS,
      maxBodyLength:     Infinity,
      maxContentLength:  Infinity,
      validateStatus:    () => true, // inspect any status manually
    }
  );

  return { status: response.status, data: response.data };
}

// ════════════════════════════════════════════════════════════════════════════
// HEALTH — verify the FastAPI service is reachable
// ════════════════════════════════════════════════════════════════════════════

/**
 * Quick GET /health probe to confirm the FastAPI service is up.
 * Used by GET /api/knee-xray/health for sysadmin diagnostics.
 *
 * @returns {Promise<{ ok: boolean, data?: object, error?: string }>}
 */
async function checkHealth() {
  try {
    const response = await axios.get(`${FASTAPI_KNEE_OA_URL}/health`, {
      timeout: 5_000,
    });
    return { ok: true, data: response.data };
  } catch (err) {
    return {
      ok:    false,
      error: err.code || err.message || 'Unknown error',
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ERROR TRANSLATION — map upstream failures to clean Arabic messages
// ════════════════════════════════════════════════════════════════════════════

/**
 * Translate axios / network errors into user-friendly Arabic messages.
 * @param {unknown} err
 * @returns {{ status: number, message: string, code: string }}
 */
function translateUpstreamError(err) {
  if (err && err.code === 'ECONNREFUSED') {
    return {
      status:  503,
      code:    'UPSTREAM_DOWN',
      message: 'خدمة تحليل صور الركبة غير متاحة حالياً. تأكد من تشغيل خدمة الذكاء الاصطناعي على المنفذ 8003.',
    };
  }
  if (err && err.code === 'ETIMEDOUT') {
    return {
      status:  504,
      code:    'UPSTREAM_TIMEOUT',
      message: 'انتهت مهلة الاتصال بخدمة تحليل صور الركبة.',
    };
  }
  if (err && err.code === 'ECONNABORTED') {
    return {
      status:  504,
      code:    'UPSTREAM_ABORTED',
      message: 'تجاوز التحليل الوقت المسموح به.',
    };
  }
  return {
    status:  502,
    code:    'UPSTREAM_ERROR',
    message: 'تعذّر تحليل الصورة. حاول مرة أخرى.',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════════

module.exports = {
  predictKneeOA,
  checkHealth,
  translateUpstreamError,
  FASTAPI_KNEE_OA_URL,
};
