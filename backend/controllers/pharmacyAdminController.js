/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Pharmacy Admin Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/controllers/pharmacyAdminController.js
 *  🆕 NEW FILE in v2.0 — fixes Problem #4 (Pharmacies tab shows "no data")
 *
 *  Full CRUD for pharmacies registry with GeoJSON location support:
 *    ✓ List with pagination + search + filters
 *    ✓ Find nearby (geospatial $near query)
 *    ✓ Get pharmacy details with pharmacist count + inventory summary
 *    ✓ Create with required GeoJSON coordinates (Syria bounds validation)
 *    ✓ Update including location updates
 *    ✓ Activate / deactivate
 *
 *  📚 Schema reference (Pharmacy.js, collection 11):
 *    location: GeoJSON Point — REQUIRED, [longitude, latitude]
 *    Syria bounds: lng 35.5-42.5, lat 32.0-37.5
 *    2dsphere index enables $near queries for nearest-pharmacy feature
 *
 *  💡 CRITICAL BSON note:
 *    Coordinate values MUST be saved as BSON Double (not Int32).
 *    Mongoose handles this automatically when using Number type, but if
 *    raw $set operations are used, wrap with explicit Number() casting.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');
const { Pharmacy, Pharmacist, PharmacyInventory, AuditLog } = require('../models');

// ── Syrian geographic bounds (matches Pharmacy.js validator) ────────────────
const SYRIA_LNG_MIN = 35.5;
const SYRIA_LNG_MAX = 42.5;
const SYRIA_LAT_MIN = 32.0;
const SYRIA_LAT_MAX = 37.5;

// ============================================================================
// HELPER — Extract IP address
// ============================================================================

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

// ============================================================================
// HELPER — Validate and normalize GeoJSON location
// ============================================================================

/**
 * Accepts multiple input shapes:
 *   1. { latitude: number,  longitude: number }
 *   2. { lat: number, lng: number }
 *   3. { type: 'Point', coordinates: [lng, lat] }
 *   4. [lng, lat]
 *
 * Returns: { type: 'Point', coordinates: [lng, lat] } or null on invalid
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

  // Type-check
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  if (Number.isNaN(lng) || Number.isNaN(lat)) return null;

  // Syria bounds check
  if (lng < SYRIA_LNG_MIN || lng > SYRIA_LNG_MAX) return null;
  if (lat < SYRIA_LAT_MIN || lat > SYRIA_LAT_MAX) return null;

  return {
    type: 'Point',
    coordinates: [Number(lng), Number(lat)], // Explicit Number cast for BSON Double
  };
}

// ============================================================================
// 1. GET ALL PHARMACIES — paginated + filtered
// ============================================================================

/**
 * GET /api/admin/pharmacies
 *
 * Query params:
 *   - page, limit
 *   - search          (across name, arabicName, registrationNumber, license)
 *   - pharmacyType    (community | hospital | clinic | online)
 *   - governorate
 *   - isActive, isAcceptingOrders
 *   - sortBy, sortOrder
 */
