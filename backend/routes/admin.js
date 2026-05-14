/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Admin Routes — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/routes/admin.js
 *  🔧 Version: 2.0 — adds 4 new sections + Account Activity report
 *
 *  Mount point: /api/admin
 *  Auth: All routes require valid JWT + admin role.
 *  Audit: All mutations are auditLog-wrapped.
 *
 *  Sections (v2.0 changes marked 🆕):
 *    Statistics
 *    Doctor Requests Management
 *    Doctors Management
 *    Patients Management
 *    Audit Logs
 *    🆕 User Activity Report (Account Activity feature)
 *    🆕 Children Management
 *    🆕 Hospitals Management
 *    🆕 Pharmacies Management
 *    🆕 Laboratories Management
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router  = express.Router();

const adminController         = require('../controllers/adminController');
const childAdminController    = require('../controllers/childAdminController');
const hospitalAdminController = require('../controllers/hospitalAdminController');
const pharmacyAdminController = require('../controllers/pharmacyAdminController');
const labAdminController      = require('../controllers/laboratoryAdminController');

const { protect, authorize } = require('../middleware/auth');
const { auditLog }           = require('../middleware/auditLog');

// ════════════════════════════════════════════════════════════════════════════
// APPLY AUTHENTICATION TO ALL ADMIN ROUTES
// ════════════════════════════════════════════════════════════════════════════
router.use(protect);
router.use(authorize('admin'));

// ════════════════════════════════════════════════════════════════════════════
// STATISTICS
// ════════════════════════════════════════════════════════════════════════════
router.get(
  '/statistics',
  auditLog('VIEW_STATISTICS'),
  adminController.getStatistics,
);

// ════════════════════════════════════════════════════════════════════════════
// DOCTOR REQUESTS MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════
router.get('/doctor-requests',
  auditLog('VIEW_DOCTOR_REQUESTS'),
  adminController.getAllDoctorRequests);

router.get('/doctor-requests/:id',
  auditLog('VIEW_DOCTOR_REQUEST_DETAILS'),
  adminController.getDoctorRequestById);

router.post('/doctor-requests/:id/accept',
  auditLog('APPROVE_DOCTOR_REQUEST'),
  adminController.approveDoctorRequest);

router.post('/doctor-requests/:id/reject',
  auditLog('REJECT_DOCTOR_REQUEST'),
  adminController.rejectDoctorRequest);

// ════════════════════════════════════════════════════════════════════════════
// DOCTORS MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════
router.get('/doctors',
  auditLog('VIEW_DOCTORS'),
  adminController.getAllDoctors);

router.get('/doctors/:id',
  auditLog('VIEW_DOCTOR_DETAILS'),
  adminController.getDoctorById);

router.post('/doctors',
  auditLog('ADD_DOCTOR'),
  adminController.createDoctor);

router.patch('/doctors/:id/deactivate',
  auditLog('DEACTIVATE_DOCTOR'),
  adminController.deactivateDoctor);

router.put('/doctors/:id/deactivate',
  auditLog('DEACTIVATE_DOCTOR'),
  adminController.deactivateDoctor);

router.patch('/doctors/:id/activate',
  auditLog('ACTIVATE_DOCTOR'),
  adminController.activateDoctor);

router.put('/doctors/:id/reactivate',
  auditLog('ACTIVATE_DOCTOR'),
  adminController.activateDoctor);

router.patch('/doctors/:id',
  auditLog('UPDATE_DOCTOR'),
  adminController.updateDoctor);

// ════════════════════════════════════════════════════════════════════════════
// PATIENTS MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════
router.get('/patients',
  auditLog('VIEW_PATIENTS'),
  adminController.getAllPatients);

router.get('/patients/:id',
  auditLog('VIEW_PATIENT_DETAILS'),
  adminController.getPatientById);

router.patch('/patients/:id/deactivate',
  auditLog('DEACTIVATE_PATIENT'),
  adminController.deactivatePatient);

router.put('/patients/:id/deactivate',
  auditLog('DEACTIVATE_PATIENT'),
  adminController.deactivatePatient);

router.patch('/patients/:id/activate',
  auditLog('ACTIVATE_PATIENT'),
  adminController.activatePatient);

router.put('/patients/:id/reactivate',
  auditLog('ACTIVATE_PATIENT'),
  adminController.activatePatient);

router.patch('/patients/:id',
  auditLog('UPDATE_PATIENT'),
  adminController.updatePatient);

// ════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ════════════════════════════════════════════════════════════════════════════
router.get('/audit-logs',
  auditLog('VIEW_AUDIT_LOGS'),
  adminController.getAuditLogs);

