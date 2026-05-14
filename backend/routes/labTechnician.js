/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Lab Technician Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at /api/lab-technician
 *
 *  All routes require lab_technician role (or admin).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

const labTechnicianController = require('../controllers/labTechnicianController');
const { protect, authorize } = require('../middleware/auth');

const labTechOnly = [protect, authorize('lab_technician', 'admin')];

// ── Profile & dashboard ─────────────────────────────────────────────────────
router.get('/me', labTechOnly, labTechnicianController.getMyProfile);
router.get('/dashboard-stats', labTechOnly, labTechnicianController.getMyDashboardStats);

// ── Work queues ─────────────────────────────────────────────────────────────
router.get('/pending-orders', labTechOnly, labTechnicianController.getLabPendingOrders);
router.get('/today-schedule', labTechOnly, labTechnicianController.getLabTodaySchedule);

// ── History ─────────────────────────────────────────────────────────────────
router.get('/tests-performed', labTechOnly, labTechnicianController.getMyTestsPerformed);

module.exports = router;