exports.getAllPharmacies = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      pharmacyType,
      governorate,
      isActive,
      isAcceptingOrders,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // ── Build query ─────────────────────────────────────────────────────
    const query = {};

    if (isActive !== undefined)          query.isActive          = isActive          === 'true';
    if (isAcceptingOrders !== undefined) query.isAcceptingOrders = isAcceptingOrders === 'true';
    if (pharmacyType)                    query.pharmacyType      = pharmacyType;
    if (governorate)                     query.governorate       = governorate;

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$or = [
        { name:               searchRegex },
        { arabicName:         searchRegex },
        { registrationNumber: searchRegex },
        { pharmacyLicense:    searchRegex },
        { city:               searchRegex },
        { district:           searchRegex },
        { phoneNumber:        searchRegex },
      ];
    }

    const sortSpec = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const total = await Pharmacy.countDocuments(query);

    const pharmacies = await Pharmacy.find(query)
      .sort(sortSpec)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    // ── Enrich with pharmacist count + inventory summary ────────────────
    const formattedPharmacies = await Promise.all(
      pharmacies.map(async (pharmacy) => {
        const pharmacistCount = await Pharmacist.countDocuments({
          pharmacyId: pharmacy._id,
          isAvailable: true,
        });

        const inventoryCount = await PharmacyInventory.countDocuments({
          pharmacyId: pharmacy._id,
        });

        const lowStockCount = await PharmacyInventory.countDocuments({
          pharmacyId: pharmacy._id,
          lowStockAlert: true,
        });

        return {
          ...pharmacy,
          pharmacistCount,
          inventoryCount,
          lowStockCount,
          // Convenience: expose coordinates as { lng, lat }
          coordinates: pharmacy.location?.coordinates
            ? {
                longitude: pharmacy.location.coordinates[0],
                latitude:  pharmacy.location.coordinates[1],
              }
            : null,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      count: formattedPharmacies.length,
      total,
      pharmacies: formattedPharmacies,
      pagination: {
        total,
        page:  Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('❌ getAllPharmacies error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب قائمة الصيدليات',
      error: error.message,
    });
  }
};

// ============================================================================
// 2. FIND NEARBY PHARMACIES — uses 2dsphere geospatial index
// ============================================================================

/**
 * GET /api/admin/pharmacies/nearby?lng=36.27&lat=33.51&radius=5000
 */
exports.findNearbyPharmacies = async (req, res) => {
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

    const pharmacies = await Pharmacy.findNearby(longitude, latitude, maxDist).lean();

    return res.status(200).json({
      success: true,
      count: pharmacies.length,
      pharmacies,
    });
  } catch (error) {
    console.error('❌ findNearbyPharmacies error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء البحث عن الصيدليات القريبة',
      error: error.message,
    });
  }
};

// ============================================================================
// 3. GET PHARMACY BY ID
// ============================================================================

exports.getPharmacyById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف غير صالح',
      });
    }

    const pharmacy = await Pharmacy.findById(id).lean();
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'الصيدلية غير موجودة',
      });
    }

    const pharmacists = await Pharmacist.find({ pharmacyId: pharmacy._id })
      .populate('personId', 'firstName lastName phoneNumber')
      .select('personId pharmacyLicenseNumber degree specialization yearsOfExperience isAvailable')
      .lean();

    const inventoryCount = await PharmacyInventory.countDocuments({
      pharmacyId: pharmacy._id,
    });

    const lowStockCount = await PharmacyInventory.countDocuments({
      pharmacyId: pharmacy._id,
      lowStockAlert: true,
    });

    return res.status(200).json({
      success: true,
      pharmacy: {
        ...pharmacy,
        pharmacistCount: pharmacists.length,
        pharmacists,
        inventoryCount,
        lowStockCount,
        coordinates: pharmacy.location?.coordinates
          ? {
              longitude: pharmacy.location.coordinates[0],
              latitude:  pharmacy.location.coordinates[1],
            }
          : null,
      },
    });
  } catch (error) {
    console.error('❌ getPharmacyById error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب بيانات الصيدلية',
      error: error.message,
    });
  }
};

// ============================================================================
// 4. CREATE PHARMACY — with GeoJSON location
// ============================================================================

