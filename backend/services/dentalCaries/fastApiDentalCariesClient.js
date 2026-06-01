/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FastAPI Dental Caries Client
 * Patient 360° — Syrian National Medical Platform
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Thin HTTP client that wraps the Pak Team's dental caries FastAPI service
 * (port 8004 by default). Exposes only static methods — the client is
 * stateless beyond axios's default keep-alive.
 *
 * Upstream endpoints used:
 *   POST   /predict                  — single-image classification
 *   POST   /predict_with_gradcam     — single-image classification + Grad-CAM viz
 *   GET    /health                   — liveness + model status
 *
 * Configuration via environment variables (all optional except URL):
 *   FASTAPI_DENTAL_CARIES_URL                  default http://localhost:8004
 *   FASTAPI_DENTAL_CARIES_TIMEOUT_ANALYZE_MS   default 60000
 *   FASTAPI_DENTAL_CARIES_TIMEOUT_HEALTH_MS    default 5000
 *
 * Error contract:
 *   All upstream errors are wrapped in `FastApiDentalCariesError` with:
 *     • status     — HTTP code to send back to the client (400, 502, 503)
 *     • upstream   — the raw upstream response body, if any
 *     • cause      — the underlying axios/Node error, if any
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const axios    = require('axios');
const FormData = require('form-data');

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURATION
   ═══════════════════════════════════════════════════════════════════════════ */

const FASTAPI_URL = (process.env.FASTAPI_DENTAL_CARIES_URL || 'http://localhost:8004')
  .trim()
  .replace(/\/+$/, '');

const ANALYZE_TIMEOUT_MS =
  parseInt(process.env.FASTAPI_DENTAL_CARIES_TIMEOUT_ANALYZE_MS, 10) || 60000;

const HEALTH_TIMEOUT_MS  =
  parseInt(process.env.FASTAPI_DENTAL_CARIES_TIMEOUT_HEALTH_MS, 10) || 5000;

/* ═══════════════════════════════════════════════════════════════════════════
   ERROR CLASS
   ═══════════════════════════════════════════════════════════════════════════ */

class FastApiDentalCariesError extends Error {
  constructor(message, { status, upstream, cause } = {}) {
    super(message);
    this.name     = 'FastApiDentalCariesError';
    this.status   = status || 502;
    this.upstream = upstream;
    if (cause) this.cause = cause;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLIENT
   ═══════════════════════════════════════════════════════════════════════════ */

class FastApiDentalCariesClient {
  /**
   * Send a single image to the FastAPI `/predict` endpoint.
   *
   * @param   {Object} args
   * @param   {Buffer} args.buffer    — raw image bytes
   * @param   {String} args.filename  — original filename (used by FastAPI for ext check)
   * @param   {String} args.mimetype  — image MIME type
   * @returns {Promise<Object>}        FastAPI response with `processingTimeMs` added
   * @throws  {FastApiDentalCariesError}
   */
  static async analyze({ buffer, filename, mimetype }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new FastApiDentalCariesError('Image buffer is empty', { status: 400 });
    }

    const form = new FormData();
    form.append('file', buffer, {
      filename:    filename || 'tooth.png',
      contentType: mimetype || 'application/octet-stream',
    });

    const startedAt = Date.now();
    let response;
    try {
      response = await axios.post(`${FASTAPI_URL}/predict`, form, {
        headers:          form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength:    Infinity,
        timeout:          ANALYZE_TIMEOUT_MS,
        validateStatus:   () => true,   // we'll inspect the status ourselves
      });
    } catch (err) {
      // Network-level failure (no HTTP response received).
      const isTimeout = err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '');
      const isRefused = err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET';

      let message;
      if (isTimeout)      message = `FastAPI dental caries service timed out after ${ANALYZE_TIMEOUT_MS}ms`;
      else if (isRefused) message = 'FastAPI dental caries service refused the connection (is the service running on port 8004?)';
      else                message = `FastAPI dental caries service unreachable: ${err.message}`;

      throw new FastApiDentalCariesError(message, { status: 502, cause: err });
    }

    const processingTimeMs = Date.now() - startedAt;

    if (response.status < 200 || response.status >= 300) {
      const detail =
        response.data?.detail
        || response.data?.message
        || `HTTP ${response.status}`;
      throw new FastApiDentalCariesError(`FastAPI returned ${response.status}: ${detail}`, {
        status:   response.status === 400 ? 400 : 502,
        upstream: response.data,
      });
    }

    return { ...response.data, processingTimeMs };
  }

