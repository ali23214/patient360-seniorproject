/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Laboratory Admin Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/controllers/laboratoryAdminController.js
 *  🆕 NEW FILE in v2.0 — fixes Problem #4 (Laboratories tab shows "no data")
 *
 *  Full CRUD for laboratories registry with GeoJSON + test catalog:
 *    ✓ List with pagination + search + filters
 *    ✓ Find nearby (geospatial $near query)
 *    ✓ Get laboratory details with technician count + test catalog
 *    ✓ Create with required GeoJSON coordinates (Syria bounds)
 *    ✓ Update including location + test catalog updates
 *    ✓ Activate / deactivate
 *
 *  📚 Schema reference (Laboratory.js, collection 12):
 *    location:    GeoJSON Point [lng, lat] — REQUIRED
 *    testCatalog: Array of available tests with pricing and turnaround time
 *    Syria bounds: lng 35.5-42.5, lat 32.0-37.5
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');
const { Laboratory, LabTechnician, AuditLog } = require('../models');

// ── Syrian geographic bounds ────────────────────────────────────────────────
const SYRIA_LNG_MIN = 35.5;
const SYRIA_LNG_MAX = 42.5;
const SYRIA_LAT_MIN = 32.0;
const SYRIA_LAT_MAX = 37.5;

// ============================================================================
// HELPERS
// ============================================================================

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Normalize location input to GeoJSON Point format.
 * Accepts: {latitude,longitude} | {lat,lng} | {type:'Point',coordinates:[lng,lat]} | [lng,lat]
 */
function normalizeLocation(input) {
  if (!input) return null;

  let lng;
  let lat;

  if (Array.isArray(input) && input.length === 2) {
    [lng, lat] = input;
  } else if (input.type === 'Point' && Array.isArray(input.coordinates)) {
    [lng, lat] = input.coordinates;
  } else if (typeof input.longitude === 'number' && typeof input.latitude === 'number') {
    lng = input.longitude;
    lat = input.latitude;
  } else if (typeof input.lng === 'number' && typeof input.lat === 'number') {
    lng = input.lng;
    lat = input.lat;
  } else {
    return null;
  }

  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  if (Number.isNaN(lng) || Number.isNaN(lat)) return null;

  // Syria bounds
  if (lng < SYRIA_LNG_MIN || lng > SYRIA_LNG_MAX) return null;
  if (lat < SYRIA_LAT_MIN || lat > SYRIA_LAT_MAX) return null;

  return {
    type: 'Point',
    coordinates: [Number(lng), Number(lat)],
  };
}

// ============================================================================
// 1. GET ALL LABORATORIES
// ============================================================================

/**
 * GET /api/admin/laboratories
 *
 * Query params:
 *   - page, limit
 *   - search          (across name, arabicName, registrationNumber, license)
 *   - laboratoryType  (clinical | radiology | pathology | molecular | comprehensive)
 *   - governorate
 *   - isActive
 *   - hasHomeService, hasEmergencyService  (boolean)
 *   - sortBy, sortOrder
 */
exports.getAllLaboratories = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      laboratoryType,
      governorate,
      isActive,
      hasHomeService,
      hasEmergencyService,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // ── Build query ─────────────────────────────────────────────────────
    const query = {};

    if (isActive !== undefined)            query.isActive            = isActive            === 'true';
    if (laboratoryType)                    query.laboratoryType      = laboratoryType;
    if (governorate)                       query.governorate         = governorate;
    if (hasHomeService !== undefined)      query.hasHomeService      = hasHomeService      === 'true';
    if (hasEmergencyService !== undefined) query.hasEmergencyService = hasEmergencyService === 'true';

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$or = [
        { name:               searchRegex },
        { arabicName:         searchRegex },
        { registrationNumber: searchRegex },
        { laboratoryLicense:  searchRegex },
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
          coordinates: lab.location?.coordinates
            ? {
                longitude: lab.location.coordinates[0],
                latitude:  lab.location.coordinates[1],
              }
            : null,
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
// 2. FIND NEARBY LABORATORIES
// ============================================================================

exports.findNearbyLaboratories = async (req, res) => {
  try {
    const { lng, lat, radius = 5000 } = req.query;

    const longitude = parseFloat(lng);
    const latitude  = parseFloat(lat);
    const maxDist   = parseInt(radius, 10);

    if (Number.isNaN(longitude) || Number.isNaN(latitude)) {
      return res.status(400).json({
        success: false,
        message: 'الإحداثيات (lng, lat) مطلوبة وصحيحة',
      });
    }

    const labs = await Laboratory.find({
      isActive: true,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [longitude, latitude] },
          $maxDistance: maxDist,
        },
      },
    }).lean();

    return res.status(200).json({
      success: true,
      count: labs.length,
      laboratories: labs,
    });
  } catch (error) {
    console.error('❌ findNearbyLaboratories error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء البحث عن المختبرات القريبة',
      error: error.message,
    });
  }
};

