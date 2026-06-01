/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Pharmacy Admin Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/controllers/pharmacyAdminController.js
 *  🔧 Version: 2.1 — GPS support removed (2026-05-27)
 *
 *  Full CRUD for pharmacies registry:
 *    ✓ List with pagination + search + filters
 *    ✓ Get pharmacy details with pharmacist count + inventory summary
 *    ✓ Create pharmacy
 *    ✓ Update pharmacy fields
 *    ✓ Activate / deactivate
 *
 *  ┌──── v2.1 SCHEMA CHANGE (2026-05-27) ───────────────────────────────┐
 *  │ ✗ REMOVED: normalizeLocation() helper                              │
 *  │ ✗ REMOVED: SYRIA_LNG/LAT_MIN/MAX bound constants                   │
 *  │ ✗ REMOVED: findNearbyPharmacies handler                            │
 *  │ ✗ REMOVED: location field accepted in create/update                │
 *  │ ✗ REMOVED: coordinates field exposed in responses                  │
 *  │                                                                    │
 *  │ Reason: GPS-based nearest-pharmacy queries are out of MVP scope.   │
 *  │   Address fields (governorate, city, district, address) suffice.   │
 *  └────────────────────────────────────────────────────────────────────┘
 *
 *  📚 Schema reference (Pharmacy.js, collection 11):
 *    Required: name, registrationNumber, pharmacyLicense, phoneNumber,
 *              address, governorate, city
 *    Optional: arabicName, email, pharmacyType, district, operatingHours
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');
const { Pharmacy, Pharmacist, PharmacyInventory, AuditLog } = require('../models');

// ============================================================================
// HELPER — Extract IP address
// ============================================================================

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
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
// 2. GET PHARMACY BY ID
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
// 3. CREATE PHARMACY
// ============================================================================

exports.createPharmacy = async (req, res) => {
  try {
    const {
      name, arabicName, registrationNumber, pharmacyLicense,
      phoneNumber, email, pharmacyType,
      governorate, city, district, address,
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
      name,
      arabicName,
      registrationNumber,
      pharmacyLicense,
      phoneNumber,
      email,
      pharmacyType: pharmacyType || 'community',
      governorate,
      city,
      district,
      address,
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
        governorate: pharmacy.governorate,
        city: pharmacy.city,
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
// 4. UPDATE PHARMACY
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

    // Block fields that should never be updated via this endpoint.
    // v2.1: `location`, `latitude`, `longitude` blocked since GPS was removed.
    const blocked = [
      '_id', 'registrationNumber', 'pharmacyLicense',
      'location', 'latitude', 'longitude',
      'createdAt', 'updatedAt',
    ];
    const updates = { ...req.body };
    blocked.forEach((field) => delete updates[field]);

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
// 5. ACTIVATE / DEACTIVATE PHARMACY
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
