/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Notification Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  In-app notifications + FCM push token management + FCM dispatch.
 *  Mounted at /api/notifications (plus aliases at /api/auth and /api/patient).
 *
 *  Architecture:
 *    - Notifications are persisted in the `notifications` collection.
 *    - Each notification has channels: push, in_app, sms.
 *    - "in_app" delivery happens by the client polling/WebSocket-ing this API.
 *    - "push" delivery is handled by services/fcmService.js — invoked
 *      automatically inside createNotification() when channels includes 'push'.
 *    - "sms" delivery is still stubbed (no SMS gateway integration yet).
 *
 *  CENTRAL ENTRY POINT for other controllers:
 *      const { createNotification } = require('./notificationController');
 *      await createNotification({
 *        recipientAccountId: doctorAccount._id,
 *        recipientType: 'doctor',
 *        notificationType: 'lab_results_critical',
 *        title: 'نتيجة فحص حرجة',
 *        body: 'رقم الفحص LAB-20260514-00012',
 *        channels: ['push', 'in_app'],
 *        relatedType: 'lab_test',
 *        relatedId: test._id,
 *        deepLinkRoute: '/lab',
 *        priority: 'urgent'
 *      });
 *
 *  Functions:
 *    1. getMyNotifications         — List notifications for current user
 *    2. getUnreadCount             — Quick badge count
 *    3. markAsRead                 — Single notification → read
 *    4. markAllAsRead              — All for current user → read
 *    5. registerPushToken          — Add FCM token to account
 *    6. removePushToken            — Remove FCM token
 *    7. createNotification         — Internal helper (DB + FCM push)
 *    8. dispatchCriticalLabResults — Service function (also exposed as endpoint)
 *
 *  Conventions kept:
 *    - Arabic error messages, emoji-marked console logs
 *    - { success, message, [data] } response shape
 *    - Try/catch in every async function
 * ═══════════════════════════════════════════════════════════════════════════
 */

const {
  Notification, Account, LabTest, Doctor, AuditLog
} = require('../models');

const fcmService = require('../services/fcmService');

// ============================================================================
// HELPER: Build the "recipient" query for the current user
// ============================================================================

/**
 * Notifications can target patients OR clinical staff. The recipient is
 * identified by either accountId or by personId/childId.
 */
function buildRecipientQuery(account) {
  return {
    $or: [
      { recipientAccountId: account._id },
      { recipientPersonId: account.personId },
      { recipientChildId: account.childId }
    ].filter(clause => Object.values(clause)[0] !== undefined)
  };
}

// ============================================================================
// 1. GET MY NOTIFICATIONS
// ============================================================================

/**
 * @route   GET /api/notifications
 * @desc    List notifications for current user, paginated
 * @access  Private (any authenticated user)
 *
 * Query: page, limit, unreadOnly (true/false), type
 */
exports.getMyNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly, type } = req.query;
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);

    const recipientQuery = buildRecipientQuery(req.account);
    const query = { ...recipientQuery };
    if (unreadOnly === 'true') query.status = { $ne: 'read' };
    if (type) query.notificationType = type;

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      Notification.countDocuments(query)
    ]);

    return res.json({
      success: true,
      count: total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
      notifications
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الإشعارات'
    });
  }
};

// ============================================================================
// 2. GET UNREAD COUNT (badge)
// ============================================================================

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Quick count for showing a notification badge
 * @access  Private
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const recipientQuery = buildRecipientQuery(req.account);
    const count = await Notification.countDocuments({
      ...recipientQuery,
      status: { $ne: 'read' }
    });

    return res.json({
      success: true,
      unreadCount: count
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ'
    });
  }
};

// ============================================================================
// 3. MARK AS READ (single)
// ============================================================================

/**
 * @route   POST /api/notifications/:id/read
 * @desc    Mark a single notification as read
 * @access  Private (recipient only)
 */
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'الإشعار غير موجود'
      });
    }

    // Permission check — recipient only
    const isRecipient =
      (notification.recipientAccountId
        && String(notification.recipientAccountId) === String(req.account._id))
      || (notification.recipientPersonId
        && String(notification.recipientPersonId) === String(req.account.personId))
      || (notification.recipientChildId
        && String(notification.recipientChildId) === String(req.account.childId));

    if (!isRecipient) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية لقراءة هذا الإشعار'
      });
    }

    // Use the model method if it exists, else fallback to direct update.
    if (typeof notification.markRead === 'function') {
      await notification.markRead();
    } else {
      notification.status = 'read';
      notification.readAt = new Date();
      await notification.save();
    }

    return res.json({
      success: true,
      message: 'تم تحديد الإشعار كمقروء'
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ'
    });
  }
};

// ============================================================================
// 4. MARK ALL AS READ
// ============================================================================

