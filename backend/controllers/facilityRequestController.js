/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Facility Request Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/controllers/facilityRequestController.js
 *  🆕 NEW in v2.2 (2026-05-27)
 *
 *  Two-audience controller:
 *
 *    🌐 PUBLIC endpoints (no auth — used by SignUp.jsx):
 *       • searchPharmacies(q)        — autocomplete existing pharmacies
 *       • searchLaboratories(q)      — autocomplete existing laboratories
 *       • submitFacilityRequest()    — create a new facility request
 *
 *    🔐 ADMIN endpoints (auth required):
 *       • getAllFacilityRequests()   — list with filters
 *       • getFacilityRequestById(id) — detail view
 *       • approveFacilityRequest(id) — creates the actual pharmacy/lab
 *       • rejectFacilityRequest(id)  — rejects + cascades to linked doctor_request
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');
const FacilityRequest = require('../models/FacilityRequest');
const Pharmacy = require('../models/Pharmacy');
const Laboratory = require('../models/Laboratory');
const DoctorRequest = require('../models/DoctorRequest');
const AuditLog = require('../models/AuditLog');

// ============================================================================
// HELPER — Extract IP address
// ============================================================================

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Helper: generate a unique placeholder registration number for an
 * auto-created facility. Format: `<PREFIX>-<timestamp>-<random>`.
 */
function generateRegistrationNumber(prefix) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// ============================================================================
// 🌐 PUBLIC — 1. SEARCH PHARMACIES (autocomplete for SignUp)
// ============================================================================

/**
 * GET /api/facilities/pharmacies/search?q=<query>
 *
 * Returns up to 15 pharmacy matches by name (English or Arabic).
 * Only returns active pharmacies that are accepting orders.
 *
 * Public endpoint — no auth.
 */
exports.searchPharmacies = async (req, res) => {
  try {
    const { q = '' } = req.query;
    const query = String(q).trim();

    if (query.length < 2) {
      return res.status(200).json({ success: true, count: 0, pharmacies: [] });
    }

    // Case-insensitive partial match on name OR arabicName
    const searchRegex = { $regex: query, $options: 'i' };
    const pharmacies = await Pharmacy.find({
      isActive: true,
      $or: [
        { name: searchRegex },
        { arabicName: searchRegex },
      ],
    })
      .select('_id name arabicName governorate city district address pharmacyType registrationNumber')
      .limit(15)
      .lean();

    return res.status(200).json({
      success: true,
      count: pharmacies.length,
      pharmacies,
    });
  } catch (error) {
    console.error('❌ searchPharmacies error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء البحث',
      error: error.message,
    });
  }
};

// ============================================================================
// 🌐 PUBLIC — 2. SEARCH LABORATORIES (autocomplete for SignUp)
// ============================================================================

exports.searchLaboratories = async (req, res) => {
  try {
    const { q = '' } = req.query;
    const query = String(q).trim();

    if (query.length < 2) {
      return res.status(200).json({ success: true, count: 0, laboratories: [] });
    }

    const searchRegex = { $regex: query, $options: 'i' };
    const labs = await Laboratory.find({
      isActive: true,
      $or: [
        { name: searchRegex },
        { arabicName: searchRegex },
      ],
    })
      .select('_id name arabicName governorate city district address labType registrationNumber')
      .limit(15)
      .lean();

    return res.status(200).json({
      success: true,
      count: labs.length,
      laboratories: labs,
    });
  } catch (error) {
    console.error('❌ searchLaboratories error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء البحث',
      error: error.message,
    });
  }
};

// ============================================================================
// 🌐 PUBLIC — 3. SUBMIT FACILITY REQUEST (from SignUp)
// ============================================================================

