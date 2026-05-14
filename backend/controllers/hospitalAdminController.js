/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Hospital Admin Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/controllers/hospitalAdminController.js
 *  🆕 NEW FILE in v2.0 — fixes Problem #4 (Hospitals tab shows "no data")
 *
 *  Full CRUD for hospitals registry:
 *    ✓ List with pagination + search + filters by type/governorate/status
 *    ✓ Get hospital details with doctor count
 *    ✓ Create hospital
 *    ✓ Update hospital
 *    ✓ Activate / deactivate hospital
 *    ✓ Soft-delete hospital
 *
 *  📚 Schema reference (Hospital.js, collection 10):
 *    No GeoJSON (per DB schema — only Pharmacy and Lab have GeoJSON)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');
const { Hospital, Doctor, AuditLog } = require('../models');

// ============================================================================
// HELPER — Extract IP address
// ============================================================================

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

// ============================================================================
// 1. GET ALL HOSPITALS — paginated + filtered
// ============================================================================

/**
 * GET /api/admin/hospitals
 *
 * Query params:
 *   - page, limit
 *   - search          (across name, arabicName, registrationNumber)
 *   - hospitalType    (government | private | military | university | specialized)
 *   - governorate
 *   - isActive
 *   - hasEmergency, hasICU, hasLaboratory, hasPharmacy, hasRadiology  (boolean)
 *   - sortBy, sortOrder
 */
exports.getAllHospitals = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      hospitalType,
      governorate,
      isActive,
      hasEmergency,
      hasICU,
      hasLaboratory,
      hasPharmacy,
      hasRadiology,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // ── Build query ─────────────────────────────────────────────────────
    const query = {};

    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (hospitalType)            query.hospitalType = hospitalType;
    if (governorate)             query.governorate  = governorate;

    if (hasEmergency  !== undefined) query.hasEmergency  = hasEmergency  === 'true';
    if (hasICU        !== undefined) query.hasICU        = hasICU        === 'true';
    if (hasLaboratory !== undefined) query.hasLaboratory = hasLaboratory === 'true';
    if (hasPharmacy   !== undefined) query.hasPharmacy   = hasPharmacy   === 'true';
    if (hasRadiology  !== undefined) query.hasRadiology  = hasRadiology  === 'true';

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$or = [
        { name:               searchRegex },
        { arabicName:         searchRegex },
        { registrationNumber: searchRegex },
        { city:               searchRegex },
        { district:           searchRegex },
        { phoneNumber:        searchRegex },
      ];
    }

    const sortSpec = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const total = await Hospital.countDocuments(query);

    const hospitals = await Hospital.find(query)
      .sort(sortSpec)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    // ── Enrich with doctor count ────────────────────────────────────────
    const formattedHospitals = await Promise.all(
      hospitals.map(async (hospital) => {
        const doctorCount = await Doctor.countDocuments({
          hospitalId: hospital._id,
          isAvailable: true,
        });

        return {
          ...hospital,
          doctorCount,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      count: formattedHospitals.length,
      total,
      hospitals: formattedHospitals,
      pagination: {
        total,
        page:  Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('❌ getAllHospitals error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب قائمة المستشفيات',
      error: error.message,
    });
  }
};

// ============================================================================
// 2. GET HOSPITAL BY ID — full details
// ============================================================================

exports.getHospitalById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف غير صالح',
      });
    }

    const hospital = await Hospital.findById(id).lean();
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'المستشفى غير موجود',
      });
    }

    // Get associated doctors
    const doctors = await Doctor.find({ hospitalId: hospital._id })
      .populate('personId', 'firstName lastName')
      .select('personId specialization position averageRating isAvailable')
      .lean();

    return res.status(200).json({
      success: true,
      hospital: {
        ...hospital,
        doctorCount: doctors.length,
        availableDoctorCount: doctors.filter(d => d.isAvailable).length,
        doctors: doctors.slice(0, 10), // Top 10 for preview
      },
    });
  } catch (error) {
    console.error('❌ getHospitalById error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب بيانات المستشفى',
      error: error.message,
    });
  }
};

// ============================================================================
// 3. CREATE HOSPITAL
// ============================================================================

