// backend/routes/facilitySearch.js
// ═══════════════════════════════════════════════════════════════════════════
//  Patient 360° — Facility Search & Registry Routes
//  ─────────────────────────────────────────────────────────────────────────
//  Two routers exported from this file:
//
//    pharmacyRouter    mounted at  /api/pharmacies
//    laboratoryRouter  mounted at  /api/laboratories
//
//  Each router exposes endpoints in two categories:
//
//    1. PUBLIC (no JWT) — fire during signup before the user has an account
//       • GET /search?q=...             autocomplete for signup forms
//
//    2. PROTECTED (JWT required) — consumed by logged-in users from the
//       various dashboards (doctor, admin, patient app, etc.)
//       • GET /                          list active facilities (with filters)
//       • GET /nearest?lng=&lat=&radius= geospatial "nearest" query
//       • GET /:id                       single facility details
//
//  IMPORTANT — Route ordering:
//    Express matches routes in the order they are defined. `/search` and
//    `/nearest` MUST be declared BEFORE `/:id`, otherwise they would be
//    interpreted as an :id value and never hit.
//
//  Response shape convention (keeps parity with the rest of the backend):
//    Success: { success: true, count?: number, laboratories?: [...], laboratory?: {...} }
//    Error  : { success: false, message: "<Arabic user-facing message>" }
// ═══════════════════════════════════════════════════════════════════════════

const express = require('express');
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');

// ── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Centralized error responder. Keeps the shape uniform across every endpoint
 * and logs a single consistent line to the console for easier debugging.
 */
function sendError(res, error, arabicMessage, statusCode = 500) {
  console.error(`❌ ${arabicMessage}:`, error.message || error);
  return res.status(statusCode).json({
    success: false,
    message: arabicMessage
  });
}

/**
 * Reusable ObjectId guard. Returns true if the string is a valid 24-char hex
 * ObjectId; responds with 400 and returns false otherwise.
 */
function validateObjectId(id, res) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      message: 'المعرّف غير صحيح'
    });
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PHARMACY SEARCH ROUTER
//  Mounted at /api/pharmacies — existing behavior preserved 1:1
// ═══════════════════════════════════════════════════════════════════════════

const pharmacyRouter = express.Router();

/**
 * @route   GET /api/pharmacies/search?q=...
 * @desc    Autocomplete search for pharmacies by name, arabicName, or registrationNumber.
 *          Returns at most 10 active pharmacies sorted by relevance.
 * @access  Public (no JWT — used during signup)
 */
pharmacyRouter.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const searchRegex = new RegExp(q.trim(), 'i');

    const Pharmacy = mongoose.model('Pharmacy');
    const results = await Pharmacy.find({
      isActive: { $ne: false },
      $or: [
        { name: searchRegex },
        { arabicName: searchRegex },
        { registrationNumber: searchRegex },
        { pharmacyLicense: searchRegex }
      ]
    })
      .select('name arabicName governorate city address pharmacyLicense registrationNumber')
      .limit(10)
      .lean();

    return res.json(results);
  } catch (error) {
    return sendError(res, error, 'حدث خطأ في البحث عن الصيدليات');
  }
});


// ═══════════════════════════════════════════════════════════════════════════
//  LABORATORY ROUTER
//  Mounted at /api/laboratories
//  ─────────────────────────────────────────────────────────────────────────
//  Route ordering (CRITICAL):
//    1. GET /search        — Public
//    2. GET /nearest       — Protected  ← MUST come before /:id
//    3. GET /              — Protected
//    4. GET /:id           — Protected  ← Goes LAST so it doesn't swallow
//                                        /search and /nearest
// ═══════════════════════════════════════════════════════════════════════════

const laboratoryRouter = express.Router();

// ── 1. GET /search — Public (signup autocomplete) ──────────────────────────

/**
 * @route   GET /api/laboratories/search?q=...
 * @desc    Autocomplete search for laboratories by name, arabicName, or registrationNumber.
 *          Returns at most 10 active laboratories sorted by relevance.
 * @access  Public (no JWT — used during signup)
 */
laboratoryRouter.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const searchRegex = new RegExp(q.trim(), 'i');

    const Laboratory = mongoose.model('Laboratory');
    const results = await Laboratory.find({
      isActive: { $ne: false },
      $or: [
        { name: searchRegex },
        { arabicName: searchRegex },
        { registrationNumber: searchRegex }
      ]
    })
      .select('name arabicName governorate city address labLicense registrationNumber')
      .limit(10)
      .lean();

    return res.json(results);
  } catch (error) {
    return sendError(res, error, 'حدث خطأ في البحث عن المختبرات');
  }
});

// ── 2. GET /nearest — Protected (geospatial $near query) ───────────────────

/**
 * @route   GET /api/laboratories/nearest?lng=...&lat=...&radius=5000
 * @desc    Find active laboratories within `radius` meters (default 5000m / 5km)
 *          of the provided GPS coordinates. Uses the 2dsphere index on
 *          laboratories.location for fast geospatial lookups.
 * @access  Protected (JWT required)
 *
 * @query   {number} lng     longitude (required, Syria range: 35.5 - 42.5)
 * @query   {number} lat     latitude  (required, Syria range: 32.0 - 37.5)
 * @query   {number} radius  max distance in meters (optional, default 5000, max 50000)
 *
 * @returns {object} { success, count, laboratories: [...] }
 *
 * @note    MUST be declared BEFORE GET /:id so that the literal string
 *          "nearest" is not mistaken for an ObjectId.
 */
