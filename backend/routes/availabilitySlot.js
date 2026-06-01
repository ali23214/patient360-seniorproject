/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Availability Slot Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at /api/slots
 *
 *  /available is PUBLIC (no auth) — patients browse before logging in.
 *  Other routes require provider role.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

const slotController = require('../controllers/availabilitySlotController');
const { protect, authorize } = require('../middleware/auth');

// ── Public — patient browses available slots ────────────────────────────────
router.get('/available', slotController.getAvailableSlots);

// ── Provider routes (auth required) ─────────────────────────────────────────
const providerRoles = [protect, authorize('doctor', 'dentist', 'lab_technician', 'admin')];

router.get('/mine', protect, slotController.getMySlots);
router.post('/', providerRoles, slotController.createSlot);
router.post('/generate', providerRoles, slotController.generateSlots);
router.post('/:id/block', providerRoles, slotController.blockSlot);
router.post('/:id/unblock', providerRoles, slotController.unblockSlot);
router.delete('/:id', providerRoles, slotController.deleteSlot);

module.exports = router;