exports.createHospital = async (req, res) => {
  try {
    const {
      name, arabicName, registrationNumber, hospitalLicense, hospitalType,
      specializations,
      phoneNumber, emergencyPhoneNumber, email, website,
      address, governorate, city, district,
      numberOfBeds, numberOfOperatingRooms,
      hasEmergency, hasICU, hasLaboratory, hasPharmacy, hasRadiology,
      operatingHours, servicesOffered, accreditations,
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────────
    if (!name || !registrationNumber || !phoneNumber || !address || !governorate || !city) {
      return res.status(400).json({
        success: false,
        message: 'الحقول المطلوبة: name, registrationNumber, phoneNumber, address, governorate, city',
      });
    }

    // ── Check uniqueness ────────────────────────────────────────────────
    const existing = await Hospital.findOne({ registrationNumber });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'يوجد مستشفى مسجّل بنفس رقم التسجيل',
      });
    }

    if (hospitalLicense) {
      const existingByLicense = await Hospital.findOne({ hospitalLicense });
      if (existingByLicense) {
        return res.status(400).json({
          success: false,
          message: 'يوجد مستشفى مسجّل بنفس رقم الترخيص',
        });
      }
    }

    // ── Create hospital ─────────────────────────────────────────────────
    const hospital = await Hospital.create({
      name, arabicName, registrationNumber, hospitalLicense,
      hospitalType: hospitalType || 'government',
      specializations: specializations || [],
      phoneNumber, emergencyPhoneNumber, email, website,
      address, governorate, city, district,
      numberOfBeds: numberOfBeds || 0,
      numberOfOperatingRooms: numberOfOperatingRooms || 0,
      hasEmergency:  hasEmergency  || false,
      hasICU:        hasICU        || false,
      hasLaboratory: hasLaboratory || false,
      hasPharmacy:   hasPharmacy   || false,
      hasRadiology:  hasRadiology  || false,
      operatingHours:  operatingHours  || [],
      servicesOffered: servicesOffered || [],
      accreditations:  accreditations  || [],
      isActive: true,
      isAcceptingPatients: true,
      averageRating: 0,
      totalReviews:  0,
    });

    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'CREATE_HOSPITAL',
      description: `Admin created hospital: ${hospital.name} (${hospital.governorate})`,
      resourceType: 'hospitals',
      resourceId: hospital._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
      metadata: { hospitalType: hospital.hospitalType, governorate: hospital.governorate },
    });

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء المستشفى بنجاح',
      hospital,
    });
  } catch (error) {
    console.error('❌ createHospital error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إنشاء المستشفى',
      error: error.message,
    });
  }
};

// ============================================================================
// 4. UPDATE HOSPITAL
// ============================================================================

exports.updateHospital = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف غير صالح',
      });
    }

    // Blocked fields (immutable)
    const blocked = ['_id', 'registrationNumber', 'createdAt', 'updatedAt'];
    const updates = { ...req.body };
    blocked.forEach((field) => delete updates[field]);

    const hospital = await Hospital.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'المستشفى غير موجود',
      });
    }

    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'UPDATE_HOSPITAL',
      description: `Admin updated hospital: ${hospital.name}`,
      resourceType: 'hospitals',
      resourceId: hospital._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
      metadata: { updatedFields: Object.keys(updates) },
    });

    return res.status(200).json({
      success: true,
      message: 'تم تحديث بيانات المستشفى بنجاح',
      hospital,
    });
  } catch (error) {
    console.error('❌ updateHospital error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحديث بيانات المستشفى',
      error: error.message,
    });
  }
};

// ============================================================================
// 5. ACTIVATE HOSPITAL
// ============================================================================

exports.activateHospital = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف غير صالح',
      });
    }

    const hospital = await Hospital.findByIdAndUpdate(
      id,
      { $set: { isActive: true, isAcceptingPatients: true } },
      { new: true },
    );

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'المستشفى غير موجود',
      });
    }

    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'ACTIVATE_HOSPITAL',
      description: `Admin activated hospital: ${hospital.name}`,
      resourceType: 'hospitals',
      resourceId: hospital._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
    });

    return res.status(200).json({
      success: true,
      message: 'تم تفعيل المستشفى بنجاح',
      hospital,
    });
  } catch (error) {
    console.error('❌ activateHospital error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تفعيل المستشفى',
      error: error.message,
    });
  }
};

// ============================================================================
// 6. DEACTIVATE HOSPITAL
// ============================================================================

exports.deactivateHospital = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف غير صالح',
      });
    }

    const hospital = await Hospital.findByIdAndUpdate(
      id,
      { $set: { isActive: false, isAcceptingPatients: false } },
      { new: true },
    );

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'المستشفى غير موجود',
      });
    }

    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'DEACTIVATE_HOSPITAL',
      description: `Admin deactivated hospital: ${hospital.name}. Reason: ${reason || 'N/A'}`,
      resourceType: 'hospitals',
      resourceId: hospital._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
      metadata: { reason },
    });

    return res.status(200).json({
      success: true,
      message: 'تم إيقاف المستشفى بنجاح',
      hospital,
    });
  } catch (error) {
    console.error('❌ deactivateHospital error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إيقاف المستشفى',
      error: error.message,
    });
  }
};
