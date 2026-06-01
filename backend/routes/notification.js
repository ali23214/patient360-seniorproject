/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Notification Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  This file exports TWO routers — mount each on its own base path
 *  in backend/index.js:
 *
 *    const notifRoutes = require('./routes/notification');
 *
 *    app.use('/api/notifications', notifRoutes.notificationsRouter);
 *    app.use('/api/auth',          notifRoutes.authFcmRouter);
 *
 *  IMPORTANT:
 *    The /api/patient/notifications/* routes already exist in patient.js
 *    and are NOT re-implemented here to avoid path conflicts. patient.js
 *    has the canonical implementations.
 *
 *  Endpoint table:
 *
 *    Primary (canonical) paths:
 *      GET    /api/notifications                     → list
 *      GET    /api/notifications/unread-count        → badge count
 *      POST   /api/notifications/read-all            → mark all read
 *      POST   /api/notifications/:id/read            → mark one read
 *      POST   /api/notifications/push-token          → register FCM
 *      DELETE /api/notifications/push-token          → unregister FCM
 *      POST   /api/notifications/dispatch/critical-labs (admin only)
 *
 *    Mobile-compatible aliases (for /api/auth/fcm-token):
 *      POST   /api/auth/fcm-token                    → register FCM
 *      DELETE /api/auth/fcm-token                    → unregister FCM
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');

const notificationController = require('../controllers/notificationController');
const { protect, authorize }  = require('../middleware/auth');

// ════════════════════════════════════════════════════════════════════════════
// ROUTER 1 — Primary /api/notifications endpoints
// ════════════════════════════════════════════════════════════════════════════

const notificationsRouter = express.Router();

// ── Notification list & unread count ────────────────────────────────────────
notificationsRouter.get('/',              protect, notificationController.getMyNotifications);
notificationsRouter.get('/unread-count',  protect, notificationController.getUnreadCount);

// ── Mark as read ────────────────────────────────────────────────────────────
notificationsRouter.post('/read-all',     protect, notificationController.markAllAsRead);
notificationsRouter.post('/:id/read',     protect, notificationController.markAsRead);

// ── FCM push token management ───────────────────────────────────────────────
notificationsRouter.post('/push-token',   protect, notificationController.registerPushToken);
notificationsRouter.delete('/push-token', protect, notificationController.removePushToken);

// ── Manual dispatch (admin testing) ─────────────────────────────────────────
notificationsRouter.post('/dispatch/critical-labs',
  protect,
  authorize('admin'),
  notificationController.dispatchCriticalLabResults
);

// ════════════════════════════════════════════════════════════════════════════
// ROUTER 2 — Mobile-compatible aliases under /api/auth
// ════════════════════════════════════════════════════════════════════════════
// The mobile app's fcm_token_repository.dart targets /api/auth/fcm-token.
// We expose the SAME handlers under this path so no mobile code changes
// are needed.

const authFcmRouter = express.Router();

authFcmRouter.post('/fcm-token',   protect, notificationController.registerPushToken);
authFcmRouter.delete('/fcm-token', protect, notificationController.removePushToken);

// ════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════════
// Export both routers as named properties of the module. The main
// router is also exported as `module.exports` itself so legacy code
// using `require('./routes/notification')` directly still works.

module.exports = notificationsRouter;
module.exports.notificationsRouter   = notificationsRouter;
module.exports.authFcmRouter         = authFcmRouter;