/**
 * POST /api/facilities/requests
 *
 * Submits a new facility registration request. Called when a pharmacist or
 * lab technician can't find their facility in the search.
 *
 * Body:
 *   facilityType: 'pharmacy' | 'laboratory'    (required)
 *   name: string                                (required)
 *   arabicName?: string
 *   license?: string
 *   specificType?: string
 *   phoneNumber?: string
 *   email?: string
 *   governorate: string                         (required)
 *   city: string                                (required)
 *   district?: string
 *   address: string                             (required)
 *   submittedByEmail: string                    (required)
 *   submittedByName?: string
 *   submittedByPhone?: string
 *   linkedDoctorRequestId?: ObjectId
 *   notes?: string
 *
 * Returns: { success, requestNumber, _id }
 *
 * Public endpoint — no auth (called during signup, before user has account).
 */
exports.submitFacilityRequest = async (req, res) => {
  try {
    const {
      facilityType,
      name, arabicName, license, specificType,
      phoneNumber, email,
      governorate, city, district, address,
      submittedByEmail, submittedByName, submittedByPhone,
      linkedDoctorRequestId,
      notes,
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────────
    if (!facilityType || !['pharmacy', 'laboratory'].includes(facilityType)) {
      return res.status(400).json({
        success: false,
        message: 'نوع المنشأة مطلوب (pharmacy أو laboratory)',
      });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'اسم المنشأة مطلوب' });
    }
    if (!governorate) {
      return res.status(400).json({ success: false, message: 'المحافظة مطلوبة' });
    }
    if (!city || !city.trim()) {
      return res.status(400).json({ success: false, message: 'المدينة مطلوبة' });
    }
    if (!address || !address.trim()) {
      return res.status(400).json({ success: false, message: 'العنوان مطلوب' });
    }
    if (!submittedByEmail || !submittedByEmail.trim()) {
      return res.status(400).json({ success: false, message: 'البريد الإلكتروني للمقدّم مطلوب' });
    }

    // ── Check for duplicate pending requests by same email ──────────────
    const existing = await FacilityRequest.findOne({
      submittedByEmail: submittedByEmail.trim().toLowerCase(),
      facilityType,
      status: 'pending',
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'يوجد طلب قيد المراجعة بنفس البريد الإلكتروني لنفس نوع المنشأة',
        existingRequestNumber: existing.requestNumber,
      });
    }

    // ── Create the request ──────────────────────────────────────────────
    const requestNumber = FacilityRequest.generateRequestNumber();
    const facilityRequest = await FacilityRequest.create({
      requestNumber,
      facilityType,
      name: name.trim(),
      arabicName: arabicName?.trim(),
      license: license?.trim().toUpperCase(),
      specificType,
      phoneNumber: phoneNumber?.trim(),
      email: email?.trim().toLowerCase(),
      governorate,
      city: city.trim(),
      district: district?.trim(),
      address: address.trim(),
      submittedByEmail: submittedByEmail.trim().toLowerCase(),
      submittedByName: submittedByName?.trim(),
      submittedByPhone: submittedByPhone?.trim(),
      linkedDoctorRequestId: linkedDoctorRequestId && mongoose.isValidObjectId(linkedDoctorRequestId)
        ? linkedDoctorRequestId
        : undefined,
      notes: notes?.trim(),
      status: 'pending',
    });

    // ── Audit log ────────────────────────────────────────────────────────
    try {
      await AuditLog.record({
        userEmail: submittedByEmail.trim().toLowerCase(),
        userRole: 'guest',
        action: 'SUBMIT_FACILITY_REQUEST',
        description: `New facility request: ${facilityType} "${name.trim()}" in ${governorate}`,
        resourceType: 'facility_requests',
        resourceId: facilityRequest._id,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
        platform: 'web',
        success: true,
        metadata: { facilityType, governorate, city },
      });
    } catch (auditErr) {
      console.warn('⚠️ Audit log failed (non-fatal):', auditErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'تم تقديم طلب تسجيل المنشأة بنجاح',
      requestNumber: facilityRequest.requestNumber,
      _id: facilityRequest._id,
    });
  } catch (error) {
    console.error('❌ submitFacilityRequest error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تقديم الطلب',
      error: error.message,
    });
  }
};

