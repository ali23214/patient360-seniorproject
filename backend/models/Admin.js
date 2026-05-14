/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Admin Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: admins
 *  Source of truth: patient360_db_final.js (collection 09)
 *
 *  Admin user profile. The `adminLevel` field is the primary authorization
 *  gate used by middleware:
 *    • super_admin → can do everything (deactivate accounts, view audit logs,
 *                    manage other admins)
 *    • admin       → standard admin (approve doctor requests, manage hospitals)
 *    • moderator   → read-only + can flag/approve reviews
 *
 *  The `permissions` array is for future fine-grained control (RBAC) —
 *  e.g. ['manage_doctors', 'view_audit_logs', 'approve_reviews'].
 *  Until that's wired up, controllers should rely on adminLevel.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const ADMIN_LEVELS = ['super_admin', 'admin', 'moderator'];

// Known permission strings for IDE autocomplete + future RBAC enforcement.
// New permissions can be added here as features ship.
const KNOWN_PERMISSIONS = [
  'manage_doctors',
  'manage_doctor_requests',
  'manage_patients',
  'manage_hospitals',
  'manage_pharmacies',
  'manage_laboratories',
  'view_audit_logs',
  'view_emergency_reports',
  'approve_reviews',
  'manage_admins',
  'export_data',
];

// ── Main schema ──────────────────────────────────────────────────────────────

const AdminSchema = new Schema(
  {
    // ── Identity link ─────────────────────────────────────────────────────
    personId: {
      type: Schema.Types.ObjectId,
      ref: 'Person',
      required: [true, 'معرّف الشخص مطلوب'],
      unique: true,
    },

    // ── Authorization level ───────────────────────────────────────────────
    adminLevel: {
      type: String,
      enum: { values: ADMIN_LEVELS, message: 'مستوى الإدارة غير صالح' },
      required: [true, 'مستوى الإدارة مطلوب'],
      default: 'admin',
      index: true,
    },

    // ── Granular permissions (future RBAC) ────────────────────────────────
    permissions: {
      type: [String],
      default: [],
      validate: {
        // Allow unknown values (forward compatibility) but log a warning
        // via the controller layer if an unrecognized permission is set.
        validator: (arr) => Array.isArray(arr),
        message: 'الصلاحيات يجب أن تكون مصفوفة',
      },
    },

    // ── Department (optional — e.g. "Ministry of Health - Damascus") ──────
    department: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: 'admins',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Static export of the known permissions list ─────────────────────────────
// Controllers and middleware can import this for validation:
//   const { KNOWN_PERMISSIONS } = require('../models/Admin');

AdminSchema.statics.KNOWN_PERMISSIONS = KNOWN_PERMISSIONS;

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Check if this admin can perform a given action. Super admins always pass.
 * Non-super admins must have the specific permission in their permissions[].
 *
 * @param {string} permission - one of KNOWN_PERMISSIONS (forward-compatible)
 * @returns {boolean}
 */
AdminSchema.methods.can = function can(permission) {
  if (this.adminLevel === 'super_admin') return true;
  return Array.isArray(this.permissions) && this.permissions.includes(permission);
};

/**
 * Convenience predicate for the most common middleware check.
 */
AdminSchema.methods.isSuperAdmin = function isSuperAdmin() {
  return this.adminLevel === 'super_admin';
};

module.exports = mongoose.model('Admin', AdminSchema);