/**
 * @route   POST /api/notifications/read-all
 * @desc    Mark all unread notifications for current user as read
 * @access  Private
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const recipientQuery = buildRecipientQuery(req.account);

    const result = await Notification.updateMany(
      { ...recipientQuery, status: { $ne: 'read' } },
      {
        $set: {
          status: 'read',
          readAt: new Date()
        }
      }
    );

    return res.json({
      success: true,
      message: `تم تحديد ${result.modifiedCount} إشعار كمقروء`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Mark all read error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ'
    });
  }
};

// ============================================================================
// 5. REGISTER FCM PUSH TOKEN
// ============================================================================

/**
 * @route   POST /api/notifications/push-token
 * @route   POST /api/auth/fcm-token   (mobile-compatible alias)
 * @desc    Mobile app calls this on login to register its FCM device token
 * @access  Private
 *
 * Body: { token: string, platform?: 'ios' | 'android' | 'web',
 *         deviceName?: string, appVersion?: string }
 */
exports.registerPushToken = async (req, res) => {
  try {
    const { token, platform, deviceName, appVersion } = req.body;

    if (!token || token.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'token مطلوب'
      });
    }

    const account = await Account.findById(req.account._id);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'الحساب غير موجود'
      });
    }

    // Prefer model method if it exists (preserves existing behavior).
     if (typeof account.addPushToken === 'function') {
      await account.addPushToken({ token: token.trim(), platform, deviceName, appVersion });
    } else {
      // Fallback: manual upsert into pushNotificationTokens[] array.
      const cleanToken = token.trim();
      const existingIdx = (account.pushNotificationTokens || [])
        .findIndex(t => t.token === cleanToken);

      if (existingIdx >= 0) {
        // Refresh existing entry
        account.pushNotificationTokens[existingIdx].lastUsedAt = new Date();
        account.pushNotificationTokens[existingIdx].isActive = true;
        if (platform)    account.pushNotificationTokens[existingIdx].platform = platform;
        if (deviceName)  account.pushNotificationTokens[existingIdx].deviceName = deviceName;
        if (appVersion)  account.pushNotificationTokens[existingIdx].appVersion = appVersion;
      } else {
        // Add new entry
        account.pushNotificationTokens = account.pushNotificationTokens || [];
        account.pushNotificationTokens.push({
          token: cleanToken,
          platform: platform || 'android',
          deviceName: deviceName || '',
          appVersion: appVersion || '',
          addedAt:   new Date(),
          lastUsedAt: new Date(),
          isActive:  true
        });
      }
      await account.save();
    }

    console.log(`✅ FCM token registered for account ${account._id} (platform: ${platform || 'unknown'})`);

    return res.json({
      success: true,
      message: 'تم تسجيل رمز الإشعارات'
    });
  } catch (error) {
    console.error('Register push token error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تسجيل رمز الإشعارات'
    });
  }
};

// ============================================================================
// 6. REMOVE FCM PUSH TOKEN
// ============================================================================

/**
 * @route   DELETE /api/notifications/push-token
 * @route   DELETE /api/auth/fcm-token   (mobile-compatible alias)
 * @desc    Mobile app calls this on logout or when FCM rotates the token
 * @access  Private
 *
 * Body: { token: string }
 */
exports.removePushToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'token مطلوب'
      });
    }

    const account = await Account.findById(req.account._id);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'الحساب غير موجود'
      });
    }

    const before = account.pushNotificationTokens?.length || 0;
    account.pushNotificationTokens = (account.pushNotificationTokens || [])
      .filter(t => t.token !== token);
    await account.save();
    const after = account.pushNotificationTokens.length;

    console.log(`🗑️  FCM token removed from account ${account._id} (${before - after} removed)`);

    return res.json({
      success: true,
      message: 'تم حذف رمز الإشعارات',
      removed: before - after
    });
  } catch (error) {
    console.error('Remove push token error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ'
    });
  }
};

// ============================================================================
// 7. CREATE NOTIFICATION — internal helper (DB + FCM push)
// ============================================================================

/**
 * Central function for creating a notification AND dispatching the push.
 * Call from any controller that needs to notify a user.
 *
 *   const { createNotification } = require('./notificationController');
 *
 *   await createNotification({
 *     recipientAccountId: doctorAccount._id,    // ← preferred
 *     recipientPersonId: doctorAccount.personId, // ← optional fallback
 *     recipientType: 'doctor',
 *     notificationType: 'lab_results_critical',
 *     title: 'نتيجة فحص حرجة',
 *     body: 'رقم الفحص LAB-20260514-00012',
 *     channels: ['push', 'in_app'],
 *     relatedType: 'lab_test',
 *     relatedId: test._id,
 *     deepLinkRoute: '/lab',       // ← used by mobile to navigate on tap
 *     priority: 'urgent'
 *   });
 *
 * @param {object} options — see jsdoc above for the full shape
 * @returns {Promise<{ notification: object, pushResult: object }>}
 */