// ============================================================================
// 🔐 ADMIN — 4. GET ALL FACILITY REQUESTS (paginated + filtered)
// ============================================================================

/**
 * GET /api/admin/facility-requests
 *
 * Query params:
 *   - page, limit
 *   - search          (across name, arabicName, requestNumber, submittedByEmail)
 *   - facilityType    (pharmacy | laboratory)
 *   - status          (pending | approved | rejected)
 *   - governorate
 *   - sortBy, sortOrder
 */
exports.getAllFacilityRequests = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      facilityType,
      status,
      governorate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const query = {};
    if (facilityType) query.facilityType = facilityType;
    if (status)       query.status = status;
    if (governorate)  query.governorate = governorate;

    if (search) {
      const rx = { $regex: String(search).trim(), $options: 'i' };
      query.$or = [
        { name: rx },
        { arabicName: rx },
        { requestNumber: rx },
        { submittedByEmail: rx },
        { submittedByName: rx },
        { city: rx },
      ];
    }

    const sortSpec = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const total = await FacilityRequest.countDocuments(query);
    const requests = await FacilityRequest.find(query)
      .sort(sortSpec)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    return res.status(200).json({
      success: true,
      count: requests.length,
      total,
      requests,
      pagination: {
        total,
        page:  Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('❌ getAllFacilityRequests error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب الطلبات',
      error: error.message,
    });
  }
};

// ============================================================================
// 🔐 ADMIN — 5. GET FACILITY REQUEST BY ID
// ============================================================================

exports.getFacilityRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'معرّف غير صالح' });
    }

    const request = await FacilityRequest.findById(id).lean();
    if (!request) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }

    // If linked to a doctor_request, enrich with that info
    let linkedDoctorRequest = null;
    if (request.linkedDoctorRequestId) {
      linkedDoctorRequest = await DoctorRequest.findById(request.linkedDoctorRequestId)
        .select('requestId firstName fatherName lastName email phoneNumber requestType status')
        .lean();
    }

    return res.status(200).json({
      success: true,
      request: { ...request, linkedDoctorRequest },
    });
  } catch (error) {
    console.error('❌ getFacilityRequestById error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب الطلب',
      error: error.message,
    });
  }
};

// ============================================================================
// 🔐 ADMIN — 6. APPROVE FACILITY REQUEST
// ============================================================================

/**
 * POST /api/admin/facility-requests/:id/approve
 *
 * Approves the request → creates the actual pharmacy or laboratory
 * → updates the linked doctor_request (if any) with the new facility _id.
 *
 * Body (optional overrides — admin can refine before creating):
 *   { name?, arabicName?, license?, specificType?, phoneNumber?, email?,
 *     governorate?, city?, district?, address? }
 */
