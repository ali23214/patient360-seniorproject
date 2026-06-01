/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  AuditLog Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: audit_logs (CAPPED)
 *  Source of truth: patient360_db_final.js (collection 21)
 *
 *  Security audit trail. Records every significant system action for
 *  compliance and forensic review.
 *
 *  ───────────────────────────────────────────────────────────────────────
 *  ⚠️  IMPORTANT — Capped collection constraints:
 *
 *  This collection is CAPPED at 100MB / 1,000,000 documents. MongoDB
 *  automatically removes the oldest documents when the cap is reached.
 *  Capped collections have these constraints:
 *    • Cannot remove documents (only truncated automatically by cap)
 *    • Cannot update documents in a way that grows their size
 *    • Documents are stored in insertion order (no re-ordering)
 *
 *  Reference: https://www.mongodb.com/docs/manual/core/capped-collections/
 *
 *  Implication: never attempt to update an AuditLog document. If you need
 *  to record additional context, insert a new related entry instead.
 *  ───────────────────────────────────────────────────────────────────────
 *
 *  Common action strings (free-form for forward compatibility):
 *    LOGIN, LOGOUT, LOGIN_FAILED, PASSWORD_RESET,
 *    VIEW_PATIENT, CREATE_VISIT, UPDATE_VISIT,
 *    CREATE_PRESCRIPTION, DISPENSE_MEDICATION,
 *    UPLOAD_LAB_RESULT, VIEW_LAB_RESULT,
 *    APPROVE_DOCTOR_REQUEST, REJECT_DOCTOR_REQUEST,
 *    DEACTIVATE_ACCOUNT, ACTIVATE_ACCOUNT,
 *    EMERGENCY_REPORT_FILED, AMBULANCE_DISPATCHED
 *
 *  The capped collection is created via the createCollection call in the
 *  init script — Mongoose's autoCreate=false should be set when this model
 *  is registered to avoid Mongoose trying to recreate it as non-capped.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const PLATFORMS = ['web', 'mobile_app', 'api'];

// Capped collection size & limits (matches init script)
const CAPPED_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const CAPPED_MAX_DOCS = 1_000_000;            // 1 million records

// ── Main schema ──────────────────────────────────────────────────────────────

const AuditLogSchema = new Schema(
  {
    // ── Who ───────────────────────────────────────────────────────────────
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'userId مطلوب'],
    },
    userEmail: { type: String, trim: true },
    userRole: { type: String, trim: true },

    // ── What ──────────────────────────────────────────────────────────────
    action: {
      type: String,
      required: [true, 'نوع الحدث مطلوب'],
      trim: true,
      uppercase: true,
    },
    description: { type: String, trim: true },

    // ── On what resource ──────────────────────────────────────────────────
    resourceType: {
      type: String,
      trim: true,
      // e.g. 'visit', 'prescription', 'patient', 'doctor'
    },
    resourceId: { type: Schema.Types.ObjectId },

    // ── Patient context (for patient-related actions) ─────────────────────
    patientPersonId: { type: Schema.Types.ObjectId, ref: 'Person' },
    patientChildId: { type: Schema.Types.ObjectId, ref: 'Children' },

    // ── Where ─────────────────────────────────────────────────────────────
    ipAddress: {
      type: String,
      required: [true, 'IP address مطلوب'],
      trim: true,
    },
    userAgent: { type: String, trim: true },
    platform: { type: String, enum: PLATFORMS, default: 'web' },

    // ── Outcome ───────────────────────────────────────────────────────────
    success: { type: Boolean, required: true, default: true },
    errorMessage: { type: String, trim: true },

    // ── When ──────────────────────────────────────────────────────────────
    timestamp: { type: Date, default: Date.now, required: true },

    // ── Free-form context bag ─────────────────────────────────────────────
    metadata: {
      type: Schema.Types.Mixed,
      // Anything additional — varies per action type
    },
  },
  {
    // Disable timestamps — we have our own `timestamp` field
    timestamps: false,

    // Use the existing capped collection (do NOT auto-create it)
    autoCreate: false,
    collection: 'audit_logs',

    // Capped metadata for documentation / reference
    capped: {
      size: CAPPED_SIZE_BYTES,
      max: CAPPED_MAX_DOCS,
    },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

AuditLogSchema.index({ userId: 1, timestamp: -1 }, { name: 'idx_user_time' });
AuditLogSchema.index({ action: 1, timestamp: -1 }, { name: 'idx_action_time' });
AuditLogSchema.index(
  { resourceType: 1, resourceId: 1 },
  { name: 'idx_resource' },
);
AuditLogSchema.index(
  { patientPersonId: 1, timestamp: -1 },
  { name: 'idx_patient_adult_time' },
);
AuditLogSchema.index(
  { patientChildId: 1, timestamp: -1 },
  { name: 'idx_patient_child_time' },
);
AuditLogSchema.index({ timestamp: -1 }, { name: 'idx_time_desc' });
AuditLogSchema.index({ success: 1 }, { name: 'idx_success' });
AuditLogSchema.index({ ipAddress: 1 }, { name: 'idx_ip' });

// ── Disable updates (capped collection constraint) ──────────────────────────

/**
 * Mongoose hook to refuse update operations on AuditLog. Capped collections
 * cannot accept document updates that grow the document, and audit logs
 * should be immutable by design anyway.
 */
['updateOne', 'updateMany', 'findOneAndUpdate', 'findByIdAndUpdate'].forEach((op) => {
  AuditLogSchema.pre(op, function blockUpdates(next) {
    next(new Error('AuditLog documents are immutable. Insert a new entry instead.'));
  });
});

// ── Static helpers ──────────────────────────────────────────────────────────

/**
 * Convenience method for logging an action. Used by middleware/controllers.
 * Always succeeds even if logging fails (we don't want audit failures to
 * break user requests) — failures are caught and emitted on stderr.
 *
 * @param {object} data
 * @param {ObjectId} data.userId
 * @param {string} data.action
 * @param {string} [data.description]
 * @param {string} data.ipAddress
 * @param {boolean} [data.success=true]
 * @param {object} [data.metadata]
 */
AuditLogSchema.statics.record = async function record(data) {
  try {
    await this.create({
      ...data,
      timestamp: new Date(),
      success: data.success !== false,
    });
  } catch (err) {
    // Never throw from audit logging — emit and move on
    // eslint-disable-next-line no-console
    console.error('[AuditLog] failed to record:', err.message);
  }
};

/**
 * Query helper: find recent failed actions (potential security incidents).
 *
 * @param {number} [hours=24] - look-back window
 */
AuditLogSchema.statics.recentFailures = function recentFailures(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({
    success: false,
    timestamp: { $gte: since },
  }).sort({ timestamp: -1 });
};

module.exports = mongoose.model('AuditLog', AuditLogSchema);