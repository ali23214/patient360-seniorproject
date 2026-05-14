/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Child Admin Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/controllers/childAdminController.js
 *  🆕 NEW FILE in v2.0 — fixes Problem #3 (Children tab shows "no children")
 *
 *  Manages the Children collection for the Admin Dashboard:
 *    ✓ List all children with pagination, search, and filters
 *    ✓ Get child details (including parent linkage and migration status)
 *    ✓ Update child information
 *    ✓ Migrate child to adult Person record (when nationalId arrives at age 14)
 *    ✓ Soft-delete child records
 *
 *  📚 Schema reference (Children.js):
 *    Unique:  childRegistrationNumber (CRN-YYYYMMDD-XXXXX)
 *    Parent:  parentNationalId, parentPersonId
 *    Migration: pending → ready (has nationalId) → migrated
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');
const {
  Children,
  Person,
  Patient,
  Account,
  AuditLog,
} = require('../models');

// ============================================================================
// HELPER — Extract IP address
// ============================================================================

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

// ============================================================================
// 1. GET ALL CHILDREN — paginated + filtered list
// ============================================================================

/**
 * GET /api/admin/children
 *
 * Query params:
 *   - page, limit
 *   - search           (across firstName, lastName, CRN, parentNationalId)
 *   - governorate
 *   - gender
 *   - migrationStatus  (pending | ready | migrated)
 *   - parentNationalId
 *   - isActive
 *   - sortBy, sortOrder
 */
exports.getAllChildren = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      governorate,
      gender,
      migrationStatus,
      parentNationalId,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // ── Build query ─────────────────────────────────────────────────────
    const query = {};

    // Default: exclude soft-deleted records
    query.isDeleted = false;

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    if (governorate)     query.governorate     = governorate;
    if (gender)          query.gender          = gender;
    if (migrationStatus) query.migrationStatus = migrationStatus;
    if (parentNationalId) query.parentNationalId = parentNationalId;

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$or = [
        { firstName:               searchRegex },
        { fatherName:              searchRegex },
        { lastName:                searchRegex },
        { motherName:              searchRegex },
        { childRegistrationNumber: searchRegex },
        { parentNationalId:        searchRegex },
        { phoneNumber:             searchRegex },
      ];
    }

    // ── Sort spec ───────────────────────────────────────────────────────
    const sortSpec = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    // ── Execute query ───────────────────────────────────────────────────
    const total = await Children.countDocuments(query);

    const children = await Children.find(query)
      .populate('parentPersonId', 'nationalId firstName lastName phoneNumber email')
      .sort(sortSpec)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    // ── Format response ─────────────────────────────────────────────────
    const formattedChildren = await Promise.all(
      children.map(async (child) => {
        // Get account (if signed up)
        const account = await Account.findOne({ childId: child._id })
          .select('email isActive lastLogin')
          .lean();

        // Get patient profile (if exists)
        const patientProfile = await Patient.findOne({ childId: child._id })
          .select('bloodType allergies chronicDiseases totalVisits lastVisitDate')
          .lean();

        return {
          _id: child._id,
          childRegistrationNumber: child.childRegistrationNumber,
          birthCertificateNumber:  child.birthCertificateNumber || null,

          firstName:  child.firstName,
          fatherName: child.fatherName,
          lastName:   child.lastName,
          motherName: child.motherName,
          fullName:   `${child.firstName} ${child.fatherName} ${child.lastName}`,
          dateOfBirth: child.dateOfBirth,
          age:         calculateAge(child.dateOfBirth),
          gender:      child.gender,

          phoneNumber: child.phoneNumber,
          governorate: child.governorate,
          city:        child.city,
          district:    child.district,
          address:     child.address,

          guardianName:         child.guardianName,
          guardianRelationship: child.guardianRelationship,
          guardianPhoneNumber:  child.guardianPhoneNumber,
          schoolName: child.schoolName,
          grade:      child.grade,

          // Parent linkage
          parent: child.parentPersonId ? {
            personId:   child.parentPersonId._id,
            nationalId: child.parentPersonId.nationalId,
            fullName:   `${child.parentPersonId.firstName} ${child.parentPersonId.lastName}`,
            phoneNumber: child.parentPersonId.phoneNumber,
            email:       child.parentPersonId.email,
          } : { nationalId: child.parentNationalId, missing: true },

          // Migration info
          migrationStatus:       child.migrationStatus,
          hasReceivedNationalId: child.hasReceivedNationalId,
          nationalId:            child.nationalId,
          nationalIdReceivedAt:  child.nationalIdReceivedAt,
          migratedToPersonId:    child.migratedToPersonId,
          migratedAt:            child.migratedAt,
          isReadyToMigrate:      child.hasReceivedNationalId && child.migrationStatus !== 'migrated',

          // Account info
          account: account ? {
            email:     account.email,
            isActive:  account.isActive,
            lastLogin: account.lastLogin,
          } : null,

          // Medical summary (admin sees overview, not detailed allergies)
          medical: patientProfile ? {
            hasProfile:        true,
            bloodType:         patientProfile.bloodType,
            chronicConditions: (patientProfile.chronicDiseases || []).length,
            totalVisits:       patientProfile.totalVisits || 0,
            lastVisitDate:     patientProfile.lastVisitDate,
          } : { hasProfile: false },

          isActive:  child.isActive,
          isDeleted: child.isDeleted,
          createdAt: child.createdAt,
          updatedAt: child.updatedAt,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      count: formattedChildren.length,
      total,
      children: formattedChildren,
      pagination: {
        total,
        page:  Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('❌ getAllChildren error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب قائمة الأطفال',
      error: error.message,
    });
  }
};

// ============================================================================
// 2. GET CHILD BY ID — full details
// ============================================================================

exports.getChildById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف غير صالح',
      });
    }

    const child = await Children.findById(id)
      .populate('parentPersonId')
      .populate('migratedToPersonId', 'firstName lastName nationalId')
      .lean();

    if (!child) {
      return res.status(404).json({
        success: false,
        message: 'الطفل غير موجود',
      });
    }

    const account = await Account.findOne({ childId: child._id })
      .select('-password')
      .lean();

    const patientProfile = await Patient.findOne({ childId: child._id }).lean();

    return res.status(200).json({
      success: true,
      child: {
        ...child,
        age:              calculateAge(child.dateOfBirth),
        fullName:         `${child.firstName} ${child.fatherName} ${child.lastName}`,
        isReadyToMigrate: child.hasReceivedNationalId && child.migrationStatus !== 'migrated',
        account,
        patientProfile,
      },
    });
  } catch (error) {
    console.error('❌ getChildById error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب بيانات الطفل',
      error: error.message,
    });
  }
};