exports.approveFacilityRequest = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'معرّف غير صالح' });
    }

    const request = await FacilityRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `لا يمكن الموافقة على طلب بحالة "${request.status}"`,
      });
    }

    // Allow admin to override fields before creation
    const overrides = req.body || {};
    const finalData = {
      name:         (overrides.name         || request.name).trim(),
      arabicName:   (overrides.arabicName   || request.arabicName || '').trim() || undefined,
      license:      (overrides.license      || request.license || '').trim().toUpperCase() || undefined,
      specificType:  overrides.specificType || request.specificType,
      phoneNumber:  (overrides.phoneNumber  || request.phoneNumber || request.submittedByPhone || '0000000000').trim(),
      email:        (overrides.email        || request.email || '').trim().toLowerCase() || undefined,
      governorate:   overrides.governorate  || request.governorate,
      city:         (overrides.city         || request.city).trim(),
      district:     (overrides.district     || request.district || '').trim() || undefined,
      address:      (overrides.address      || request.address).trim(),
    };

    let createdFacility;
    let createdFacilityModel;

    // ── Create the actual facility ──────────────────────────────────────
    if (request.facilityType === 'pharmacy') {
      const pharmacyPayload = {
        name: finalData.name,
        arabicName: finalData.arabicName,
        registrationNumber: generateRegistrationNumber('PHARM'),
        pharmacyLicense: finalData.license || generateRegistrationNumber('LIC'),
        pharmacyType: finalData.specificType || 'community',
        phoneNumber: finalData.phoneNumber,
        email: finalData.email,
        governorate: finalData.governorate,
        city: finalData.city,
        district: finalData.district,
        address: finalData.address,
        isActive: true,
        isAcceptingOrders: true,
        averageRating: 0,
        totalReviews: 0,
      };
      createdFacility = await Pharmacy.create(pharmacyPayload);
      createdFacilityModel = 'Pharmacy';
    } else if (request.facilityType === 'laboratory') {
      const labPayload = {
        name: finalData.name,
        arabicName: finalData.arabicName,
        registrationNumber: generateRegistrationNumber('LAB'),
        ...(finalData.license ? { labLicense: finalData.license } : {}),
        labType: finalData.specificType || 'independent',
        phoneNumber: finalData.phoneNumber,
        email: finalData.email,
        governorate: finalData.governorate,
        city: finalData.city,
        district: finalData.district,
        address: finalData.address,
        isActive: true,
        isAcceptingTests: true,
        averageRating: 0,
        totalReviews: 0,
      };
      createdFacility = await Laboratory.create(labPayload);
      createdFacilityModel = 'Laboratory';
    } else {
      return res.status(400).json({
        success: false,
        message: 'نوع المنشأة غير صالح',
      });
    }

    // ── Update the FacilityRequest ──────────────────────────────────────
    request.status = 'approved';
    request.reviewedAt = new Date();
    request.reviewedBy = req.user?._id;
    request.createdFacilityId = createdFacility._id;
    request.createdFacilityModel = createdFacilityModel;
    await request.save();

    // ── If linked to a doctor_request, populate its facility reference ──
    let linkedDoctorRequest = null;
    if (request.linkedDoctorRequestId) {
      const updateField =
        request.facilityType === 'pharmacy'
          ? { pharmacyId: createdFacility._id }
          : { laboratoryId: createdFacility._id };

      linkedDoctorRequest = await DoctorRequest.findByIdAndUpdate(
        request.linkedDoctorRequestId,
        { $set: updateField },
        { new: true },
      );
    }

    // ── Audit ────────────────────────────────────────────────────────────
    try {
      await AuditLog.record({
        userId: req.user?._id,
        userEmail: req.user?.email,
        userRole: 'admin',
        action: 'APPROVE_FACILITY_REQUEST',
        description: `Approved facility request ${request.requestNumber} → created ${request.facilityType} "${createdFacility.name}"`,
        resourceType: 'facility_requests',
        resourceId: request._id,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
        platform: 'web',
        success: true,
        metadata: {
          createdFacilityId: createdFacility._id,
          facilityType: request.facilityType,
          linkedDoctorRequestId: request.linkedDoctorRequestId,
        },
      });
    } catch (auditErr) {
      console.warn('⚠️ Audit log failed (non-fatal):', auditErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `تم قبول الطلب وإنشاء ${request.facilityType === 'pharmacy' ? 'الصيدلية' : 'المختبر'} بنجاح`,
      request,
      createdFacility,
      linkedDoctorRequestUpdated: !!linkedDoctorRequest,
    });
  } catch (error) {
    console.error('❌ approveFacilityRequest error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء قبول الطلب',
      error: error.message,
    });
  }
};

// ============================================================================
// 🔐 ADMIN — 7. REJECT FACILITY REQUEST
// ============================================================================

/**
 * POST /api/admin/facility-requests/:id/reject
 *
 * Body:
 *   { rejectionReason: enum, rejectionDetails: string }
 */
