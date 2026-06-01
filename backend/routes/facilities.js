/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Facilities Routes (PUBLIC) — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/routes/facilities.js
 *  🆕 NEW in v2.2 (2026-05-27)
 *
 *  Mount point: /api/facilities
 *
 *  These endpoints are PUBLIC (no auth required) — they are called from
 *  SignUp.jsx before the user has an account, so they can:
 *    • Search existing pharmacies/laboratories (autocomplete)
 *    • Submit a new facility request if their facility isn't listed
 *
 *  Admin endpoints for managing these requests live in routes/admin.js.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();

const facilityRequestController = require('../controllers/facilityRequestController');

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC — SEARCH (autocomplete from SignUp)
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/facilities/pharmacies/search?q=<query>
 * Returns up to 15 pharmacy matches by name (English or Arabic).
 */
router.get('/pharmacies/search', facilityRequestController.searchPharmacies);

/**
 * GET /api/facilities/laboratories/search?q=<query>
 * Returns up to 15 laboratory matches by name (English or Arabic).
 */
router.get('/laboratories/search', facilityRequestController.searchLaboratories);

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC — SUBMIT FACILITY REQUEST
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/facilities/requests
 *
 * Body:
 *   facilityType, name, arabicName?, license?, specificType?,
 *   phoneNumber?, email?, governorate, city, district?, address,
 *   submittedByEmail, submittedByName?, submittedByPhone?,
 *   linkedDoctorRequestId?, notes?
 *
 * Returns: { success, requestNumber, _id }
 */
router.post('/requests', facilityRequestController.submitFacilityRequest);

/**
 * GET /api/facilities/requests/status?requestNumber=FAC-... | ?email=...
 *
 * PUBLIC — lets a facility owner track their request without logging in.
 * Accepts either the FAC- request number (precise) or the submission email
 * (fallback). Returns status + rejection details.
 */
router.get('/requests/status', facilityRequestController.checkFacilityStatus);

module.exports = router;