router.get('/audit-logs/user/:userId',
  auditLog('VIEW_USER_AUDIT_LOGS'),
  adminController.getUserAuditLogs);

// 🆕 User Activity Report — Account Activity feature (NEW in v2.0)
router.get('/audit-logs/user-activity',
  auditLog('VIEW_USER_ACTIVITY_REPORT'),
  adminController.getUserActivityReport);

// ════════════════════════════════════════════════════════════════════════════
// 🆕 CHILDREN MANAGEMENT (NEW in v2.0)
// ════════════════════════════════════════════════════════════════════════════
router.get('/children',
  auditLog('VIEW_CHILDREN'),
  childAdminController.getAllChildren);

router.get('/children/:id',
  auditLog('VIEW_CHILD_DETAILS'),
  childAdminController.getChildById);

router.patch('/children/:id',
  auditLog('UPDATE_CHILD'),
  childAdminController.updateChild);

router.post('/children/:id/migrate',
  auditLog('MIGRATE_CHILD_TO_ADULT'),
  childAdminController.migrateChildToAdult);

router.delete('/children/:id',
  auditLog('DELETE_CHILD'),
  childAdminController.deleteChild);

// ════════════════════════════════════════════════════════════════════════════
// 🆕 HOSPITALS MANAGEMENT (NEW in v2.0)
// ════════════════════════════════════════════════════════════════════════════
router.get('/hospitals',
  auditLog('VIEW_HOSPITALS'),
  hospitalAdminController.getAllHospitals);

router.get('/hospitals/:id',
  auditLog('VIEW_HOSPITAL_DETAILS'),
  hospitalAdminController.getHospitalById);

router.post('/hospitals',
  auditLog('CREATE_HOSPITAL'),
  hospitalAdminController.createHospital);

router.patch('/hospitals/:id',
  auditLog('UPDATE_HOSPITAL'),
  hospitalAdminController.updateHospital);

router.patch('/hospitals/:id/activate',
  auditLog('ACTIVATE_HOSPITAL'),
  hospitalAdminController.activateHospital);

router.patch('/hospitals/:id/deactivate',
  auditLog('DEACTIVATE_HOSPITAL'),
  hospitalAdminController.deactivateHospital);

// ════════════════════════════════════════════════════════════════════════════
// 🆕 PHARMACIES MANAGEMENT (NEW in v2.0)
// ════════════════════════════════════════════════════════════════════════════
router.get('/pharmacies',
  auditLog('VIEW_PHARMACIES'),
  pharmacyAdminController.getAllPharmacies);

router.get('/pharmacies/nearby',
  auditLog('SEARCH_NEARBY_PHARMACIES'),
  pharmacyAdminController.findNearbyPharmacies);

router.get('/pharmacies/:id',
  auditLog('VIEW_PHARMACY_DETAILS'),
  pharmacyAdminController.getPharmacyById);

router.post('/pharmacies',
  auditLog('CREATE_PHARMACY'),
  pharmacyAdminController.createPharmacy);

router.patch('/pharmacies/:id',
  auditLog('UPDATE_PHARMACY'),
  pharmacyAdminController.updatePharmacy);

router.patch('/pharmacies/:id/activate',
  auditLog('ACTIVATE_PHARMACY'),
  pharmacyAdminController.activatePharmacy);

router.patch('/pharmacies/:id/deactivate',
  auditLog('DEACTIVATE_PHARMACY'),
  pharmacyAdminController.deactivatePharmacy);

// ════════════════════════════════════════════════════════════════════════════
// 🆕 LABORATORIES MANAGEMENT (NEW in v2.0)
// ════════════════════════════════════════════════════════════════════════════
router.get('/laboratories',
  auditLog('VIEW_LABORATORIES'),
  labAdminController.getAllLaboratories);

router.get('/laboratories/nearby',
  auditLog('SEARCH_NEARBY_LABORATORIES'),
  labAdminController.findNearbyLaboratories);

router.get('/laboratories/:id',
  auditLog('VIEW_LABORATORY_DETAILS'),
  labAdminController.getLaboratoryById);

router.post('/laboratories',
  auditLog('CREATE_LABORATORY'),
  labAdminController.createLaboratory);

router.patch('/laboratories/:id',
  auditLog('UPDATE_LABORATORY'),
  labAdminController.updateLaboratory);

router.patch('/laboratories/:id/activate',
  auditLog('ACTIVATE_LABORATORY'),
  labAdminController.activateLaboratory);

router.patch('/laboratories/:id/deactivate',
  auditLog('DEACTIVATE_LABORATORY'),
  labAdminController.deactivateLaboratory);

module.exports = router;
