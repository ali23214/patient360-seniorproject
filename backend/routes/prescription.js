/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Prescription Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at /api/prescriptions
 *
 *  Routes:
 *    POST   /                            — Doctor creates Rx (doctor, dentist)
 *    GET    /:id                         — Get Rx by ID (multiple roles)
 *    GET    /doctor/:doctorId            — All Rx by a doctor (doctor self, admin)
 *    GET    /patient/:identifier         — All Rx for a patient (multiple roles)
 *    POST   /verify-qr                   — Pharmacist scans QR (pharmacist)
 *    POST   /verify-code                 — Pharmacist types code (pharmacist)
 *    POST   /:id/cancel                  — Doctor cancels Rx (doctor, admin)
 *    POST   /check-interactions          — Pre-flight interaction check (doctor)
 *
 *  Conventions kept:
 *    - Express Router pattern
 *    - protect → authorize chain
 *    - Same shape as routes/auth.js, routes/admin.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

const prescriptionController = require('../controllers/prescriptionController');
const { protect, authorize } = require('../middleware/auth');

// ============================================================================
// PHARMACIST VERIFICATION ROUTES
// ============================================================================
// These come FIRST before /:id to avoid route collision (verify-qr is more
// specific than the dynamic :id parameter)

/**
 * Pharmacist scans QR code on the patient's prescription
 */
router.post(
  '/verify-qr',
  protect,
  authorize('pharmacist', 'admin'),
  prescriptionController.verifyByQRCode
);

/**
 * Pharmacist types the 6-digit verification code (manual fallback)
 */
router.post(
  '/verify-code',
  protect,
  authorize('pharmacist', 'admin'),
  prescriptionController.verifyByCode
);

/**
 * Doctor pre-flight check for drug interactions before creating Rx
 */
router.post(
  '/check-interactions',
  protect,
  authorize('doctor', 'dentist'),
  prescriptionController.checkInteractions
);

// ============================================================================
// LIST ROUTES
// ============================================================================

/**
 * Get all prescriptions written by a specific doctor.
 * Doctors see their own; admins see anyone's.
 */
router.get(
  '/doctor/:doctorId',
  protect,
  authorize('doctor', 'admin'),
  prescriptionController.getDoctorPrescriptions
);

/**
 * Get all prescriptions for a patient (by national ID or CRN).
 * Multiple roles: doctors during a visit, pharmacists when filling,
 * patient viewing their own history.
 */
router.get(
  '/patient/:identifier',
  protect,
  authorize('doctor', 'dentist', 'pharmacist', 'patient', 'admin'),
  prescriptionController.getPatientPrescriptions
);

// ============================================================================
// SINGLE PRESCRIPTION ROUTES
// ============================================================================

/**
 * Doctor creates a new prescription
 */
router.post(
  '/',
  protect,
  authorize('doctor', 'dentist'),
  prescriptionController.createPrescription
);

/**
 * Get single prescription by ID
 */
router.get(
  '/:id',
  protect,
  authorize('doctor', 'dentist', 'pharmacist', 'patient', 'admin'),
  prescriptionController.getPrescriptionById
);

/**
 * Doctor cancels a prescription (only before it's dispensed)
 */
router.post(
  '/:id/cancel',
  protect,
  authorize('doctor', 'dentist', 'admin'),
  prescriptionController.cancelPrescription
);

module.exports = router;