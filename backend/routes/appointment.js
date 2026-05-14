/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Appointment Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mounted at /api/appointments
 *
 *  Most routes require patient role (booking) or provider role (managing).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

const appointmentController = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/auth');

// ── Patient-side routes ─────────────────────────────────────────────────────
router.post('/',
  protect,
  authorize('patient'),
  appointmentController.bookAppointment
);

router.get('/mine',
  protect,
  authorize('patient'),
  appointmentController.getMyAppointments
);

// ── Provider-side schedule view ─────────────────────────────────────────────
router.get('/provider-schedule',
  protect,
  authorize('doctor', 'dentist', 'lab_technician'),
  appointmentController.getProviderSchedule
);

// ── State transitions (multiple roles) ──────────────────────────────────────
router.post('/:id/cancel',
  protect,
  authorize('patient', 'doctor', 'dentist', 'admin'),
  appointmentController.cancelAppointment
);

router.post('/:id/confirm',
  protect,
  authorize('doctor', 'dentist', 'admin'),
  appointmentController.confirmAppointment
);

router.post('/:id/check-in',
  protect,
  authorize('doctor', 'dentist', 'lab_technician', 'admin'),
  appointmentController.checkInAppointment
);

router.post('/:id/complete',
  protect,
  authorize('doctor', 'dentist', 'lab_technician', 'admin'),
  appointmentController.completeAppointment
);

router.post('/:id/reschedule',
  protect,
  authorize('patient', 'admin'),
  appointmentController.rescheduleAppointment
);

// ── Single appointment lookup ───────────────────────────────────────────────
router.get('/:id',
  protect,
  authorize('patient', 'doctor', 'dentist', 'lab_technician', 'admin'),
  appointmentController.getAppointmentById
);

module.exports = router;