/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  fastApiDrugClient
 *  ─────────────────────────────────────────────────────────────────────────
 *  Thin HTTP wrapper around Kinan's rule-based drug-risk FastAPI service.
 *  Modelled after routes/xray.js's proxy pattern: Express handles auth and
 *  validation, then forwards a clean payload here.
 *
 *  Why a separate client module:
 *    - Centralizes the URL config (process.env.FASTAPI_DRUG_RISK_URL)
 *    - Normalizes errors into a single shape the controller can switch on
 *    - Adds timing telemetry (stored in DrugRiskCheck.fastApiRequestMs)
 *    - Keeps the controller readable
 *
 *  Kinan's service contract (confirmed):
 *    POST   /check-drug   { patient_id, text, patient_profile } → result
 *    GET    /health                                            → { status }
 *
 *  Risk profile:
 *    - Service is local (default localhost:8001), no auth, fast (<50ms)
 *    - We still set a 5s timeout — if FastAPI hangs, we fail loud
 *    - Network errors are translated to a structured error the controller
 *      can present nicely to the UI (Arabic message)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const axios = require('axios');

const BASE_URL = process.env.FASTAPI_DRUG_RISK_URL || 'http://localhost:8001';
const REQUEST_TIMEOUT_MS = 5000;

// Single axios instance, reused across calls (connection pooling).
const client = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
  },
});

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Call POST /check-drug on Kinan's FastAPI.
 *
 * @param {Object} payload
 * @param {string} payload.patient_id        — opaque identifier (we use Mongo _id)
 * @param {string} payload.text              — free-text from the user
 * @param {Object} payload.patient_profile   — normalized profile from drugNormalizationService
 * @returns {Promise<Object>} On success: { ok: true, data, elapsedMs, status }
 *                            On failure: { ok: false, error, elapsedMs, status }
 *                            (Never throws — caller switches on `ok`.)
 */
async function checkDrug({ patient_id, text, patient_profile }) {
  const startedAt = Date.now();

  try {
    const response = await client.post('/check-drug', {
      patient_id,
      text,
      patient_profile,
    });

    return {
      ok: true,
      data: response.data,
      elapsedMs: Date.now() - startedAt,
      status: response.status,
    };
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;

    // Axios populates err.response only when the server actually replied.
    // If err.response is missing, we never reached the server (network/timeout).
    if (err.response) {
      return {
        ok: false,
        error: {
          code: 'FASTAPI_ERROR',
          message:
            err.response.data?.detail ||
            err.response.data?.message ||
            'استجابة خطأ من خدمة فحص الأدوية',
          httpStatus: err.response.status,
          raw: err.response.data,
        },
        elapsedMs,
        status: err.response.status,
      };
    }

    // Timeout / ECONNREFUSED / DNS failure / etc.
    return {
      ok: false,
      error: {
        code:
          err.code === 'ECONNABORTED'
            ? 'TIMEOUT'
            : err.code === 'ECONNREFUSED'
            ? 'UNREACHABLE'
            : 'NETWORK_ERROR',
        message:
          err.code === 'ECONNREFUSED'
            ? 'خدمة فحص الأدوية غير متاحة حالياً'
            : err.code === 'ECONNABORTED'
            ? 'انتهت مهلة الاتصال بخدمة فحص الأدوية'
            : 'تعذر الاتصال بخدمة فحص الأدوية',
        raw: err.message,
      },
      elapsedMs,
      status: 0,
    };
  }
}

/**
 * Probe the service health endpoint.
 *
 * @returns {Promise<{ok: boolean, status?: string, elapsedMs: number, error?: string}>}
 */
async function checkHealth() {
  const startedAt = Date.now();
  try {
    const response = await client.get('/health', { timeout: 2000 });
    return {
      ok: true,
      status: response.data?.status || 'ok',
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.code || err.message,
      elapsedMs: Date.now() - startedAt,
    };
  }
}

module.exports = {
  checkDrug,
  checkHealth,
  // Exposed for ops/debugging
  _config: { baseUrl: BASE_URL, timeoutMs: REQUEST_TIMEOUT_MS },
};
