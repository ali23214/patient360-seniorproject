/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Medication Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at /api/medications
 *
 *  Access pattern:
 *    - GET routes: any authenticated clinical role (doctor, pharmacist, etc.)
 *    - Mutating routes (POST/PATCH/DELETE): admin only
 *
 *  Patient role excluded from all routes — patients see drugs via their
 *  prescriptions, not by browsing the catalog.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

const medicationController = require('../controllers/medicationController');
const { protect, authorize } = require('../middleware/auth');

// ── READ routes — clinical roles only ───────────────────────────────────────
const clinicalRoles = [
  protect,
  authorize('doctor', 'dentist', 'pharmacist', 'lab_technician', 'admin')
];

// Specific routes BEFORE /:id (avoid catching "search" or "categories" as an ID)
router.get('/search', clinicalRoles, medicationController.searchMedications);
router.get('/categories', clinicalRoles, medicationController.getMedicationCategories);

router.get('/', clinicalRoles, medicationController.listMedications);
router.get('/:id', clinicalRoles, medicationController.getMedicationById);

// ── MUTATING routes — admin only ────────────────────────────────────────────
const adminOnly = [protect, authorize('admin')];

router.post('/', adminOnly, medicationController.createMedication);
router.patch('/:id', adminOnly, medicationController.updateMedication);
router.delete('/:id', adminOnly, medicationController.deleteMedication);

module.exports = router;