exports.createPharmacy = async (req, res) => {
  try {
    const {
      name, arabicName, registrationNumber, pharmacyLicense,
      phoneNumber, email, pharmacyType,
      governorate, city, district, address,
      // Location can come as: location object, or latitude+longitude flat
      location, latitude, longitude,
      operatingHours,
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────────
    if (!name || !registrationNumber || !pharmacyLicense || !phoneNumber
        || !governorate || !city || !address) {
      return res.status(400).json({
        success: false,
        message: 'الحقول المطلوبة: name, registrationNumber, pharmacyLicense, phoneNumber, governorate, city, address',
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
    const existingByReg = await Pharmacy.findOne({ registrationNumber });
    if (existingByReg) {
      return res.status(400).json({
        success: false,
        message: 'يوجد صيدلية مسجّلة بنفس رقم التسجيل',
      });
    }

    const existingByLicense = await Pharmacy.findOne({ pharmacyLicense });
    if (existingByLicense) {
      return res.status(400).json({
        success: false,
        message: 'يوجد صيدلية مسجّلة بنفس رقم الترخيص',
      });
    }

    // ── Create pharmacy ─────────────────────────────────────────────────
    const pharmacy = await Pharmacy.create({
      name, arabicName, registrationNumber, pharmacyLicense,
      phoneNumber, email,
      pharmacyType: pharmacyType || 'community',
      governorate, city, district, address,
      location: normalizedLocation,
      operatingHours: operatingHours || [],
      isActive: true,
      isAcceptingOrders: true,
      averageRating: 0,
      totalReviews:  0,
    });

    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'CREATE_PHARMACY',
      description: `Admin created pharmacy: ${pharmacy.name} (${pharmacy.governorate})`,
      resourceType: 'pharmacies',
      resourceId: pharmacy._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
      metadata: {
        pharmacyType: pharmacy.pharmacyType,
        coordinates: pharmacy.location.coordinates,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الصيدلية بنجاح',
      pharmacy,
    });
  } catch (error) {
    console.error('❌ createPharmacy error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إنشاء الصيدلية',
      error: error.message,
    });
  }
};

// ============================================================================
// 5. UPDATE PHARMACY
// ============================================================================

exports.updatePharmacy = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف غير صالح',
      });
    }

    const blocked = ['_id', 'registrationNumber', 'pharmacyLicense', 'createdAt', 'updatedAt'];
    const updates = { ...req.body };
    blocked.forEach((field) => delete updates[field]);

    // ── Handle location update separately ───────────────────────────────
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

    const pharmacy = await Pharmacy.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'الصيدلية غير موجودة',
      });
    }

    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'UPDATE_PHARMACY',
      description: `Admin updated pharmacy: ${pharmacy.name}`,
      resourceType: 'pharmacies',
      resourceId: pharmacy._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
      metadata: { updatedFields: Object.keys(updates) },
    });

    return res.status(200).json({
      success: true,
      message: 'تم تحديث بيانات الصيدلية بنجاح',
      pharmacy,
    });
  } catch (error) {
    console.error('❌ updatePharmacy error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحديث بيانات الصيدلية',
      error: error.message,
    });
  }
};

// ============================================================================
// 6. ACTIVATE / DEACTIVATE PHARMACY
// ============================================================================

exports.activatePharmacy = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'معرّف غير صالح' });
    }

    const pharmacy = await Pharmacy.findByIdAndUpdate(
      id,
      { $set: { isActive: true, isAcceptingOrders: true } },
      { new: true },
    );

    if (!pharmacy) {
      return res.status(404).json({ success: false, message: 'الصيدلية غير موجودة' });
    }

    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'ACTIVATE_PHARMACY',
      description: `Admin activated pharmacy: ${pharmacy.name}`,
      resourceType: 'pharmacies',
      resourceId: pharmacy._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
    });

    return res.status(200).json({
      success: true,
      message: 'تم تفعيل الصيدلية بنجاح',
      pharmacy,
    });
  } catch (error) {
    console.error('❌ activatePharmacy error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تفعيل الصيدلية',
      error: error.message,
    });
  }
};

exports.deactivatePharmacy = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'معرّف غير صالح' });
    }

    const pharmacy = await Pharmacy.findByIdAndUpdate(
      id,
      { $set: { isActive: false, isAcceptingOrders: false } },
      { new: true },
    );

    if (!pharmacy) {
      return res.status(404).json({ success: false, message: 'الصيدلية غير موجودة' });
    }

    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'DEACTIVATE_PHARMACY',
      description: `Admin deactivated pharmacy: ${pharmacy.name}. Reason: ${reason || 'N/A'}`,
      resourceType: 'pharmacies',
      resourceId: pharmacy._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
      metadata: { reason },
    });

    return res.status(200).json({
      success: true,
      message: 'تم إيقاف الصيدلية بنجاح',
      pharmacy,
    });
  } catch (error) {
    console.error('❌ deactivatePharmacy error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إيقاف الصيدلية',
      error: error.message,
    });
  }
};