// ============================================================================
// 3. UPDATE CHILD — restricted to safe fields
// ============================================================================

exports.updateChild = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف غير صالح',
      });
    }

    // Blocked fields (immutable)
    const blocked = [
      '_id', 'childRegistrationNumber', 'parentNationalId', 'parentPersonId',
      'firstName', 'fatherName', 'lastName', 'motherName',
      'dateOfBirth', 'gender',
      'nationalId', 'migrationStatus', 'migratedAt', 'migratedToPersonId',
      'createdAt', 'updatedAt',
    ];

    const updates = { ...req.body };
    blocked.forEach((field) => delete updates[field]);

    const child = await Children.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!child) {
      return res.status(404).json({
        success: false,
        message: 'الطفل غير موجود',
      });
    }

    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'UPDATE_CHILD',
      description: `Admin updated child: ${child.firstName} ${child.lastName} (${child.childRegistrationNumber})`,
      resourceType: 'children',
      resourceId: child._id,
      patientChildId: child._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
      metadata: { updatedFields: Object.keys(updates) },
    });

    return res.status(200).json({
      success: true,
      message: 'تم تحديث بيانات الطفل بنجاح',
      child,
    });
  } catch (error) {
    console.error('❌ updateChild error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحديث بيانات الطفل',
      error: error.message,
    });
  }
};

// ============================================================================
// 4. MIGRATE CHILD TO ADULT — when nationalId is received at age 14+
// ============================================================================

/**
 * POST /api/admin/children/:id/migrate
 *
 * Migrates a child record to the Person collection. Required when:
 *   - Child has received their Syrian nationalId
 *   - Child is at least 14 years old
 *
 * This creates a new Person document, updates the Account to link to the
 * new personId instead of childId, transfers the Patient profile, and
 * marks the original Children document as migrated (not deleted — kept
 * for historical reference).
 */
