/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Notification Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: notifications
 *  Source of truth: patient360_db_final.js (collection 23)
 *
 *  In-app and push notification queue. One document per notification.
 *
 *  Delivery channels:
 *    push    — Firebase Cloud Messaging to mobile device
 *    in_app  — Notification bell icon in web UI / mobile app
 *    sms     — Phone SMS (future — not currently wired up)
 *
 *  A notification can target multiple channels simultaneously
 *  (e.g. critical lab result → push + in_app + sms).
 *
 *  Deep linking via relatedId + relatedType:
 *    Tapping the notification in the app should navigate to the related
 *    document. relatedType is the collection name (e.g. 'visits',
 *    'lab_tests', 'prescriptions'), relatedId is the document _id.
 *
 *  Lifecycle:
 *    pending → sent → delivered → read
 *    pending → failed (errorMessage stamped)
 *
 *  Expiry:
 *    Time-sensitive notifications (appointment reminders) can have an
 *    expiresAt — past that, the notification is hidden from the UI.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const RECIPIENT_TYPES = [
  'patient', 'doctor', 'admin', 'pharmacist', 'lab_technician', 'dentist',
];

const NOTIFICATION_TYPES = [
  'appointment_reminder',
  'appointment_confirmed',
  'appointment_cancelled',
  'prescription_ready',
  'prescription_dispensed',
  'lab_results_ready',
  'lab_results_critical',
  'emergency_alert',
  'doctor_request_approved',
  'doctor_request_rejected',
  'account_deactivated',
  'payment_due',
  'system_alert',
  'general',
];

const STATUSES = ['pending', 'sent', 'delivered', 'read', 'failed'];

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const CHANNELS = ['push', 'in_app', 'sms'];

// ── Main schema ──────────────────────────────────────────────────────────────

const NotificationSchema = new Schema(
  {
    // ── Recipient ─────────────────────────────────────────────────────────
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'المستلم مطلوب'],
      index: true,
    },
    recipientType: {
      type: String,
      enum: RECIPIENT_TYPES,
      required: [true, 'نوع المستلم مطلوب'],
    },

    // ── Content ───────────────────────────────────────────────────────────
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: [true, 'نوع الإشعار مطلوب'],
    },
    title: {
      type: String,
      required: [true, 'عنوان الإشعار مطلوب'],
      trim: true,
      maxlength: [200, 'العنوان يجب ألا يتجاوز 200 حرف'],
    },
    message: {
      type: String,
      required: [true, 'محتوى الإشعار مطلوب'],
      trim: true,
      maxlength: [1000, 'المحتوى يجب ألا يتجاوز 1000 حرف'],
    },

    // ── Status & priority ─────────────────────────────────────────────────
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },

    // ── Delivery channels ─────────────────────────────────────────────────
    channels: {
      type: [{ type: String, enum: CHANNELS }],
      default: ['in_app'],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 1,
        message: 'يجب تحديد قناة توصيل واحدة على الأقل',
      },
    },

    // ── Deep link target ──────────────────────────────────────────────────
    relatedId: { type: Schema.Types.ObjectId, sparse: true },
    relatedType: {
      type: String,
      trim: true,
      // Collection name — e.g. 'visits', 'lab_tests', 'appointments'
    },

    // ── Lifecycle timestamps ──────────────────────────────────────────────
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    expiresAt: { type: Date, sparse: true },

    // ── Error info (when status=failed) ───────────────────────────────────
    errorMessage: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'notifications',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

NotificationSchema.index(
  { recipientId: 1, createdAt: -1 },
  { name: 'idx_recipient_date' },
);
NotificationSchema.index(
  { recipientId: 1, status: 1 },
  { name: 'idx_recipient_status' },
);
NotificationSchema.index(
  { status: 1, createdAt: -1 },
  { name: 'idx_status_date' },
);
NotificationSchema.index({ type: 1 }, { name: 'idx_type' });
NotificationSchema.index(
  { expiresAt: 1 },
  { sparse: true, name: 'idx_expiry' },
);
NotificationSchema.index(
  { relatedId: 1, relatedType: 1 },
  { sparse: true, name: 'idx_related' },
);

// ── Pre-validate: relatedId requires relatedType (and vice versa) ──────────

NotificationSchema.pre('validate', function ensureRelatedPair(next) {
  const hasId = !!this.relatedId;
  const hasType = !!this.relatedType;
  if (hasId && !hasType) {
    return next(new Error('relatedType مطلوب عند تحديد relatedId'));
  }
  if (hasType && !hasId) {
    return next(new Error('relatedId مطلوب عند تحديد relatedType'));
  }
  return next();
});

// ── Virtuals ────────────────────────────────────────────────────────────────

NotificationSchema.virtual('isRead').get(function () {
  return this.status === 'read';
});

NotificationSchema.virtual('isExpired').get(function () {
  return !!(this.expiresAt && this.expiresAt < new Date());
});

NotificationSchema.virtual('isUrgent').get(function () {
  return this.priority === 'urgent';
});

// ── Static methods ──────────────────────────────────────────────────────────

/**
 * Count unread notifications for a recipient. Used by the bell badge.
 *
 * @param {ObjectId} recipientId
 * @returns {Promise<number>}
 */
NotificationSchema.statics.countUnreadFor = function countUnreadFor(recipientId) {
  return this.countDocuments({
    recipientId,
    status: { $in: ['pending', 'sent', 'delivered'] },
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } },
    ],
  });
};

/**
 * Find unread, non-expired notifications for a recipient, newest first.
 *
 * @param {ObjectId} recipientId
 * @param {number} [limit=20]
 */
NotificationSchema.statics.unreadFor = function unreadFor(recipientId, limit = 20) {
  return this.find({
    recipientId,
    status: { $in: ['pending', 'sent', 'delivered'] },
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Mark this notification as sent (after FCM/in-app dispatch attempt).
 */
NotificationSchema.methods.markSent = async function markSent() {
  this.status = 'sent';
  this.sentAt = new Date();
  return this.save();
};

/**
 * Mark this notification as delivered (FCM delivery receipt or
 * client confirmed receipt).
 */
NotificationSchema.methods.markDelivered = async function markDelivered() {
  this.status = 'delivered';
  this.deliveredAt = new Date();
  return this.save();
};

/**
 * Mark this notification as read (user tapped or scrolled past).
 */
NotificationSchema.methods.markRead = async function markRead() {
  if (this.status === 'read') return this;
  this.status = 'read';
  this.readAt = new Date();
  return this.save();
};

/**
 * Mark this notification as failed with an error message. Used when the
 * FCM dispatcher or SMS gateway returns an error.
 *
 * @param {string} errorMessage
 */
NotificationSchema.methods.markFailed = async function markFailed(errorMessage) {
  this.status = 'failed';
  this.errorMessage = errorMessage || 'Unknown error';
  return this.save();
};

module.exports = mongoose.model('Notification', NotificationSchema);