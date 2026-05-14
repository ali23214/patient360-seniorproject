/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Models Barrel — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Central export point for all 25 Mongoose models.
 *
 *  Why a barrel file?
 *    1. Pre-registration — requiring this file at server boot guarantees
 *       every model is compiled with mongoose before any controller queries.
 *       Without this, you can hit "Schema hasn't been registered for model"
 *       errors when a controller imports a model that hasn't been touched
 *       yet (e.g., a model that's only referenced via .populate()).
 *
 *    2. Single import point — controllers do
 *         const { Doctor, Patient, Visit } = require('../models');
 *       instead of 5+ individual require() lines.
 *
 *    3. Refactor safety — if a model file is renamed or moved, only this
 *       file needs updating, not every controller.
 *
 *  Usage:
 *    // In a controller:
 *    const { Doctor, Visit, Prescription, AuditLog } = require('../models');
 *
 *    // In index.js (server boot):
 *    require('./models');  // ← side-effect: registers all 25 models
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Identity & accounts ─────────────────────────────────────────────────────
const Person = require('./Person');
const Children = require('./Children');
const Account = require('./Account');
const Patient = require('./Patient');

// ── Clinical professionals ──────────────────────────────────────────────────
const Doctor = require('./Doctor');
const Dentist = require('./Dentist');
const Pharmacist = require('./Pharmacist');
const LabTechnician = require('./LabTechnician');
const Admin = require('./Admin');
const DoctorRequest = require('./DoctorRequest');

// ── Facilities & catalog ────────────────────────────────────────────────────
const Hospital = require('./Hospital');
const Pharmacy = require('./Pharmacy');
const Laboratory = require('./Laboratory');
const Medication = require('./Medication');
const PharmacyInventory = require('./PharmacyInventory');

// ── Clinical workflow ───────────────────────────────────────────────────────
const Visit = require('./Visit');
const Prescription = require('./Prescription');
const PharmacyDispensing = require('./PharmacyDispensing');
const LabTest = require('./LabTest');
const Appointment = require('./Appointment');

// ── Workflow support ────────────────────────────────────────────────────────
const AvailabilitySlot = require('./AvailabilitySlot');
const EmergencyReport = require('./EmergencyReport');
const AuditLog = require('./AuditLog');
const Notification = require('./Notification');
const Review = require('./Review');

// ============================================================================
// EXPORT — single object with all 25 models
// ============================================================================

module.exports = {
  // Identity & accounts
  Person,
  Children,
  Account,
  Patient,

  // Clinical professionals
  Doctor,
  Dentist,
  Pharmacist,
  LabTechnician,
  Admin,
  DoctorRequest,

  // Facilities & catalog
  Hospital,
  Pharmacy,
  Laboratory,
  Medication,
  PharmacyInventory,

  // Clinical workflow
  Visit,
  Prescription,
  PharmacyDispensing,
  LabTest,
  Appointment,

  // Workflow support
  AvailabilitySlot,
  EmergencyReport,
  AuditLog,
  Notification,
  Review
};