exports.migrateChildToAdult = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { nationalId } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'معرّف غير صالح',
      });
    }

    if (!nationalId || !/^\d{11}$/.test(nationalId)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'الرقم الوطني مطلوب ويجب أن يكون 11 رقماً',
      });
    }

    // ── Find child ──────────────────────────────────────────────────────
    const child = await Children.findById(id).session(session);
    if (!child) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'الطفل غير موجود',
      });
    }

    if (child.migrationStatus === 'migrated') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'تم تنفيذ الترحيل مسبقاً لهذا الطفل',
      });
    }

    // ── Verify nationalId is unique ─────────────────────────────────────
    const existingPerson = await Person.findOne({ nationalId }).session(session);
    if (existingPerson) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'الرقم الوطني مستخدم بالفعل',
      });
    }

    // ── Create new Person document ──────────────────────────────────────
    const [newPerson] = await Person.create([{
      nationalId,
      firstName:  child.firstName,
      fatherName: child.fatherName,
      lastName:   child.lastName,
      motherName: child.motherName,
      dateOfBirth: child.dateOfBirth,
      gender:      child.gender,
      phoneNumber: child.phoneNumber || child.guardianPhoneNumber,
      governorate: child.governorate,
      city:        child.city,
      district:    child.district,
      street:      child.street,
      building:    child.building,
      address:     child.address,
      isActive:    true,
      isDeleted:   false,
    }], { session });

    // ── Migrate Patient profile (childId → personId) ────────────────────
    await Patient.updateOne(
      { childId: child._id },
      {
        $set:   { personId: newPerson._id },
        $unset: { childId: '' },
      },
      { session },
    );

    // ── Migrate Account (childId → personId) ────────────────────────────
    await Account.updateOne(
      { childId: child._id },
      {
        $set:   { personId: newPerson._id },
        $unset: { childId: '' },
      },
      { session },
    );

    // ── Mark child record as migrated (preserve for history) ────────────
    child.nationalId             = nationalId;
    child.nationalIdReceivedAt   = new Date();
    child.hasReceivedNationalId  = true;
    child.migrationStatus        = 'migrated';
    child.migratedToPersonId     = newPerson._id;
    child.migratedAt             = new Date();
    child.migratedBy             = req.user?._id;
    await child.save({ session });

    await session.commitTransaction();

    // ── Audit log ───────────────────────────────────────────────────────
    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'MIGRATE_CHILD_TO_ADULT',
      description: `Admin migrated child to adult: ${child.firstName} ${child.lastName} (CRN: ${child.childRegistrationNumber} → NationalID: ${nationalId})`,
      resourceType: 'children',
      resourceId: child._id,
      patientChildId: child._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
      metadata: {
        oldCRN:        child.childRegistrationNumber,
        newNationalId: nationalId,
        newPersonId:   newPerson._id,
      },
    });

    console.log(`✅ Child migrated: CRN ${child.childRegistrationNumber} → Person ${newPerson._id}`);

    return res.status(200).json({
      success: true,
      message: 'تم ترحيل الطفل إلى البالغين بنجاح',
      newPersonId: newPerson._id,
      child: child.toObject(),
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('❌ migrateChildToAdult error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء ترحيل الطفل',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// ============================================================================
// 5. SOFT-DELETE CHILD
// ============================================================================

exports.deleteChild = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف غير صالح',
      });
    }

    const child = await Children.findByIdAndUpdate(
      id,
      {
        $set: {
          isActive:       false,
          isDeleted:      true,
          deletedAt:      new Date(),
          deletionReason: reason || 'Admin action',
        },
      },
      { new: true },
    );

    if (!child) {
      return res.status(404).json({
        success: false,
        message: 'الطفل غير موجود',
      });
    }

    // Also deactivate the associated account
    await Account.updateOne(
      { childId: child._id },
      { $set: { isActive: false, deactivationReason: 'administrative', deactivatedAt: new Date() } },
    );

    await AuditLog.record({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: 'admin',
      action: 'DELETE_CHILD',
      description: `Admin soft-deleted child: ${child.firstName} ${child.lastName} (${child.childRegistrationNumber}). Reason: ${reason || 'N/A'}`,
      resourceType: 'children',
      resourceId: child._id,
      patientChildId: child._id,
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'],
      platform: 'web',
      success: true,
      metadata: { reason },
    });

    return res.status(200).json({
      success: true,
      message: 'تم حذف الطفل بنجاح',
    });
  } catch (error) {
    console.error('❌ deleteChild error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء حذف الطفل',
      error: error.message,
    });
  }
};

// ============================================================================
// HELPER — Age calculation
// ============================================================================

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}
