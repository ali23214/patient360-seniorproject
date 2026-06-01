/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Drug Risk Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at /api/drug-risk
 *
 *  Routes:
 *    POST  /check                  — patient self-inquiry about a drug
 *    POST  /check-for-patient      — doctor/dentist screens a drug against a patient
 *    GET   /my-history             — patient's check history (paginated)
 *    POST  /:id/acknowledge        — doctor/dentist confirms an override after warning
 *    GET   /health                 — probe FastAPI reachability
 *
 *  Auth model:
 *    All routes require a valid JWT (protect middleware).
 *    Role gates:
 *      - /check + /my-history             → patient only
 *      - /check-for-patient + acknowledge → doctor + dentist
 *        (both write prescriptions and need allergy/interaction screening)
 *      - /health                          → all clinical staff + admin (debugging)
 *
 *  Why /check is patient-only:
 *    Clinical staff should use /check-for-patient (which includes a patient
 *    identifier) so the check is correctly attributed to the prescriber and
 *    linked to the right patient — never accidentally to the prescriber's own
 *    record.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../../middleware/auth');
const drugRiskController = require('../../controllers/drugRisk/drugRiskController');

// ── Patient endpoints ──────────────────────────────────────────────────

router.post(
  '/check',
  protect,
  authorize('patient'),
  drugRiskController.checkForSelf
);

router.get(
  '/my-history',
  protect,
  authorize('patient'),
  drugRiskController.myHistory
);

// ── Prescriber endpoints (doctor + dentist) ────────────────────────────
// Dentists also write prescriptions in this platform (DoctorDashboard is
// shared between both roles), so they need the same drug-risk screening
// capability before adding a medication to a visit.

router.post(
  '/check-for-patient',
  protect,
  authorize('doctor', 'dentist'),
  drugRiskController.checkForPatient
);

router.post(
  '/:id/acknowledge',
  protect,
  authorize('doctor', 'dentist'),
  drugRiskController.acknowledgeOverride
);

// ── Ops / debugging (open to clinical staff + admin) ───────────────────

router.get(
  '/health',
  protect,
  authorize('patient', 'doctor', 'dentist', 'admin'),
  drugRiskController.health
);

module.exports = router;
