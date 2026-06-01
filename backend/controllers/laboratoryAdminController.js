/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Laboratory Admin Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/controllers/laboratoryAdminController.js
 *  🔧 Version: 2.1 — GPS removed + field name bugs fixed (2026-05-27)
 *
 *  Full CRUD for laboratories registry + test catalog:
 *    ✓ List with pagination + search + filters
 *    ✓ Get laboratory details with technician count + test catalog
 *    ✓ Create laboratory
 *    ✓ Update laboratory + test catalog
 *    ✓ Activate / deactivate
 *
 *  ┌──── v2.1 CHANGES (2026-05-27) ─────────────────────────────────────┐
 *  │                                                                    │
 *  │ ✗ GPS REMOVAL:                                                     │
 *  │     ✗ Removed normalizeLocation() helper                           │
 *  │     ✗ Removed SYRIA_LNG/LAT_MIN/MAX constants                      │
 *  │     ✗ Removed findNearbyLaboratories handler                       │
 *  │     ✗ Removed location field accepted in create/update             │
 *  │     ✗ Removed coordinates field exposed in responses               │
 *  │                                                                    │
 *  │ 🐛 BUG FIXES — field-name mismatch with Mongoose model:            │
 *  │     ✓ laboratoryLicense → labLicense  (matches Laboratory.js)      │
 *  │     ✓ laboratoryType    → labType     (matches Laboratory.js)      │
 *  │     ✓ Added isAcceptingTests flag (was missing)                    │
 *  │     ✗ Removed ghost fields not in the model: website,              │
 *  │       hasHomeService, homeServiceFee, hasEmergencyService,         │
 *  │       emergencyContactPhone, specializations, accreditations,      │
 *  │       equipmentList. (Mongoose strict mode was silently dropping   │
 *  │       these — the create call appeared to succeed but the fields   │
 *  │       were never stored. If the team plans to add these later,     │
 *  │       they must be added to Laboratory.js model first.)            │
 *  └────────────────────────────────────────────────────────────────────┘
 *
 *  📚 Schema reference (Laboratory.js, collection 12):
 *    Required: name, registrationNumber, phoneNumber, address,
 *              governorate, city
 *    Optional: arabicName, labLicense, labType, email, district,
 *              testCatalog, operatingHours
 *    Enums:    labType ∈ {independent | hospital_based | clinic_based | specialized}
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');
const { Laboratory, LabTechnician, AuditLog } = require('../models');

// ============================================================================
// HELPER — Extract IP address
// ============================================================================

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

// ============================================================================
// 1. GET ALL LABORATORIES
// ============================================================================

/**
 * GET /api/admin/laboratories
 *
 * Query params:
 *   - page, limit
 *   - search          (across name, arabicName, registrationNumber, labLicense)
 *   - labType         (independent | hospital_based | clinic_based | specialized)
 *   - governorate
 *   - isActive, isAcceptingTests
 *   - sortBy, sortOrder
 *
 * Backward compatibility: accepts `laboratoryType` query param as alias for `labType`.
 */
exports.getAllLaboratories = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      labType,
      laboratoryType, // legacy alias — accepted but mapped to labType
      governorate,
      isActive,
      isAcceptingTests,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // ── Build query ─────────────────────────────────────────────────────
    const query = {};

    if (isActive !== undefined)         query.isActive         = isActive         === 'true';
    if (isAcceptingTests !== undefined) query.isAcceptingTests = isAcceptingTests === 'true';

    const effectiveLabType = labType || laboratoryType;
    if (effectiveLabType) query.labType = effectiveLabType;

    if (governorate) query.governorate = governorate;

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$or = [
        { name:               searchRegex },
        { arabicName:         searchRegex },
        { registrationNumber: searchRegex },
        { labLicense:         searchRegex },
        { city:               searchRegex },
        { district:           searchRegex },
        { phoneNumber:        searchRegex },
      ];
    }

    const sortSpec = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const total = await Laboratory.countDocuments(query);

    const laboratories = await Laboratory.find(query)
      .sort(sortSpec)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    // ── Enrich with technician count + catalog summary ─────────────────
    const formattedLabs = await Promise.all(
      laboratories.map(async (lab) => {
        const technicianCount = await LabTechnician.countDocuments({
          laboratoryId: lab._id,
          isAvailable: true,
        });

        return {
          ...lab,
          technicianCount,
          testCatalogSize: (lab.testCatalog || []).length,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      count: formattedLabs.length,
      total,
      laboratories: formattedLabs,
      pagination: {
        total,
        page:  Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('❌ getAllLaboratories error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب قائمة المختبرات',
      error: error.message,
    });
  }
};

// ============================================================================
// 2. GET LABORATORY BY ID
// ============================================================================

exports.getLaboratoryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف غير صالح',
      });
    }

    const lab = await Laboratory.findById(id).lean();
    if (!lab) {
      return res.status(404).json({
        success: false,
        message: 'المختبر غير موجود',
      });
    }

    const technicians = await LabTechnician.find({ laboratoryId: lab._id })
      .populate('personId', 'firstName lastName phoneNumber')
      .select('personId licenseNumber specialization yearsOfExperience isAvailable')
      .lean();

    return res.status(200).json({
      success: true,
      laboratory: {
        ...lab,
        technicianCount: technicians.length,
        technicians,
        testCatalogSize: (lab.testCatalog || []).length,
      },
    });
  } catch (error) {
    console.error('❌ getLaboratoryById error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب بيانات المختبر',
      error: error.message,
    });
  }
};

// ============================================================================
// 3. CREATE LABORATORY
// ============================================================================

