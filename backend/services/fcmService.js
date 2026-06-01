/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FCM Service — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Centralized Firebase Cloud Messaging (FCM) dispatcher.
 *
 *  Responsibilities:
 *    1. init()          — Initialize Firebase Admin SDK at server boot.
 *    2. sendToTokens()  — Push a notification to one or more device tokens.
 *    3. sendToAccount() — Push to all active tokens of a single account.
 *    4. cleanupInvalidTokens() — Auto-remove dead tokens after a failed send.
 *
 *  Design notes:
 *    - Graceful degradation: if firebase-admin or the service-account JSON
 *      is missing, the service logs a warning and becomes a NO-OP. The rest
 *      of the backend keeps running — only push delivery is disabled.
 *    - Stateless: no in-memory state besides the initialized admin app.
 *    - Idempotent init: calling init() twice does NOT throw.
 *
 *  Environment variables:
 *    FIREBASE_SERVICE_ACCOUNT_PATH (optional)
 *      Default: ./config/firebase-service-account.json
 *      Override only if you keep the JSON in a non-standard location.
 *
 *  Usage:
 *    const fcmService = require('../services/fcmService');
 *
 *    // At server boot (index.js)
 *    fcmService.init();
 *
 *    // From any controller / dispatcher
 *    await fcmService.sendToAccount(accountId, {
 *      title: 'وصفتك جاهزة',
 *      body: 'الصيدلي صرف وصفتك',
 *      data: { route: '/medications' }
 *    });
 * ═══════════════════════════════════════════════════════════════════════════
 */

const path = require('path');
const fs   = require('fs');

let admin = null;        // firebase-admin SDK (lazy-loaded)
let initialized = false; // true once init() has run successfully
let degraded   = false;  // true if init() failed → all sends become no-ops

// ============================================================================
// 1. INITIALIZATION
// ============================================================================

/**
 * Initializes Firebase Admin SDK using the service-account JSON file.
 * Safe to call multiple times — idempotent.
 *
 * @returns {boolean} true if Firebase is ready, false if degraded.
 */
function init() {
  if (initialized) return !degraded;

  try {
    // Lazy require so that if firebase-admin isn't installed yet, the
    // rest of the server still starts.
    admin = require('firebase-admin');

    // Resolve service-account path
    const accountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      || path.join(__dirname, '..', 'config', 'firebase-service-account.json');

    if (!fs.existsSync(accountPath)) {
      console.warn(
        `⚠️  FCM: service account file not found at ${accountPath} — ` +
        `push notifications DISABLED.`
      );
      degraded = true;
      initialized = true;
      return false;
    }

    const serviceAccount = require(accountPath);

    // Initialize the admin app only if not already initialized
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    initialized = true;
    degraded = false;
    console.log(`✅ FCM: Firebase Admin SDK initialized (project: ${serviceAccount.project_id})`);
    return true;
  } catch (error) {
    console.error('❌ FCM: initialization failed — push notifications DISABLED', error.message);
    degraded = true;
    initialized = true;
    return false;
  }
}

// ============================================================================
// 2. SEND TO MULTIPLE TOKENS (low-level)
// ============================================================================

/**
 * Sends an FCM message to a list of device tokens. Returns per-token
 * delivery results so the caller can clean up dead tokens.
 *
 * @param {string[]} tokens — FCM device tokens
 * @param {object} payload — { title, body, data? }
 *
 * @returns {Promise<{
 *   sent: number,
 *   failed: number,
 *   invalidTokens: string[],
 *   skipped: boolean
 * }>}
 */
async function sendToTokens(tokens, payload) {
  if (!initialized) init();

  if (degraded) {
    return { sent: 0, failed: 0, invalidTokens: [], skipped: true };
  }

  if (!Array.isArray(tokens) || tokens.length === 0) {
    return { sent: 0, failed: 0, invalidTokens: [], skipped: true };
  }

  const { title, body, data = {} } = payload || {};
  if (!title && !body) {
    console.warn('⚠️  FCM: empty payload — sendToTokens skipped');
    return { sent: 0, failed: 0, invalidTokens: [], skipped: true };
  }

  // Build the FCM multicast message. data must be string-keyed strings.
  const sanitizedData = {};
  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    sanitizedData[String(k)] = String(v);
  }

  const message = {
    tokens: tokens.filter(Boolean),
    notification: { title: title || '', body: body || '' },
    data: sanitizedData,
    android: {
      priority: 'high',
      notification: {
        channelId: 'p360_push',
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: { sound: 'default', badge: 1 },
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);

    const invalidTokens = [];
    response.responses.forEach((res, idx) => {
      if (!res.success && res.error) {
        const code = res.error.code || '';
        // These errors mean the token is dead and should be removed.
        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-argument') ||
          code.includes('invalid-registration-token')
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    console.log(
      `📤 FCM: ${response.successCount}/${tokens.length} delivered, ` +
      `${invalidTokens.length} invalid tokens to clean up`
    );

    return {
      sent: response.successCount,
      failed: response.failureCount,
      invalidTokens,
      skipped: false,
    };
  } catch (error) {
    console.error('❌ FCM sendToTokens error:', error.message);
    return { sent: 0, failed: tokens.length, invalidTokens: [], skipped: false };
  }
}

// ============================================================================
// 3. SEND TO ACCOUNT (high-level — recommended)
// ============================================================================

/**
 * Sends a push to all active FCM tokens belonging to an account.
 * Automatically cleans up dead tokens from the account.
 *
 * @param {ObjectId|string} accountId
 * @param {object} payload — { title, body, data? }
 *
 * @returns {Promise<{ sent: number, failed: number, skipped: boolean }>}
 */
async function sendToAccount(accountId, payload) {
  if (!initialized) init();

  if (degraded) {
    return { sent: 0, failed: 0, skipped: true };
  }

  if (!accountId) {
    return { sent: 0, failed: 0, skipped: true };
  }

  // Lazy require Account model to avoid circular deps at boot
  const { Account } = require('../models');

  const account = await Account.findById(accountId).lean();
  if (!account || !Array.isArray(account.pushNotificationTokens)) {
    return { sent: 0, failed: 0, skipped: true };
  }

  // Pull only active tokens
  const activeTokens = account.pushNotificationTokens
    .filter(t => t && t.isActive !== false && t.token)
    .map(t => t.token);

  if (activeTokens.length === 0) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const result = await sendToTokens(activeTokens, payload);

  // Auto-cleanup invalid tokens
  if (result.invalidTokens && result.invalidTokens.length > 0) {
    try {
      await Account.updateOne(
        { _id: accountId },
        { $pull: { pushNotificationTokens: { token: { $in: result.invalidTokens } } } }
      );
      console.log(`🧹 FCM: removed ${result.invalidTokens.length} dead tokens from account ${accountId}`);
    } catch (err) {
      console.warn('FCM cleanup failed:', err.message);
    }
  }

  return {
    sent: result.sent,
    failed: result.failed,
    skipped: result.skipped,
  };
}

// ============================================================================
// 4. STATUS / DEBUG
// ============================================================================

function isReady() {
  return initialized && !degraded;
}

function getStatus() {
  return {
    initialized,
    degraded,
    ready: isReady(),
  };
}

module.exports = {
  init,
  sendToTokens,
  sendToAccount,
  isReady,
  getStatus,
};