exports.rejectFacilityRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason, rejectionDetails } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'معرّف غير صالح' });
    }

    const VALID_REASONS = ['duplicate', 'invalid_info', 'unverifiable', 'incomplete', 'other'];
    if (!rejectionReason || !VALID_REASONS.includes(rejectionReason)) {
      return res.status(400).json({
        success: false,
        message: 'سبب الرفض مطلوب وصالح',
      });
    }

    const request = await FacilityRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `لا يمكن رفض طلب بحالة "${request.status}"`,
      });
    }

    request.status = 'rejected';
    request.reviewedAt = new Date();
    request.reviewedBy = req.user?._id;
    request.rejectionReason = rejectionReason;
    request.rejectionDetails = (rejectionDetails || '').trim();
    await request.save();

    // ── If linked to a doctor_request, also reject it ────────────────────
    if (request.linkedDoctorRequestId) {
      await DoctorRequest.findByIdAndUpdate(
        request.linkedDoctorRequestId,
        {
          $set: {
            status: 'rejected',
            reviewedAt: new Date(),
            reviewedBy: req.user?._id,
            rejectionReason: 'other',
            rejectionDetails: `تم رفض طلب تسجيل المنشأة المرتبط: ${rejectionDetails || rejectionReason}`,
          },
        },
      );
    }

    // ── Audit ────────────────────────────────────────────────────────────
    try {
      await AuditLog.record({
        userId: req.user?._id,
        userEmail: req.user?.email,
        userRole: 'admin',
        action: 'REJECT_FACILITY_REQUEST',
        description: `Rejected facility request ${request.requestNumber}. Reason: ${rejectionReason}`,
        resourceType: 'facility_requests',
        resourceId: request._id,
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
        platform: 'web',
        success: true,
        metadata: { rejectionReason, rejectionDetails },
      });
    } catch (auditErr) {
      console.warn('⚠️ Audit log failed (non-fatal):', auditErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'تم رفض الطلب',
      request,
    });
  } catch (error) {
    console.error('❌ rejectFacilityRequest error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء رفض الطلب',
      error: error.message,
    });
  }
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PUBLIC — CHECK FACILITY REQUEST STATUS
 * ════════════════════════════════════════════════════════════════════════════
 * GET /api/facilities/requests/status?requestNumber=FAC-... 
 *   or  ?email=<submittedByEmail>
 *
 * Lets a facility owner track their submitted request WITHOUT logging in —
 * mirrors authController.checkDoctorStatus, but for facility_requests.
 *
 * Accepts EITHER identifier:
 *   • requestNumber — the unique FAC-YYYYMMDD-XXXXX receipt number (most precise)
 *   • email         — the submittedByEmail used at submission (fallback)
 *
 * Returns the status plus rejection details when rejected. Never reveals
 * whether an email exists beyond the matched request (returns 404 if none).
 */
exports.checkFacilityStatus = async (req, res) => {
  try {
    const requestNumber = (req.query.requestNumber || '').trim();
    const email = (req.query.email || '').trim().toLowerCase();

    if (!requestNumber && !email) {
      return res.status(400).json({
        success: false,
        message: 'يرجى إدخال رقم الطلب أو البريد الإلكتروني',
      });
    }

    // Build the lookup query. requestNumber takes precedence (more precise).
    const query = requestNumber
      ? { requestNumber: requestNumber.toUpperCase() }
      : { submittedByEmail: email };

    // Most recent request first (an email could have submitted more than one).
    const request = await FacilityRequest.findOne(query)
      .sort({ createdAt: -1 })
      .lean();

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على طلب بهذه البيانات',
      });
    }

    return res.status(200).json({
      success: true,
      requestNumber: request.requestNumber,
      facilityType: request.facilityType,   // 'pharmacy' | 'laboratory'
      name: request.name,
      arabicName: request.arabicName,
      status: request.status,                // 'pending' | 'approved' | 'rejected'
      rejectionReason: request.rejectionReason,
      rejectionDetails: request.rejectionDetails,
      submittedAt: request.createdAt,
      reviewedAt: request.reviewedAt,
    });
  } catch (error) {
    console.error('❌ checkFacilityStatus error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء التحقق من حالة الطلب',
      error: error.message,
    });
  }
};