// ============================================================================
// 3. GET LABORATORY BY ID
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
      .select('personId labTechLicenseNumber specialization yearsOfExperience isAvailable')
      .lean();

    return res.status(200).json({
      success: true,
      laboratory: {
        ...lab,
        technicianCount: technicians.length,
        technicians,
        testCatalogSize: (lab.testCatalog || []).length,
        coordinates: lab.location?.coordinates
          ? {
              longitude: lab.location.coordinates[0],
              latitude:  lab.location.coordinates[1],
            }
          : null,
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
// 4. CREATE LABORATORY
// ============================================================================

exports.createLaboratory = async (req, res) => {
  try {
    const {
      name, arabicName, registrationNumber, laboratoryLicense, laboratoryType,
      phoneNumber, email, website,
      governorate, city, district, address,
      location, latitude, longitude,
      operatingHours,
      hasHomeService, homeServiceFee,
      hasEmergencyService, emergencyContactPhone,
      testCatalog, specializations, accreditations, equipmentList,
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────────
    if (!name || !registrationNumber || !laboratoryLicense || !phoneNumber
        || !governorate || !city || !address) {
      return res.status(400).json({
        success: false,
        message: 'الحقول المطلوبة: name, registrationNumber, laboratoryLicense, phoneNumber, governorate, city, address',
      });
    }

    // ── Normalize location ──────────────────────────────────────────────
    const locationInput = location || { latitude, longitude };
    const normalizedLocation = normalizeLocation(locationInput);

    if (!normalizedLocation) {
      return res.status(400).json({
        success: false,
        message: 'الإحداثيات الجغرافية مطلوبة ويجب أن تكون داخل سوريا (lng 35.5-42.5, lat 32.0-37.5)',
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

    const existingByLicense = await Laboratory.findOne({ laboratoryLicense });
    if (existingByLicense) {
      return res.status(400).json({
        success: false,
        message: 'يوجد مختبر مسجّل بنفس رقم الترخيص',
      });
    }

    // ── Create laboratory ───────────────────────────────────────────────
    const laboratory = await Laboratory.create({
      name, arabicName, registrationNumber, laboratoryLicense,
      laboratoryType: laboratoryType || 'clinical',
      phoneNumber, email, website,
      governorate, city, district, address,
      location: normalizedLocation,
      operatingHours:      operatingHours || [],
      hasHomeService:      hasHomeService      || false,
      homeServiceFee:      homeServiceFee      || 0,
      hasEmergencyService: hasEmergencyService || false,
      emergencyContactPhone,
      testCatalog:     testCatalog     || [],
      specializations: specializations || [],
      accreditations:  accreditations  || [],
      equipmentList:   equipmentList   || [],
      isActive: true,
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
        laboratoryType: laboratory.laboratoryType,
        coordinates:    laboratory.location.coordinates,
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
// 5. UPDATE LABORATORY
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

    const blocked = ['_id', 'registrationNumber', 'laboratoryLicense', 'createdAt', 'updatedAt'];
    const updates = { ...req.body };
    blocked.forEach((field) => delete updates[field]);

    // ── Handle location update ──────────────────────────────────────────
    if (updates.location || (updates.latitude !== undefined && updates.longitude !== undefined)) {
      const locationInput = updates.location || {
        latitude:  updates.latitude,
        longitude: updates.longitude,
      };
      const normalizedLocation = normalizeLocation(locationInput);

      if (!normalizedLocation) {
        return res.status(400).json({
          success: false,
          message: 'الإحداثيات الجغرافية غير صالحة',
        });
      }

      updates.location = normalizedLocation;
      delete updates.latitude;
      delete updates.longitude;
    }

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
// 6. ACTIVATE / DEACTIVATE LABORATORY
// ============================================================================

exports.activateLaboratory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'معرّف غير صالح' });
    }

    const lab = await Laboratory.findByIdAndUpdate(
      id,
      { $set: { isActive: true } },
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
      { $set: { isActive: false } },
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