exports.createLaboratory = async (req, res) => {
  try {
    const {
      name, arabicName, registrationNumber,
      labLicense, labType,
      // Legacy aliases — accepted for backward compatibility:
      laboratoryLicense, laboratoryType,
      phoneNumber, email,
      governorate, city, district, address,
      operatingHours,
      testCatalog,
    } = req.body;

    // ── Resolve aliases ─────────────────────────────────────────────────
    const effectiveLabLicense = labLicense || laboratoryLicense;
    const effectiveLabType    = labType    || laboratoryType;

    // ── Validation ──────────────────────────────────────────────────────
    if (!name || !registrationNumber || !phoneNumber
        || !governorate || !city || !address) {
      return res.status(400).json({
        success: false,
        message: 'الحقول المطلوبة: name, registrationNumber, phoneNumber, governorate, city, address',
      });
    }

    // ── Check uniqueness ────────────────────────────────────────────────
    const existingByReg = await Laboratory.findOne({ registrationNumber });
    if (existingByReg) {
      return res.status(400).json({
        success: false,
        message: 'يوجد مختبر مسجّل بنفس رقم التسجيل',
      });
    }

    // ── Create laboratory ───────────────────────────────────────────────
    const laboratory = await Laboratory.create({
      name,
      arabicName,
      registrationNumber,
      labLicense: effectiveLabLicense,
      labType: effectiveLabType || 'independent',
      phoneNumber,
      email,
      governorate,
      city,
      district,
      address,
      operatingHours: operatingHours || [],
      testCatalog:    testCatalog    || [],
      isActive: true,
      isAcceptingTests: true,
      averageRating: 0,
      totalReviews:  0,
    });

    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'CREATE_LABORATORY',
      description: `Admin created laboratory: ${laboratory.name} (${laboratory.governorate})`,
      resourceType: 'laboratories',
      resourceId: laboratory._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
      metadata: {
        labType: laboratory.labType,
        governorate: laboratory.governorate,
        city: laboratory.city,
        testCatalogSize: (laboratory.testCatalog || []).length,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء المختبر بنجاح',
      laboratory,
    });
  } catch (error) {
    console.error('❌ createLaboratory error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إنشاء المختبر',
      error: error.message,
    });
  }
};

// ============================================================================
// 4. UPDATE LABORATORY
// ============================================================================

exports.updateLaboratory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف غير صالح',
      });
    }

    // Block fields that should never be updated via this endpoint.
    // v2.1: `location`, `latitude`, `longitude` blocked since GPS was removed.
    const blocked = [
      '_id', 'registrationNumber',
      'location', 'latitude', 'longitude',
      'createdAt', 'updatedAt',
    ];
    const updates = { ...req.body };
    blocked.forEach((field) => delete updates[field]);

    // Translate legacy aliases to the model's actual field names.
    if (updates.laboratoryLicense !== undefined && updates.labLicense === undefined) {
      updates.labLicense = updates.laboratoryLicense;
    }
    delete updates.laboratoryLicense;

    if (updates.laboratoryType !== undefined && updates.labType === undefined) {
      updates.labType = updates.laboratoryType;
    }
    delete updates.laboratoryType;

    const laboratory = await Laboratory.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!laboratory) {
      return res.status(404).json({
        success: false,
        message: 'المختبر غير موجود',
      });
    }

    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'UPDATE_LABORATORY',
      description: `Admin updated laboratory: ${laboratory.name}`,
      resourceType: 'laboratories',
      resourceId: laboratory._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
      metadata: { updatedFields: Object.keys(updates) },
    });

    return res.status(200).json({
      success: true,
      message: 'تم تحديث بيانات المختبر بنجاح',
      laboratory,
    });
  } catch (error) {
    console.error('❌ updateLaboratory error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحديث بيانات المختبر',
      error: error.message,
    });
  }
};

// ============================================================================
// 5. ACTIVATE / DEACTIVATE LABORATORY
// ============================================================================

exports.activateLaboratory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'معرّف غير صالح' });
    }

    const lab = await Laboratory.findByIdAndUpdate(
      id,
      { $set: { isActive: true, isAcceptingTests: true } },
      { new: true },
    );

    if (!lab) {
      return res.status(404).json({ success: false, message: 'المختبر غير موجود' });
    }

    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'ACTIVATE_LABORATORY',
      description: `Admin activated laboratory: ${lab.name}`,
      resourceType: 'laboratories',
      resourceId: lab._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
    });

    return res.status(200).json({
      success: true,
      message: 'تم تفعيل المختبر بنجاح',
      laboratory: lab,
    });
  } catch (error) {
    console.error('❌ activateLaboratory error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تفعيل المختبر',
      error: error.message,
    });
  }
};

exports.deactivateLaboratory = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'معرّف غير صالح' });
    }

    const lab = await Laboratory.findByIdAndUpdate(
      id,
      { $set: { isActive: false, isAcceptingTests: false } },
      { new: true },
    );

    if (!lab) {
      return res.status(404).json({ success: false, message: 'المختبر غير موجود' });
    }

    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'DEACTIVATE_LABORATORY',
      description: `Admin deactivated laboratory: ${lab.name}. Reason: ${reason || 'N/A'}`,
      resourceType: 'laboratories',
      resourceId: lab._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
      metadata: { reason },
    });

    return res.status(200).json({
      success: true,
      message: 'تم إيقاف المختبر بنجاح',
      laboratory: lab,
    });
  } catch (error) {
    console.error('❌ deactivateLaboratory error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إيقاف المختبر',
      error: error.message,
    });
  }
};