async function createNotification(options) {
  if (!options || (!options.recipientAccountId && !options.recipientPersonId && !options.recipientChildId)) {
    console.warn('⚠️  createNotification: missing recipient — skipped');
    return { notification: null, pushResult: { sent: 0, failed: 0, skipped: true } };
  }

  const {
    recipientAccountId,
    recipientPersonId,
    recipientChildId,
    recipientType,
    notificationType,
    title,
    titleArabic,
    body,
    channels = ['push', 'in_app'],
    relatedType,
    relatedId,
    deepLinkRoute,
    priority = 'normal',
    metadata = {}
  } = options;

  // ── 1) Save notification record in DB ─────────────────────────────────────
  let notification;
  try {
    notification = await Notification.create({
      recipientAccountId,
      recipientPersonId,
      recipientChildId,
      recipientType,
      notificationType,
      title,
      titleArabic: titleArabic || title,
      body,
      channels,
      status: 'pending',
      relatedType,
      relatedId,
      priority,
      metadata
    });
  } catch (error) {
    console.error('❌ createNotification: DB save failed', error);
    return { notification: null, pushResult: { sent: 0, failed: 0, skipped: true } };
  }

  // ── 2) Dispatch push if 'push' is in channels ─────────────────────────────
  let pushResult = { sent: 0, failed: 0, skipped: true };

  if (Array.isArray(channels) && channels.includes('push')) {
    try {
      // Resolve target accountId — prefer direct, else lookup by personId
      let targetAccountId = recipientAccountId;
      if (!targetAccountId && recipientPersonId) {
        const acc = await Account.findOne({ personId: recipientPersonId }).select('_id').lean();
        targetAccountId = acc?._id;
      }
      if (!targetAccountId && recipientChildId) {
        const acc = await Account.findOne({ childId: recipientChildId }).select('_id').lean();
        targetAccountId = acc?._id;
      }

      if (targetAccountId) {
        const pushData = {
          notificationId: String(notification._id),
          notificationType: notificationType || '',
          relatedType:      relatedType || '',
          relatedId:        relatedId ? String(relatedId) : '',
        };
        if (deepLinkRoute) pushData.route = deepLinkRoute;

        pushResult = await fcmService.sendToAccount(targetAccountId, {
          title: titleArabic || title || 'إشعار',
          body:  body || '',
          data:  pushData,
        });

        // Reflect push delivery state back on the notification.
        if (!pushResult.skipped) {
          notification.status = pushResult.sent > 0 ? 'sent' : 'failed';
          notification.sentAt = new Date();
          if (pushResult.sent === 0 && pushResult.failed > 0) {
            notification.errorMessage = 'فشل إرسال الإشعار الفوري';
          }
          await notification.save();
        }
      }
    } catch (error) {
      console.error('❌ createNotification: push dispatch failed', error.message);
      // Notification is still saved — push failure is non-fatal.
    }
  }

  return { notification, pushResult };
}

// Expose for other controllers to import directly.
exports.createNotification = createNotification;

// ============================================================================
// 8. DISPATCHER: critical lab results
// ============================================================================

/**
 * Service function: scan for completed-but-unviewed critical lab tests and
 * create notifications (with push) for the doctors who ordered them.
 *
 * Idempotent: uses notification.relatedId to avoid duplicate notifications
 * for the same test.
 *
 * @returns {Promise<{ created: number, skipped: number, pushedSuccessfully: number }>}
 */
async function dispatchCriticalLabResults() {
  console.log('🔄 Dispatching critical lab result notifications...');

  const tests = await LabTest.find({
    status: 'completed',
    isCritical: true,
    isViewedByDoctor: false
  })
    .populate('orderedBy', 'personId')
    .lean();

  let created = 0;
  let skipped = 0;
  let pushedSuccessfully = 0;

  for (const test of tests) {
    if (!test.orderedBy?.personId) {
      skipped += 1;
      continue;
    }

    // Idempotency check
    const existing = await Notification.findOne({
      notificationType: 'lab_results_critical',
      relatedType: 'lab_test',
      relatedId: test._id
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const doctorAccount = await Account.findOne({
      personId: test.orderedBy.personId
    }).select('_id personId').lean();

    if (!doctorAccount) {
      skipped += 1;
      continue;
    }

    const result = await createNotification({
      recipientAccountId: doctorAccount._id,
      recipientPersonId:  doctorAccount.personId,
      recipientType:      'doctor',
      notificationType:   'lab_results_critical',
      title:        'نتيجة فحص حرجة',
      titleArabic:  'نتيجة فحص حرجة',
      body:         `يوجد نتيجة فحص حرجة للمراجعة — رقم الفحص ${test.testNumber}`,
      channels:     ['push', 'in_app'],
      relatedType:  'lab_test',
      relatedId:    test._id,
      deepLinkRoute:'/lab',
      priority:     'urgent'
    });

    if (result.notification) {
      created += 1;
      if (result.pushResult && result.pushResult.sent > 0) {
        pushedSuccessfully += 1;
      }
    }
  }

  console.log(
    `✅ Dispatch done: ${created} created, ${pushedSuccessfully} pushed, ${skipped} skipped`
  );
  return { created, skipped, pushedSuccessfully };
}

// Expose the service function as a controller for manual triggering
exports.dispatchCriticalLabResults = async (req, res) => {
  try {
    const result = await dispatchCriticalLabResults();
    return res.json({
      success: true,
      message: `تم إرسال ${result.created} إشعار`,
      ...result
    });
  } catch (error) {
    console.error('Dispatch error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إرسال الإشعارات'
    });
  }
};

// Also export the raw service function for other internal callers
exports._dispatchCriticalLabResults = dispatchCriticalLabResults;