  /**
   * Same as `analyze`, but hits the `/predict_with_gradcam` endpoint which
   * additionally returns three base64-encoded PNGs:
   *   visualization.enhanced_xray_b64
   *   visualization.gradcam_overlay_b64
   *   visualization.boxes_overlay_b64
   *
   * The contract is otherwise identical to /predict — if the upstream
   * service couldn't generate Grad-CAM (e.g. layer detection failed),
   * `visualization` will be null or { error: "..." } but the prediction
   * fields are still returned, so callers can degrade gracefully.
   *
   * @param   {Object} args                 — same as analyze()
   * @returns {Promise<Object>}
   * @throws  {FastApiDentalCariesError}
   */
  static async analyzeWithGradcam({ buffer, filename, mimetype }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new FastApiDentalCariesError('Image buffer is empty', { status: 400 });
    }

    const form = new FormData();
    form.append('file', buffer, {
      filename:    filename || 'tooth.png',
      contentType: mimetype || 'application/octet-stream',
    });

    const startedAt = Date.now();
    let response;
    try {
      response = await axios.post(`${FASTAPI_URL}/predict_with_gradcam`, form, {
        headers:          form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength:    Infinity,
        timeout:          ANALYZE_TIMEOUT_MS,
        validateStatus:   () => true,
      });
    } catch (err) {
      const isTimeout = err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '');
      const isRefused = err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET';

      let message;
      if (isTimeout)      message = `FastAPI dental caries service timed out after ${ANALYZE_TIMEOUT_MS}ms`;
      else if (isRefused) message = 'FastAPI dental caries service refused the connection (is the service running on port 8004?)';
      else                message = `FastAPI dental caries service unreachable: ${err.message}`;

      throw new FastApiDentalCariesError(message, { status: 502, cause: err });
    }

    const processingTimeMs = Date.now() - startedAt;

    if (response.status < 200 || response.status >= 300) {
      const detail =
        response.data?.detail
        || response.data?.message
        || `HTTP ${response.status}`;
      throw new FastApiDentalCariesError(`FastAPI returned ${response.status}: ${detail}`, {
        status:   response.status === 400 ? 400 : 502,
        upstream: response.data,
      });
    }

    return { ...response.data, processingTimeMs };
  }

  /**
   * Probe the FastAPI `/health` endpoint.
   * @returns {Promise<Object>} raw upstream payload
   * @throws  {FastApiDentalCariesError}
   */
  static async health() {
    let response;
    try {
      response = await axios.get(`${FASTAPI_URL}/health`, {
        timeout:        HEALTH_TIMEOUT_MS,
        validateStatus: () => true,
      });
    } catch (err) {
      throw new FastApiDentalCariesError(`Health check failed: ${err.message}`, {
        status: 503,
        cause:  err,
      });
    }

    if (response.status < 200 || response.status >= 300) {
      throw new FastApiDentalCariesError(
        `Health check returned HTTP ${response.status}`,
        { status: response.status, upstream: response.data }
      );
    }

    return response.data;
  }

  /** Convenience accessor used in logging and the proxy /health endpoint. */
  static getServiceUrl() {
    return FASTAPI_URL;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════════════════════ */

FastApiDentalCariesClient.Error = FastApiDentalCariesError;
module.exports = FastApiDentalCariesClient;
