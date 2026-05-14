/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Audit Log Middleware — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  HTTP-level audit logging middleware. Wraps a route handler and creates
 *  an audit log entry after the response is sent.
 *
 *  This is OPTIONAL middleware. The new controllers (in B1–B6) call
 *  AuditLog.record() directly inside their handlers — that's the preferred
 *  pattern because it gives the controller full context (which entity was
 *  affected, what the operation accomplished, etc.).
 *
 *  This middleware exists for routes that don't need that level of detail
 *  and just want a "this endpoint was called by user X" log. Use sparingly.
 *
 *  Usage:
 *    const { auditLog } = require('../middleware/auditLog');
 *    router.get('/sensitive', protect, auditLog('VIEW_SENSITIVE_DATA'), handler);
 *
 *  ⚠️  Critical fixes vs. previous version:
 *    - patientId → patientPersonId / patientChildId (locked schema requires
 *      the dual-ref pattern, the old field name was silently rejected)
 *    - Resource types are now lowercase (visit, prescription, etc.) to match
 *      the schema documentation. Capitalized values failed validation silently.
 *    - Uses AuditLog.record() static method which never throws —
 *      old AuditLog.create() in a .catch() chain was cluttering error logs.
 *    - Removed the getAuditLogs / getUserAuditLogs functions — those belong
 *      in adminController.js (which already has them).
 *
 *  Conventions kept:
 *    - Non-blocking — never delays the response
 *    - Never throws — audit failures must not break the user's request
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { AuditLog } = require('../models');

// ============================================================================
// HELPER: Map action verb to lowercase resource type
// ============================================================================


/**
 * Infer the resource type from the action verb string.
 * Matches the lowercase enum values the AuditLog schema expects.
 *
 * @param {string} action - e.g., 'CREATE_PRESCRIPTION', 'VIEW_PATIENT'
 * @returns {string} lowercase resource type
 */
function inferResourceType(action) {
  const upper = (action || '').toUpperCase();

  // Order matters — most specific first
  if (upper.includes('DOCTOR_REQUEST')) return 'doctor_request';
  if (upper.includes('PRESCRIPTION'))   return 'prescription';
  if (upper.includes('DISPENSING'))     return 'pharmacy_dispensing';
  if (upper.includes('LAB_TEST'))       return 'lab_test';
  if (upper.includes('LAB_SAMPLE'))     return 'lab_test';
  if (upper.includes('LAB_PDF'))        return 'lab_test';
  if (upper.includes('LAB_RESULTS'))    return 'lab_test';
  if (upper.includes('APPOINTMENT'))    return 'appointment';
  if (upper.includes('SLOT'))           return 'availability_slot';
  if (upper.includes('VISIT'))          return 'visit';
  if (upper.includes('EMERGENCY'))      return 'emergency_report';
  if (upper.includes('AMBULANCE'))      return 'emergency_report';
  if (upper.includes('NOTIFICATION'))   return 'notification';
  if (upper.includes('MEDICATION'))     return 'medication';
  if (upper.includes('INVENTORY'))      return 'pharmacy_inventory';
  if (upper.includes('DOCTOR'))         return 'doctor';
  if (upper.includes('PATIENT'))        return 'patient';
  if (upper.includes('PHARMACY'))       return 'pharmacy';
  if (upper.includes('LABORATORY'))     return 'laboratory';
  if (upper.includes('HOSPITAL'))       return 'hospital';
  if (upper.includes('STATISTICS'))     return 'admin';
  if (upper.includes('AUDIT'))          return 'audit';
  if (upper.includes('LOGIN'))          return 'account';
  if (upper.includes('LOGOUT'))         return 'account';
  if (upper.includes('PASSWORD'))       return 'account';
  if (upper.includes('SIGNUP'))         return 'account';

  return 'other';
}

/**
 * Determine which platform a request came from based on user-agent.
 * Used for audit metadata so admins can see "this was a mobile vs web call".
 */
function inferPlatform(userAgent) {
  if (!userAgent) return 'api';
  const ua = userAgent.toLowerCase();
  if (ua.includes('expo') || ua.includes('reactnative')) return 'mobile_app';
  if (ua.includes('mozilla') || ua.includes('chrome') || ua.includes('safari')) return 'web';
  return 'api';
}

// ============================================================================
// MAIN MIDDLEWARE
// ============================================================================

/**
 * Create an audit log middleware that records this endpoint's invocation.
 *
 * Wraps the response.json() method so the audit entry is created after the
 * response is sent (success or failure both captured).
 *
 * @param {string} action - The action name (uppercase, e.g. 'VIEW_PATIENT')
 * @returns {Function} Express middleware
 *
 * @example
 *   router.get('/patient/:id', protect, auditLog('VIEW_PATIENT'), handler);
 */
exports.auditLog = (action) => {
  return (req, res, next) => {
    // Save the original res.json so we can wrap it
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      // Send the response FIRST so the user isn't blocked by audit logging
      const response = originalJson(body);

      // Build the audit entry
      const success = body && body.success !== false;
      const errorMessage = !success ? (body && body.message) : undefined;

      // Map URL params → dual-ref patient fields
      // Routes can use any of these param names depending on their style
      let patientPersonId;
      let patientChildId;

      if (req.params.patientPersonId) {
        patientPersonId = req.params.patientPersonId;
      } else if (req.params.patientChildId) {
        patientChildId = req.params.patientChildId;
      } else if (req.targetPatient) {
        // Set by routes/patient.js verifyPatientAccess middleware
        patientPersonId = req.targetPatient.patientPersonId;
        patientChildId = req.targetPatient.patientChildId;
      }

      const entry = {
        userId: req.account?._id || req.user?._id,
        userEmail: req.account?.email || req.user?.email,
        userRole: (req.account?.roles || req.user?.roles || []).join(','),
        action,
        description: `${action} by ${req.account?.email || 'anonymous'}`,
        resourceType: inferResourceType(action),
        resourceId: req.params.id || undefined,
        patientPersonId,
        patientChildId,
        ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('user-agent'),
        platform: inferPlatform(req.get('user-agent')),
        success,
        errorMessage,
        metadata: {
          method: req.method,
          endpoint: req.originalUrl,
          query: req.query,
          // Don't log body — could contain passwords, OTPs, sensitive data
          paramKeys: Object.keys(req.params)
        }
      };

      // Use the model's record() helper — never throws, fire and forget
      AuditLog.record(entry);

      return response;
    };

    return next();
  };
};

// ============================================================================
// EXPORT
// ============================================================================

// Default export for backwards compatibility with code that does
// `const auditLog = require('../middleware/auditLog')`
module.exports.default = exports.auditLog;