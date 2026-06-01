/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Dispensing Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at /api/dispensing
 *
 *  All routes require pharmacist or admin role.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

const dispensingController = require('../controllers/dispensingController');
const { protect, authorize } = require('../middleware/auth');

const pharmacistOnly = [protect, authorize('pharmacist', 'admin')];

// ── Dispense Rx ─────────────────────────────────────────────────────────────
router.post('/prescription', pharmacistOnly, dispensingController.dispensePrescription);

// ── OTC dispensing ──────────────────────────────────────────────────────────
router.post('/otc', pharmacistOnly, dispensingController.dispenseOTC);

// ── Inventory restock ───────────────────────────────────────────────────────
router.post('/inventory/restock', pharmacistOnly, dispensingController.addInventoryBatch);

// ── Lookup ──────────────────────────────────────────────────────────────────
router.get('/:id', pharmacistOnly, dispensingController.getDispensingById);

module.exports = router;