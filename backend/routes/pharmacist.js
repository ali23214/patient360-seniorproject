/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Pharmacist Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at /api/pharmacist
 *
 *  All routes require pharmacist role (or admin).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

const pharmacistController = require('../controllers/pharmacistController');
const { protect, authorize } = require('../middleware/auth');

// All routes require pharmacist or admin
const pharmacistOnly = [protect, authorize('pharmacist', 'admin')];

// ── Profile & dashboard ─────────────────────────────────────────────────────
router.get('/me', pharmacistOnly, pharmacistController.getMyProfile);
router.get('/dashboard-stats', pharmacistOnly, pharmacistController.getMyDashboardStats);
router.get('/dashboard/kpis', pharmacistOnly, pharmacistController.getDashboardKPIs);

// ── Notifications ───────────────────────────────────────────────────────────
router.get('/notifications', pharmacistOnly, pharmacistController.getNotifications);
router.patch('/notifications/:id/read', pharmacistOnly, pharmacistController.markNotificationRead);

// ── Patient lookup (for prescription dispensing workflow) ──────────────────
router.get('/patient/:nationalId', pharmacistOnly, pharmacistController.lookupPatient);

// ── Prescription verification + dispensing ─────────────────────────────────
router.post('/prescriptions/:id/verify', pharmacistOnly, pharmacistController.verifyPrescription);
router.post('/prescriptions/dispense', pharmacistOnly, pharmacistController.dispensePrescription);
// Alias — PharmacistDashboard.jsx uses the shorter /dispense path
router.post('/dispense', pharmacistOnly, pharmacistController.dispensePrescription);

// ── OTC dispensing (no prescription) ───────────────────────────────────────
router.post('/otc', pharmacistOnly, pharmacistController.dispenseOTC);
// Alias — PharmacistDashboard.jsx uses /dispense-otc
router.post('/dispense-otc', pharmacistOnly, pharmacistController.dispenseOTC);

// ── Inventory ───────────────────────────────────────────────────────────────
router.get('/inventory', pharmacistOnly, pharmacistController.getMyPharmacyInventory);
router.get('/alerts/low-stock', pharmacistOnly, pharmacistController.getLowStockAlerts);
router.get('/alerts/expiry', pharmacistOnly, pharmacistController.getExpiryAlerts);

// ── Dispensing history ──────────────────────────────────────────────────────
router.get('/dispensing-history', pharmacistOnly, pharmacistController.getMyDispensingHistory);

// ── Medication catalog search (for OTC) ─────────────────────────────────────
router.get('/medications/search', pharmacistOnly, pharmacistController.searchMedications);

module.exports = router;