laboratoryRouter.get('/nearest', protect, async (req, res) => {
  try {
    const { lng, lat, radius } = req.query;

    const longitude = parseFloat(lng);
    const latitude = parseFloat(lat);

    // Validate numeric coords
    if (Number.isNaN(longitude) || Number.isNaN(latitude)) {
      return res.status(400).json({
        success: false,
        message: 'إحداثيات GPS مطلوبة (lng, lat)'
      });
    }

    // Cap radius at 50km to avoid accidentally huge queries
    const maxDistance = Math.min(
      parseInt(radius, 10) || 5000,
      50000
    );

    const Laboratory = mongoose.model('Laboratory');

    // Use the static method defined on the Laboratory schema
    const labs = await Laboratory.findNearby(longitude, latitude, maxDistance)
      .select(
        'name arabicName governorate city district address '
        + 'phoneNumber email location '
        + 'isActive isAcceptingTests '
        + 'averageRating totalReviews labType'
      )
      .limit(20)
      .lean();

    return res.json({
      success: true,
      count: labs.length,
      center: { lng: longitude, lat: latitude },
      radiusMeters: maxDistance,
      laboratories: labs
    });
  } catch (error) {
    return sendError(res, error, 'حدث خطأ في البحث عن أقرب المختبرات');
  }
});

// ── 3. GET / — Protected (list, with filters) ──────────────────────────────

/**
 * @route   GET /api/laboratories
 * @desc    List active laboratories, optionally filtered by governorate,
 *          test offering, or accepting-status. Ordered by rating then name.
 * @access  Protected (JWT required)
 *
 * @query   {string}  governorate       filter by governorate slug (e.g. "damascus")
 * @query   {string}  testCode          filter to labs offering this test (e.g. "CBC")
 * @query   {boolean} acceptingTests    include labs not accepting tests (default: only accepting)
 * @query   {number}  limit             max results (default 100, max 200)
 *
 * @returns {object} { success, count, laboratories: [...] }
 *
 * @note    Response shape MUST match what the frontend `doctorAPI.getLaboratories`
 *          expects — the Doctor Dashboard reads `data.laboratories`.
 */
laboratoryRouter.get('/', protect, async (req, res) => {
  try {
    const { governorate, testCode, acceptingTests, limit } = req.query;

    // Base query — only active labs by default
    const query = { isActive: { $ne: false } };

    // Optional governorate filter
    if (governorate && typeof governorate === 'string') {
      query.governorate = governorate.toLowerCase().trim();
    }

    // By default only include labs accepting tests.
    // Pass acceptingTests=false to include all active labs.
    if (acceptingTests !== 'false') {
      query.isAcceptingTests = { $ne: false };
    }

    // Filter to labs offering a specific test
    if (testCode && typeof testCode === 'string') {
      query['testCatalog.testCode'] = testCode.toUpperCase().trim();
      query['testCatalog.isAvailable'] = true;
    }

    // Clamp limit
    const resultLimit = Math.min(
      parseInt(limit, 10) || 100,
      200
    );

    const Laboratory = mongoose.model('Laboratory');

    const labs = await Laboratory.find(query)
      .select(
        'name arabicName governorate city district address '
        + 'phoneNumber email labType '
        + 'isActive isAcceptingTests '
        + 'averageRating totalReviews'
      )
      .sort({ averageRating: -1, name: 1 })
      .limit(resultLimit)
      .lean();

    return res.json({
      success: true,
      count: labs.length,
      filters: {
        governorate: governorate || null,
        testCode: testCode || null,
        acceptingTestsOnly: acceptingTests !== 'false'
      },
      laboratories: labs
    });
  } catch (error) {
    return sendError(res, error, 'حدث خطأ في جلب قائمة المختبرات');
  }
});

// ── 4. GET /:id — Protected (single lab details) ──────────────────────────

/**
 * @route   GET /api/laboratories/:id
 * @desc    Return full details for a single laboratory, including its
 *          testCatalog and operatingHours. Used by the doctor UI to display
 *          a lab's capabilities before ordering a test.
 * @access  Protected (JWT required)
 *
 * @param   {string} id  Laboratory ObjectId
 *
 * @returns {object} { success, laboratory: {...} }
 *
 * @note    MUST be declared AFTER /search and /nearest — see top-of-file
 *          ordering note.
 */
laboratoryRouter.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;

    if (!validateObjectId(id, res)) return undefined;

    const Laboratory = mongoose.model('Laboratory');
    const lab = await Laboratory.findById(id).lean();

    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'المختبر غير موجود'
      });
    }

    return res.json({
      success: true,
      laboratory: lab
    });
  } catch (error) {
    return sendError(res, error, 'حدث خطأ في جلب بيانات المختبر');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  pharmacyRouter,
  laboratoryRouter
};