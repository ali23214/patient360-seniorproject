/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Admin Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Admin-only endpoints mounted under /api/admin.
 *
 *  Functions:
 *    1.  getStatistics              — Dashboard KPIs
 *    2.  getAllDoctors              — List all doctors with details
 *    3.  getDoctorById              — Single doctor lookup
 *    4.  createDoctor               — Admin creates doctor directly
 *    5.  updateDoctor               — Update doctor fields
 *    6.  deactivateDoctor           — Soft-disable doctor account
 *    7.  activateDoctor             — Re-enable deactivated doctor
 *    8.  getAllPatients             — List patients (adults AND children)
 *    9.  getPatientById             — Single patient lookup
 *   10.  updatePatient              — Update patient fields
 *   11.  deactivatePatient          — Soft-disable patient account
 *   12.  activatePatient            — Re-enable deactivated patient
 *   13.  getAuditLogs               — Browse audit logs with pagination
 *   14.  getUserAuditLogs           — Audit logs for one specific user
 *   15.  getAllDoctorRequests       — List doctor registration requests
 *   16.  getDoctorRequestById       — Single doctor request detail
 *   17.  approveDoctorRequest       — Approve + create Person+Account+Professional
 *   18.  rejectDoctorRequest        — Reject with reason
 *
 *  Conventions:
 *    - Arabic error messages, emoji-marked console logs
 *    - { success, message, [data] } response shape
 *    - Try/catch in every async function
 *    - Uses req.user._id (auth middleware aliases this to req.account)
 *
 *  ───────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/controllers/adminController.js
 *
 *  v3.0 CHANGES (this file):
 *   ✓ getStatistics — added Hospital/Pharmacy/Laboratory/Children counts,
 *                     monthVisits, criticalEmergencies, activeSessions,
 *                     monthly visit trend
 *   ✓ getAllDoctorRequests — added requestType query param filter
 *                            (uses existing compound index)
 *   ✓ getAuditLogs — expanded response shape with userAgent, metadata,
 *                    patientPersonId, patientChildId, errorMessage
 *   ✓ getUserActivityReport — NEW: security report for Account Activity feature
 *   ✓ getAllPatients — fixed children visibility (was hidden behind Patient profile)
 *
 *  v2 CHANGES (preserved) — approveDoctorRequest:
 *   • Handles newLaboratoryData / newPharmacyData
 *   • Manual rollback across all create steps
 *  ═══════════════════════════════════════════════════════════════════════════
 */

const {
  Account, Person, Children, Patient, Doctor, Pharmacist, LabTechnician,
  Hospital, Pharmacy, Laboratory,
  Visit, AuditLog, DoctorRequest
} = require('../models');

// Slot controller — used by approveDoctorRequest to auto-generate the
// approved doctor's availability_slots from their schedule template.
const slotController = require('./availabilitySlotController');

// Allowed deactivation reasons — matches locked Account schema enum
const ALLOWED_DEACTIVATION_REASONS = [
  'voluntary', 'administrative', 'security',
  'retirement', 'deceased', 'duplicate', 'fraud'
];

// ============================================================================
// 1. STATISTICS
// ============================================================================

exports.getStatistics = async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const oneHourAgo   = new Date(Date.now() - 60 * 60 * 1000);

    // Run all counts in parallel for performance
    const [
      // Users
      totalAccounts,
      activeAccounts,
      totalDoctors,
      activeDoctors,
      totalPharmacists,
      totalLabTechnicians,

      // Patients
      totalAdultPatients,
      totalChildPatients,
      totalChildren,
      activeChildren,
      childrenReadyToMigrate,

      // Facilities
      totalHospitals,
      activeHospitals,
      totalPharmacies,
      activePharmacies,
      totalLaboratories,
      activeLaboratories,

      // Visits
      totalVisits,
      todayVisits,
      monthVisits,
      criticalEmergencies,

      // Requests
      pendingDoctorRequests,
      pendingPharmacistRequests,
      pendingLabTechRequests,
      rejectedRequestsThisMonth,

      // Audit / Activity
      todayAuditLogs,
      todayLoginAttempts,
      todayFailedLogins,
      activeSessions,
    ] = await Promise.all([
      // Users
      Account.countDocuments(),
      Account.countDocuments({ isActive: true }),
      Doctor.countDocuments(),
      Doctor.countDocuments({ isAvailable: true }),
      Pharmacist.countDocuments(),
      LabTechnician.countDocuments(),

      // Patients (adult via personId, child via childId)
      Patient.countDocuments({ personId: { $exists: true, $ne: null } }),
      Patient.countDocuments({ childId:  { $exists: true, $ne: null } }),
      Children.countDocuments({ isDeleted: false }),
      Children.countDocuments({ isDeleted: false, isActive: true }),
      Children.countDocuments({ hasReceivedNationalId: true, migrationStatus: { $ne: 'migrated' } }),

      // Facilities
      Hospital.countDocuments(),
      Hospital.countDocuments({ isActive: true }),
      Pharmacy.countDocuments(),
      Pharmacy.countDocuments({ isActive: true }),
      Laboratory.countDocuments(),
      Laboratory.countDocuments({ isActive: true }),

      // Visits
      Visit.countDocuments(),
      Visit.countDocuments({ visitDate: { $gte: startOfToday } }),
      Visit.countDocuments({ visitDate: { $gte: startOfMonth } }),
      Visit.countDocuments({ visitType: 'emergency', status: { $ne: 'cancelled' } }),

      // Requests
      DoctorRequest.countDocuments({ status: 'pending', requestType: 'doctor' }),
      DoctorRequest.countDocuments({ status: 'pending', requestType: 'pharmacist' }),
      DoctorRequest.countDocuments({ status: 'pending', requestType: 'lab_technician' }),
      DoctorRequest.countDocuments({ status: 'rejected', reviewedAt: { $gte: startOfMonth } }),

      // Audit
      AuditLog.countDocuments({ createdAt: { $gte: startOfToday } }),
      AuditLog.countDocuments({ action: 'LOGIN_SUCCESS', createdAt: { $gte: startOfToday } }),
      AuditLog.countDocuments({ action: 'LOGIN_FAILED',  createdAt: { $gte: startOfToday } }),
      Account.countDocuments({ lastLogin: { $gte: oneHourAgo }, isActive: true }),
    ]);

    // ── 12-month visit trend (for chart) ──────────────────────────────────
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyTrend = await Visit.aggregate([
      { $match: { visitDate: { $gte: twelveMonthsAgo } } },
      {
        $group: {
          _id: {
            year:  { $year:  '$visitDate' },
            month: { $month: '$visitDate' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const visitsByMonth = monthlyTrend.map((m) => ({
      month: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
      count: m.count,
    }));

    return res.json({
      success: true,
      statistics: {
        // ── User counts ────────────────────────────────────────────────
        totalAccounts,
        activeAccounts,
        totalDoctors,
        activeDoctors,
        totalPharmacists,
        totalLabTechnicians,

        // ── Patient counts ─────────────────────────────────────────────
        totalPatients: totalAdultPatients + totalChildPatients,
        totalAdultPatients,
        totalChildPatients,
        totalChildren,
        activeChildren,
        childrenReadyToMigrate,

        // ── Facility counts ────────────────────────────────────────────
        totalHospitals,
        activeHospitals,
        totalPharmacies,
        activePharmacies,
        totalLaboratories,
        activeLaboratories,

        // ── Visit counts ───────────────────────────────────────────────
        totalVisits,
        todayVisits,
        monthVisits,
        criticalEmergencies,

        // ── Requests ───────────────────────────────────────────────────
        pendingDoctorRequests,
        pendingPharmacistRequests,
        pendingLabTechRequests,
        totalPendingRequests:
          pendingDoctorRequests + pendingPharmacistRequests + pendingLabTechRequests,
        rejectedRequestsThisMonth,

        // ── Activity / Security ────────────────────────────────────────
        todayAuditLogs,
        todayLoginAttempts,
        todayFailedLogins,
        activeSessions,

        // ── Trends ─────────────────────────────────────────────────────
        visitsByMonth,

        // ── Computed at ────────────────────────────────────────────────
        computedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('❌ Get statistics error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الإحصائيات',
      error: error.message,
    });
  }
};

// ============================================================================
// 2. GET ALL DOCTORS
// ============================================================================

exports.getAllDoctors = async (req, res) => {
  try {
    console.log('📥 getAllDoctors called');

    const doctors = await Doctor.find().lean();
    console.log(`✅ Found ${doctors.length} doctors`);

    if (doctors.length === 0) {
      return res.json({ success: true, count: 0, doctors: [] });
    }

    const personIds = doctors.map(d => d.personId);
    const [persons, accounts] = await Promise.all([
      Person.find({ _id: { $in: personIds } }).lean(),
      Account.find({ personId: { $in: personIds } }).lean()
    ]);

    const personById = new Map(persons.map(p => [String(p._id), p]));
    const accountByPersonId = new Map(accounts.map(a => [String(a.personId), a]));

    const validDoctors = doctors
      .map(doctor => {
        const person = personById.get(String(doctor.personId));
        if (!person) {
          console.warn(`⚠️  Person missing for doctor ${doctor._id}`);
          return null;
        }
        const account = accountByPersonId.get(String(doctor.personId));

        return {
          id: doctor._id,
          firstName: person.firstName || '',
          fatherName: person.fatherName || '',
          lastName: person.lastName || '',
          motherName: person.motherName || '',
          nationalId: person.nationalId || '',
          phoneNumber: person.phoneNumber || '',
          email: account?.email || '',
          isActive: account?.isActive ?? true,
          specialization: doctor.specialization || '',
          subSpecialization: doctor.subSpecialization || null,
          licenseNumber: doctor.medicalLicenseNumber || '',
          hospitalAffiliation: doctor.hospitalAffiliation || '',
          yearsOfExperience: doctor.yearsOfExperience || 0,
          consultationFee: doctor.consultationFee || 0,
          currency: doctor.currency || 'SYP',
          availableDays: doctor.availableDays || [],
          governorate: person.governorate || '',
          city: person.city || '',
          isECGSpecialist: doctor.isECGSpecialist || false,
          verificationStatus: doctor.verificationStatus || 'verified',
          averageRating: doctor.averageRating || 0,
          totalReviews: doctor.totalReviews || 0,
          lastLogin: account?.lastLogin || null,
          createdAt: doctor.createdAt
        };
      })
      .filter(d => d !== null);

    console.log(`✅ Returning ${validDoctors.length} valid doctors`);
    return res.json({
      success: true,
      count: validDoctors.length,
      doctors: validDoctors
    });

  } catch (error) {
    console.error('❌ Get doctors error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الأطباء',
      error: error.message
    });
  }
};

// ============================================================================
// 3. GET DOCTOR BY ID
// ============================================================================

exports.getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;

    const doctor = await Doctor.findById(id).populate('personId');
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'الطبيب غير موجود'
      });
    }

    const account = await Account.findOne({ personId: doctor.personId._id });
    const visitCount = await Visit.countDocuments({ doctorId: doctor._id });

    return res.json({
      success: true,
      doctor: {
        id: doctor._id,
        firstName: doctor.personId.firstName,
        fatherName: doctor.personId.fatherName,
        lastName: doctor.personId.lastName,
        motherName: doctor.personId.motherName,
        nationalId: doctor.personId.nationalId,
        phoneNumber: doctor.personId.phoneNumber,
        gender: doctor.personId.gender,
        dateOfBirth: doctor.personId.dateOfBirth,
        address: doctor.personId.address,
        governorate: doctor.personId.governorate,
        city: doctor.personId.city,
        email: account?.email,
        isActive: account?.isActive,
        specialization: doctor.specialization,
        subSpecialization: doctor.subSpecialization,
        licenseNumber: doctor.medicalLicenseNumber,
        hospitalAffiliation: doctor.hospitalAffiliation,
        yearsOfExperience: doctor.yearsOfExperience,
        consultationFee: doctor.consultationFee,
        currency: doctor.currency,
        followUpFee: doctor.followUpFee,
        availableDays: doctor.availableDays,
        isECGSpecialist: doctor.isECGSpecialist,
        verificationStatus: doctor.verificationStatus,
        averageRating: doctor.averageRating,
        totalReviews: doctor.totalReviews,
        visitCount,
        createdAt: doctor.createdAt
      }
    });
  } catch (error) {
    console.error('Get doctor error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب بيانات الطبيب'
    });
  }
};

// ============================================================================
// 4. CREATE DOCTOR (admin direct creation)
// ============================================================================

exports.createDoctor = async (req, res) => {
  console.log('📥 createDoctor called');

  try {
    const { person, doctor, account } = req.body;

    if (!person || !doctor || !account) {
      return res.status(400).json({
        success: false,
        message: 'البيانات غير مكتملة (person, doctor, account مطلوبة)'
      });
    }

    const personRequired = [
      'firstName', 'fatherName', 'lastName', 'motherName',
      'nationalId', 'gender', 'dateOfBirth', 'phoneNumber',
      'address', 'governorate', 'city'
    ];
    const missingPerson = personRequired.filter(f => !person[f]);
    if (missingPerson.length > 0) {
      return res.status(400).json({
        success: false,
        message: `الحقول التالية مطلوبة في person: ${missingPerson.join(', ')}`
      });
    }

    const [existingPerson, existingAccount, existingDoctor] = await Promise.all([
      Person.findOne({ nationalId: person.nationalId }),
      Account.findOne({ email: account.email.toLowerCase() }),
      Doctor.findOne({
        medicalLicenseNumber: doctor.medicalLicenseNumber.toUpperCase()
      })
    ]);

    if (existingPerson) {
      return res.status(400).json({
        success: false,
        message: 'الرقم الوطني مستخدم بالفعل'
      });
    }
    if (existingAccount) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مستخدم بالفعل'
      });
    }
    if (existingDoctor) {
      return res.status(400).json({
        success: false,
        message: 'رقم الترخيص مستخدم بالفعل'
      });
    }

    console.log('1️⃣ Creating Person...');
    const newPerson = await Person.create({
      firstName: person.firstName.trim(),
      fatherName: person.fatherName.trim(),
      lastName: person.lastName.trim(),
      motherName: person.motherName.trim(),
      nationalId: person.nationalId.trim(),
      gender: person.gender,
      dateOfBirth: new Date(person.dateOfBirth),
      phoneNumber: person.phoneNumber.replace(/\s/g, ''),
      address: person.address.trim(),
      governorate: person.governorate,
      city: person.city.trim()
    });
    console.log('✅ Person created:', newPerson._id);

    console.log('2️⃣ Creating Account...');
    const newAccount = await Account.create({
      email: account.email.toLowerCase().trim(),
      password: account.password,
      personId: newPerson._id,
      roles: ['doctor'],
      isActive: true
    });
    console.log('✅ Account created:', newAccount._id);

    console.log('3️⃣ Creating Doctor...');
    const newDoctor = await Doctor.create({
      personId: newPerson._id,
      medicalLicenseNumber: doctor.medicalLicenseNumber.toUpperCase().trim(),
      specialization: doctor.specialization,
      subSpecialization: doctor.subSpecialization?.trim() || null,
      yearsOfExperience: parseInt(doctor.yearsOfExperience, 10) || 0,
      hospitalAffiliation: doctor.hospitalAffiliation.trim(),
      availableDays: doctor.availableDays || [],
      consultationFee: parseFloat(doctor.consultationFee) || 0,
      currency: doctor.currency || 'SYP'
    });
    console.log('✅ Doctor created:', newDoctor._id);

    return res.status(201).json({
      success: true,
      message: 'تم إضافة الطبيب بنجاح',
      doctor: {
        id: newDoctor._id,
        firstName: newPerson.firstName,
        lastName: newPerson.lastName,
        email: newAccount.email,
        specialization: newDoctor.specialization,
        licenseNumber: newDoctor.medicalLicenseNumber
      }
    });

  } catch (error) {
    console.error('❌ Create doctor error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إضافة الطبيب: ' + error.message
    });
  }
};

// ============================================================================
// 5. UPDATE DOCTOR
// ============================================================================

exports.updateDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'الطبيب غير موجود'
      });
    }

    const doctorFields = [
      'specialization', 'subSpecialization', 'yearsOfExperience',
      'hospitalAffiliation', 'availableDays', 'consultationFee',
      'followUpFee', 'currency', 'isAcceptingNewPatients', 'isAvailable'
    ];
    doctorFields.forEach(field => {
      if (updates[field] !== undefined) {
        doctor[field] = updates[field];
      }
    });
    await doctor.save();

    const personFields = ['phoneNumber', 'address', 'governorate', 'city'];
    const personUpdates = {};
    personFields.forEach(field => {
      if (updates[field]) personUpdates[field] = updates[field];
    });
    if (Object.keys(personUpdates).length > 0) {
      await Person.findByIdAndUpdate(doctor.personId, personUpdates);
    }

    return res.json({
      success: true,
      message: 'تم تحديث بيانات الطبيب بنجاح'
    });
  } catch (error) {
    console.error('Update doctor error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحديث بيانات الطبيب'
    });
  }
};

// ============================================================================
// 6. DEACTIVATE DOCTOR
// ============================================================================

exports.deactivateDoctor = async (req, res) => {
  console.log('🔵 ========== DEACTIVATE DOCTOR ==========');

  try {
    const { id } = req.params;
    const { reason, notes } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'سبب إلغاء التفعيل مطلوب'
      });
    }

    if (!ALLOWED_DEACTIVATION_REASONS.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: `سبب إلغاء التفعيل غير صالح. القيم المسموحة: ${ALLOWED_DEACTIVATION_REASONS.join(', ')}`
      });
    }

    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'الطبيب غير موجود'
      });
    }

    await Account.findOneAndUpdate(
      { personId: doctor.personId },
      {
        isActive: false,
        deactivationReason: reason,
        deactivatedAt: new Date(),
        deactivatedBy: req.user._id
      }
    );

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'DEACTIVATE_DOCTOR',
      description: `Deactivated doctor ${doctor.medicalLicenseNumber}`,
      resourceType: 'doctor',
      resourceId: doctor._id,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: { reason, notes: notes || null }
    });

    console.log('✅ Doctor deactivated');
    return res.json({
      success: true,
      message: 'تم إلغاء تفعيل الطبيب بنجاح'
    });
  } catch (error) {
    console.error('❌ Deactivate doctor error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إلغاء التفعيل'
    });
  }
};

// ============================================================================
// 7. ACTIVATE DOCTOR
// ============================================================================

exports.activateDoctor = async (req, res) => {
  console.log('🔵 ========== ACTIVATE DOCTOR ==========');

  try {
    const { id } = req.params;

    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'الطبيب غير موجود'
      });
    }

    await Account.findOneAndUpdate(
      { personId: doctor.personId },
      {
        $set: { isActive: true },
        $unset: {
          deactivationReason: '',
          deactivatedAt: '',
          deactivatedBy: '',
          accountLockedUntil: '',
          failedLoginAttempts: ''
        }
      }
    );

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'ACTIVATE_DOCTOR',
      description: `Reactivated doctor ${doctor.medicalLicenseNumber}`,
      resourceType: 'doctor',
      resourceId: doctor._id,
      ipAddress: req.ip || 'unknown',
      success: true
    });

    console.log('✅ Doctor reactivated');
    return res.json({
      success: true,
      message: 'تم تفعيل الطبيب بنجاح'
    });
  } catch (error) {
    console.error('❌ Activate doctor error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في التفعيل'
    });
  }
};

// ============================================================================
// 8. GET ALL PATIENTS (adults + children)
// ============================================================================

exports.getAllPatients = async (req, res) => {
  try {
    console.log('📥 getAllPatients called');

    // v3.0: pagination + filters + ensures children are visible
    const {
      page = 1,
      limit = 100,
      search,
      governorate,
      gender,
      isMinor,         // 'true' to show only children, 'false' to show only adults
      isActive,
      bloodType,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // ── Build Patient query (medical-side filters) ──────────────────────
    const patientQuery = {};
    if (bloodType) patientQuery.bloodType = bloodType;

    // Apply minor filter at the Patient level
    if (isMinor === 'true')  patientQuery.childId  = { $exists: true, $ne: null };
    if (isMinor === 'false') patientQuery.personId = { $exists: true, $ne: null };

    const allPatients = await Patient.find(patientQuery).lean();
    console.log(`✅ Found ${allPatients.length} patient profiles (raw)`);

    if (allPatients.length === 0) {
      return res.json({
        success: true,
        count: 0,
        total: 0,
        patients: [],
        pagination: { total: 0, page: Number(page), limit: Number(limit), pages: 0 },
      });
    }

    // ── Batch-load related collections ──────────────────────────────────
    const adultPersonIds = allPatients.filter(p => p.personId).map(p => p.personId);
    const childChildIds  = allPatients.filter(p => p.childId).map(p => p.childId);

    const [persons, children, accounts] = await Promise.all([
      Person.find({ _id: { $in: adultPersonIds } }).lean(),
      Children.find({ _id: { $in: childChildIds }, isDeleted: false }).lean(),
      Account.find({
        $or: [
          { personId: { $in: adultPersonIds } },
          { childId:  { $in: childChildIds }  },
        ],
      }).lean(),
    ]);

    const personById = new Map(persons.map(p  => [String(p._id), p]));
    const childById  = new Map(children.map(c => [String(c._id), c]));

    const accountByPersonId = new Map();
    const accountByChildId  = new Map();
    accounts.forEach((a) => {
      if (a.personId) accountByPersonId.set(String(a.personId), a);
      if (a.childId)  accountByChildId.set(String(a.childId),  a);
    });

    // ── Build patient objects ───────────────────────────────────────────
    let formattedPatients = allPatients
      .map((patient) => {
        const isChild = !!patient.childId;
        const profile = isChild
          ? childById.get(String(patient.childId))
          : personById.get(String(patient.personId));

        if (!profile) {
          console.warn(`⚠️  Profile missing for patient ${patient._id}`);
          return null;
        }

        const account = isChild
          ? accountByChildId.get(String(patient.childId))
          : accountByPersonId.get(String(patient.personId));

        return {
          id:          patient._id,
          patientId:   patient._id,
          type:        isChild ? 'minor' : 'adult',
          isMinor:     isChild,

          // Identity
          firstName:               profile.firstName  || '',
          fatherName:              profile.fatherName || '',
          lastName:                profile.lastName   || '',
          motherName:              profile.motherName || '',
          fullName: `${profile.firstName || ''} ${profile.fatherName || ''} ${profile.lastName || ''}`.trim(),
          nationalId:              profile.nationalId              || null,
          childRegistrationNumber: profile.childRegistrationNumber || null,
          parentNationalId:        profile.parentNationalId        || null,

          // Demographics
          gender:      profile.gender || '',
          dateOfBirth: profile.dateOfBirth,
          age:         calculateAge(profile.dateOfBirth),

          // Contact
          phoneNumber: profile.phoneNumber || '',
          email:       account?.email     || (isChild ? null : profile.email) || '',
          governorate: profile.governorate || '',
          city:        profile.city        || '',

          // Account state
          isActive:    account?.isActive ?? true,
          lastLogin:   account?.lastLogin || null,
          isVerified:  account?.isVerified ?? false,

          // Medical summary (admin metadata only, NO allergies/chronic diseases per policy)
          bloodType:          patient.bloodType         || 'unknown',
          totalVisits:        patient.totalVisits       || 0,
          lastVisitDate:      patient.lastVisitDate     || null,
          chronicDiseasesCount: (patient.chronicDiseases || []).length,
          allergiesCount:       (patient.allergies      || []).length,

          // For minors only
          ...(isChild && {
            migrationStatus:       profile.migrationStatus,
            hasReceivedNationalId: profile.hasReceivedNationalId,
            parentPersonId:        profile.parentPersonId,
          }),

          createdAt: patient.createdAt,
          updatedAt: patient.updatedAt,
        };
      })
      .filter((p) => p !== null);

    // ── Apply post-load filters (across joined data) ────────────────────
    if (governorate) {
      formattedPatients = formattedPatients.filter(p => p.governorate === governorate);
    }
    if (gender) {
      formattedPatients = formattedPatients.filter(p => p.gender === gender);
    }
    if (isActive !== undefined) {
      const want = isActive === 'true';
      formattedPatients = formattedPatients.filter(p => p.isActive === want);
    }
    if (search) {
      const s = search.toLowerCase();
      formattedPatients = formattedPatients.filter((p) =>
        (p.firstName  || '').toLowerCase().includes(s)
        || (p.lastName   || '').toLowerCase().includes(s)
        || (p.fullName   || '').toLowerCase().includes(s)
        || (p.nationalId || '').toString().includes(search)
        || (p.childRegistrationNumber || '').toLowerCase().includes(s)
        || (p.email      || '').toLowerCase().includes(s)
        || (p.phoneNumber || '').includes(search),
      );
    }

    // ── Sort ────────────────────────────────────────────────────────────
    const direction = sortOrder === 'asc' ? 1 : -1;
    formattedPatients.sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      if (aVal < bVal) return -1 * direction;
      if (aVal > bVal) return 1 * direction;
      return 0;
    });

    // ── Paginate ────────────────────────────────────────────────────────
    const total       = formattedPatients.length;
    const pageNum     = Number(page);
    const limitNum    = Number(limit);
    const startIdx    = (pageNum - 1) * limitNum;
    const paginated   = formattedPatients.slice(startIdx, startIdx + limitNum);

    console.log(`✅ Returning ${paginated.length} of ${total} patients`);

    return res.json({
      success: true,
      count:    paginated.length,
      total,
      patients: paginated,
      pagination: {
        total,
        page:  pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('❌ Get patients error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب المرضى',
      error: error.message,
    });
  }
};

// HELPER — age calculation
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

// ============================================================================
// 9. GET PATIENT BY ID
// ============================================================================

exports.getPatientById = async (req, res) => {
  try {
    const { id } = req.params;

    const patient = await Patient.findById(id);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'المريض غير موجود'
      });
    }

    const isChild = !!patient.childId;
    const profile = isChild
      ? await Children.findById(patient.childId).lean()
      : await Person.findById(patient.personId).lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'بيانات المريض الشخصية غير موجودة'
      });
    }

    const account = isChild
      ? await Account.findOne({ childId: patient.childId })
      : await Account.findOne({ personId: patient.personId });

    const visitCount = isChild
      ? await Visit.countDocuments({ patientChildId: patient.childId })
      : await Visit.countDocuments({ patientPersonId: patient.personId });

    return res.json({
      success: true,
      patient: {
        id: patient._id,
        isMinor: isChild,
        firstName: profile.firstName,
        fatherName: profile.fatherName,
        lastName: profile.lastName,
        motherName: profile.motherName,
        nationalId: profile.nationalId || null,
        childRegistrationNumber: profile.childRegistrationNumber || null,
        phoneNumber: profile.phoneNumber,
        gender: profile.gender,
        dateOfBirth: profile.dateOfBirth,
        address: profile.address,
        governorate: profile.governorate,
        city: profile.city,
        email: account?.email,
        isActive: account?.isActive,
        bloodType: patient.bloodType,
        height: patient.height,
        weight: patient.weight,
        bmi: patient.bmi,
        allergies: patient.allergies || [],
        chronicDiseases: patient.chronicDiseases || [],
        familyHistory: patient.familyHistory || [],
        smokingStatus: patient.smokingStatus,
        emergencyContact: patient.emergencyContact,
        visitCount,
        totalVisits: patient.totalVisits || 0,
        lastVisitDate: patient.lastVisitDate,
        createdAt: patient.createdAt
      }
    });
  } catch (error) {
    console.error('Get patient error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب بيانات المريض'
    });
  }
};

// ============================================================================
// 10. UPDATE PATIENT
// ============================================================================

exports.updatePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const patient = await Patient.findById(id);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'المريض غير موجود'
      });
    }

    const patientFields = [
      'bloodType', 'rhFactor', 'height', 'weight',
      'smokingStatus', 'allergies', 'chronicDiseases',
      'familyHistory', 'emergencyContact'
    ];
    patientFields.forEach(field => {
      if (updates[field] !== undefined) patient[field] = updates[field];
    });
    await patient.save();

    const profileFields = ['phoneNumber', 'address', 'governorate', 'city'];
    const profileUpdates = {};
    profileFields.forEach(field => {
      if (updates[field]) profileUpdates[field] = updates[field];
    });

    if (Object.keys(profileUpdates).length > 0) {
      const Model = patient.childId ? Children : Person;
      const profileId = patient.childId || patient.personId;
      await Model.findByIdAndUpdate(profileId, profileUpdates);
    }

    return res.json({
      success: true,
      message: 'تم تحديث بيانات المريض بنجاح'
    });
  } catch (error) {
    console.error('Update patient error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحديث بيانات المريض'
    });
  }
};

// ============================================================================
// 11. DEACTIVATE PATIENT
// ============================================================================

exports.deactivatePatient = async (req, res) => {
  console.log('🔵 ========== DEACTIVATE PATIENT ==========');

  try {
    const { id } = req.params;
    const { reason, notes } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'سبب إلغاء التفعيل مطلوب'
      });
    }

    if (!ALLOWED_DEACTIVATION_REASONS.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: `سبب إلغاء التفعيل غير صالح. القيم المسموحة: ${ALLOWED_DEACTIVATION_REASONS.join(', ')}`
      });
    }

    const patient = await Patient.findById(id);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'المريض غير موجود'
      });
    }

    const accountQuery = patient.childId
      ? { childId: patient.childId }
      : { personId: patient.personId };

    await Account.findOneAndUpdate(
      accountQuery,
      {
        isActive: false,
        deactivationReason: reason,
        deactivatedAt: new Date(),
        deactivatedBy: req.user._id
      }
    );

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'DEACTIVATE_PATIENT',
      description: `Deactivated patient ${patient._id}`,
      resourceType: 'patient',
      resourceId: patient._id,
      patientPersonId: patient.personId,
      patientChildId: patient.childId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: { reason, notes: notes || null }
    });

    console.log('✅ Patient deactivated');
    return res.json({
      success: true,
      message: 'تم إلغاء تفعيل المريض بنجاح'
    });
  } catch (error) {
    console.error('❌ Deactivate patient error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إلغاء التفعيل'
    });
  }
};

// ============================================================================
// 12. ACTIVATE PATIENT
// ============================================================================

exports.activatePatient = async (req, res) => {
  console.log('🔵 ========== ACTIVATE PATIENT ==========');

  try {
    const { id } = req.params;

    const patient = await Patient.findById(id);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'المريض غير موجود'
      });
    }

    const accountQuery = patient.childId
      ? { childId: patient.childId }
      : { personId: patient.personId };

    await Account.findOneAndUpdate(
      accountQuery,
      {
        $set: { isActive: true },
        $unset: {
          deactivationReason: '',
          deactivatedAt: '',
          deactivatedBy: '',
          accountLockedUntil: '',
          failedLoginAttempts: ''
        }
      }
    );

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'ACTIVATE_PATIENT',
      description: `Reactivated patient ${patient._id}`,
      resourceType: 'patient',
      resourceId: patient._id,
      patientPersonId: patient.personId,
      patientChildId: patient.childId,
      ipAddress: req.ip || 'unknown',
      success: true
    });

    console.log('✅ Patient reactivated');
    return res.json({
      success: true,
      message: 'تم تفعيل المريض بنجاح'
    });
  } catch (error) {
    console.error('❌ Activate patient error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في التفعيل'
    });
  }
};

// ============================================================================
// 13. AUDIT LOGS
// ============================================================================

exports.getAuditLogs = async (req, res) => {
  try {
    // v3.0: expanded filters + complete response shape with all fields
    const {
      page = 1,
      limit = 50,
      action,
      userId,
      userEmail,
      userRole,
      platform,
      success,
      ipAddress,
      resourceType,
      search,
      startDate,
      endDate,
    } = req.query;

    const query = {};
    if (action)       query.action       = action.toUpperCase();
    if (userId)       query.userId       = userId;
    if (userEmail)    query.userEmail    = userEmail.toLowerCase();
    if (userRole)     query.userRole     = userRole;
    if (platform)     query.platform     = platform;
    if (ipAddress)    query.ipAddress    = ipAddress;
    if (resourceType) query.resourceType = resourceType;
    if (success !== undefined) query.success = success === 'true';

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate)   query.timestamp.$lte = new Date(endDate);
    }

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$or = [
        { description: searchRegex },
        { userEmail:   searchRegex },
        { ipAddress:   searchRegex },
        { action:      searchRegex },
      ];
    }

    const safeLimit = Math.min(parseInt(limit, 10) || 50, 200);
    const safePage  = Math.max(parseInt(page,  10) || 1,  1);

    const [logs, count] = await Promise.all([
      AuditLog.find(query)
        .populate('userId', 'email roles')
        .sort({ timestamp: -1 })
        .limit(safeLimit)
        .skip((safePage - 1) * safeLimit)
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    return res.json({
      success: true,
      count,
      total: count,
      page:  safePage,
      pages: Math.ceil(count / safeLimit),
      pagination: {
        total: count,
        page:  safePage,
        limit: safeLimit,
        pages: Math.ceil(count / safeLimit),
      },
      // v3.0: full audit fields exposed for Account Activity / forensic review
      logs: logs.map((log) => ({
        id:           log._id,
        action:       log.action,
        description:  log.description,
        resourceType: log.resourceType,
        resourceId:   log.resourceId,
        userId:       log.userId?._id || log.userId,
        userEmail:    log.userEmail   || log.userId?.email || null,
        userRole:     log.userRole,
        ipAddress:    log.ipAddress,
        userAgent:    log.userAgent || null,
        platform:     log.platform,
        deviceInfo:   log.deviceInfo || null,
        // Patient identifiers (XOR — only one is set per event)
        patientPersonId: log.patientPersonId || null,
        patientChildId:  log.patientChildId  || null,
        // Outcome
        success:       log.success,
        errorMessage:  log.errorMessage || null,
        statusCode:    log.statusCode   || null,
        // Extra context bag
        metadata:      log.metadata     || {},
        // Timestamps
        timestamp:     log.timestamp,
        createdAt:     log.createdAt,
      })),
    });
  } catch (error) {
    console.error('❌ Get audit logs error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب سجلات التدقيق',
      error: error.message,
    });
  }
};

// ============================================================================
// 13b. USER ACTIVITY REPORT — NEW in v3.0 (Account Activity security feature)
// ============================================================================

/**
 * GET /api/admin/audit-logs/user-activity?email=user@example.com&days=30
 *
 * Generates a comprehensive activity report for a single user account.
 * Used by the Account Activity panel in the Admin Dashboard System Log section.
 *
 * Returns:
 *   - Profile summary (account metadata)
 *   - Login statistics (success/failure counts, unique IPs, devices)
 *   - Security events timeline (locks, password changes, OTPs)
 *   - Resource actions (visits, prescriptions, lab tests)
 *   - Recent activity feed (last 50 events)
 */
exports.getUserActivityReport = async (req, res) => {
  try {
    const { email, days = 30 } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مطلوب',
      });
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days, 10));

    // ── Find account ────────────────────────────────────────────────────
    const account = await Account.findOne({ email: email.toLowerCase() })
      .populate('personId', 'firstName lastName nationalId phoneNumber')
      .populate('childId',  'firstName lastName childRegistrationNumber')
      .lean();

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'الحساب غير موجود',
      });
    }

    // ── Fetch all audit logs for this user in the date range ────────────
    const logs = await AuditLog.find({
      $or: [
        { userId:    account._id },
        { userEmail: account.email },
      ],
      timestamp: { $gte: sinceDate },
    }).sort({ timestamp: -1 }).lean();

    // ── Categorize events ──────────────────────────────────────────────
    const loginSuccess  = logs.filter(l => l.action === 'LOGIN_SUCCESS');
    const loginFailed   = logs.filter(l => l.action === 'LOGIN_FAILED');
    const logouts       = logs.filter(l => l.action === 'LOGOUT');
    const passwordEvents = logs.filter(l =>
      ['PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED', 'OTP_VERIFIED', 'OTP_FAILED'].includes(l.action),
    );
    const lockEvents    = logs.filter(l => l.action === 'ACCOUNT_LOCKED');
    const securityEvents = [...passwordEvents, ...lockEvents]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // ── Unique IP and device analysis ──────────────────────────────────
    const uniqueIPs        = [...new Set(logs.map(l => l.ipAddress).filter(Boolean))];
    const uniqueUserAgents = [...new Set(logs.map(l => l.userAgent).filter(Boolean))];
    const platformBreakdown = logs.reduce((acc, log) => {
      const platform = log.platform || 'unknown';
      acc[platform] = (acc[platform] || 0) + 1;
      return acc;
    }, {});

    // ── Resource action counts ─────────────────────────────────────────
    const resourceActionCounts = logs.reduce((acc, log) => {
      if (log.resourceType) {
        acc[log.resourceType] = (acc[log.resourceType] || 0) + 1;
      }
      return acc;
    }, {});

    // ── Find suspicious patterns (failed logins from different IPs) ────
    const failedFromIPs = [...new Set(loginFailed.map(l => l.ipAddress))];
    const hasSuspiciousActivity = failedFromIPs.length >= 3 || loginFailed.length >= 5;

    return res.json({
      success: true,
      report: {
        // ── Profile ────────────────────────────────────────────────────
        profile: {
          accountId:   account._id,
          email:       account.email,
          roles:       account.roles,
          isActive:    account.isActive,
          isVerified:  account.isVerified,
          createdAt:   account.createdAt,
          lastLogin:   account.lastLogin,
          lastLoginIp: account.lastLoginIp,
          language:    account.language,
          person:      account.personId,
          child:       account.childId,
          isLocked:    account.accountLockedUntil
                       && new Date(account.accountLockedUntil) > new Date(),
          failedLoginAttempts: account.failedLoginAttempts || 0,
        },

        // ── Time range covered ─────────────────────────────────────────
        dateRange: {
          since: sinceDate,
          until: new Date(),
          days:  parseInt(days, 10),
        },

        // ── Login statistics ───────────────────────────────────────────
        loginStats: {
          successfulLogins: loginSuccess.length,
          failedLogins:     loginFailed.length,
          logouts:          logouts.length,
          uniqueIPs:        uniqueIPs.length,
          uniqueDevices:    uniqueUserAgents.length,
          ipAddresses:      uniqueIPs,
          platformBreakdown,
        },

        // ── Security events ────────────────────────────────────────────
        security: {
          accountLocks:          lockEvents.length,
          passwordChanges:       passwordEvents.filter(e => e.action === 'PASSWORD_CHANGED').length,
          passwordResetRequests: passwordEvents.filter(e => e.action === 'PASSWORD_RESET_REQUESTED').length,
          otpVerified:           passwordEvents.filter(e => e.action === 'OTP_VERIFIED').length,
          otpFailed:             passwordEvents.filter(e => e.action === 'OTP_FAILED').length,
          hasSuspiciousActivity,
          suspiciousReason:      hasSuspiciousActivity
            ? `${loginFailed.length} failed logins from ${failedFromIPs.length} different IPs`
            : null,
          recentSecurityEvents:  securityEvents.slice(0, 10),
        },

        // ── Resource actions ───────────────────────────────────────────
        resourceActions: {
          counts:     resourceActionCounts,
          totalActions: logs.filter(l => l.resourceType).length,
        },

        // ── Recent activity feed (last 50 events) ──────────────────────
        recentActivity: logs.slice(0, 50).map((log) => ({
          id:          log._id,
          action:      log.action,
          description: log.description,
          ipAddress:   log.ipAddress,
          userAgent:   log.userAgent,
          platform:    log.platform,
          success:     log.success,
          timestamp:   log.timestamp,
          metadata:    log.metadata,
        })),

        // ── Total event count in range ─────────────────────────────────
        totalEvents: logs.length,
      },
    });
  } catch (error) {
    console.error('❌ Get user activity report error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إنشاء تقرير النشاط',
      error: error.message,
    });
  }
};

// ============================================================================
// 14. GET USER AUDIT LOGS
// ============================================================================

exports.getUserAuditLogs = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const safeLimit = Math.min(parseInt(limit, 10) || 50, 200);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);

    const [logs, count] = await Promise.all([
      AuditLog.find({ userId })
        .sort({ timestamp: -1 })
        .limit(safeLimit)
        .skip((safePage - 1) * safeLimit)
        .lean(),
      AuditLog.countDocuments({ userId })
    ]);

    return res.json({
      success: true,
      count,
      page: safePage,
      pages: Math.ceil(count / safeLimit),
      logs
    });
  } catch (error) {
    console.error('Get user audit logs error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب سجلات المستخدم'
    });
  }
};

// ============================================================================
// 15. GET ALL DOCTOR REQUESTS
// ============================================================================

exports.getAllDoctorRequests = async (req, res) => {
  try {
    console.log('📋 Fetching doctor requests...');

    // v3.0: added requestType + search + pagination filters
    const {
      status,
      requestType,         // 'doctor' | 'pharmacist' | 'lab_technician'
      specialization,
      governorate,
      search,
      page = 1,
      limit = 100,
    } = req.query;

    const query = {};
    if (status)         query.status         = status;
    if (requestType)    query.requestType    = requestType;
    if (specialization) query.specialization = specialization;
    if (governorate)    query.governorate    = governorate;

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$or = [
        { firstName:            searchRegex },
        { lastName:             searchRegex },
        { nationalId:           searchRegex },
        { email:                searchRegex },
        { phoneNumber:          searchRegex },
        { medicalLicenseNumber: searchRegex },
      ];
    }

    // Get count BEFORE pagination so the frontend chip badges are accurate
    const total = await DoctorRequest.countDocuments(query);

    const requests = await DoctorRequest.find(query)
      .populate('reviewedBy', 'email')
      .populate('createdPersonId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    console.log(`✅ Found ${requests.length} of ${total} matching requests`);

    // Flatten to the shape AdminDashboard.jsx expects. Professional-specific
    // fields (pharmacist/lab tech) are included alongside doctor fields so
    // the UI can read what it needs based on requestType.
    const flattened = requests.map((r) => ({
      // Identity
      _id: r._id,
      requestId: r.requestId,

      // Personal information (FLAT — do not wrap in personalInfo)
      firstName: r.firstName,
      fatherName: r.fatherName,
      lastName: r.lastName,
      motherName: r.motherName,
      nationalId: r.nationalId,
      dateOfBirth: r.dateOfBirth,
      gender: r.gender,
      phoneNumber: r.phoneNumber,
      address: r.address,
      governorate: r.governorate,
      city: r.city,

      // Account
      email: r.email,

      // Doctor-specific fields (only set when requestType='doctor')
      medicalLicenseNumber: r.medicalLicenseNumber,
      specialization: r.specialization,
      subSpecialization: r.subSpecialization,
      yearsOfExperience: r.yearsOfExperience,
      hospitalAffiliation: r.hospitalAffiliation,
      availableDays: r.availableDays || [],
      consultationFee: r.consultationFee,
      currency: r.currency || 'SYP',

      // Pharmacist-specific fields
      pharmacyLicenseNumber: r.pharmacyLicenseNumber,
      degree: r.degree,
      employmentType: r.employmentType,
      pharmacyId: r.pharmacyId,
      newPharmacyData: r.newPharmacyData,

      // Lab technician-specific fields
      licenseNumber: r.licenseNumber,
      position: r.position,
      laboratoryId: r.laboratoryId,
      newLaboratoryData: r.newLaboratoryData,

      // Uploaded document URLs — lifted to top-level *Url keys
      licenseDocumentUrl: r.licenseDocument?.fileUrl || r.licenseDocumentUrl || null,
      medicalCertificateUrl: r.medicalCertificate?.fileUrl || null,
      degreeDocumentUrl: r.degreeDocument?.fileUrl || r.degreeDocumentUrl || null,
      profilePhotoUrl: r.profilePhoto?.fileUrl || null,

      // Review workflow
      status: r.status,
      requestType: r.requestType || 'doctor',
      rejectionReason: r.rejectionReason,
      rejectionDetails: r.rejectionDetails,
      adminNotes: r.adminNotes,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt,
      createdPersonId: r.createdPersonId,

      // Timestamps
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));

    return res.json({
      success: true,
      count: flattened.length,
      total,
      requests: flattened,
      pagination: {
        total,
        page:  Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('❌ Error fetching doctor requests:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب طلبات التسجيل'
    });
  }
};

// ============================================================================
// 16. GET DOCTOR REQUEST BY ID
// ============================================================================

exports.getDoctorRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await DoctorRequest.findById(id)
      .populate('reviewedBy', 'email')
      .populate('createdPersonId', 'firstName lastName')
      .populate('createdAccountId', 'email')
      .populate('createdDoctorId')
      .lean();

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'طلب التسجيل غير موجود'
      });
    }

    return res.json({ success: true, request });
  } catch (error) {
    console.error('❌ Error fetching doctor request:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب تفاصيل الطلب'
    });
  }
};

// ============================================================================
// 17. APPROVE PROFESSIONAL REQUEST (doctor / pharmacist / lab_technician)
// ──────────────────────────────────────────────────────────────────────────
// ⚠️  This function was completely rewritten in v2 to:
//
//   1. Handle BOTH scenarios for pharmacist / lab_technician:
//        (a) Applicant selected an existing facility  → request.pharmacyId
//            / request.laboratoryId is already set    → use directly
//        (b) Applicant reported a new facility        → request.newPharmacyData
//            / request.newLaboratoryData is set       → CREATE the facility
//            on the fly, then use the new _id
//
//   2. Manual rollback across ALL create steps.
//      MongoDB transactions are NOT used because this deployment is a
//      standalone mongod (confirmed via `rs.status()` → NoReplicationEnabled).
//      If step N fails, we delete everything created in steps 1..N-1, in
//      REVERSE order, so the DB remains clean. Orphan records are never
//      left behind.
//
//   3. Reject the request (with NO partial data created) if the applicant
//      did NOT supply facility info AND no new facility data is present.
//      For pharmacist → pharmacyId or newPharmacyData required.
//      For lab tech   → laboratoryId or newLaboratoryData required.
//
// ============================================================================

/**
 * Helper: build Laboratory payload from newLaboratoryData in a DoctorRequest.
 * The request carries a loosely-typed Mixed object; here we validate the
 * required schema fields and normalise into the strict Laboratory shape.
 *
 * Throws a user-facing Arabic error on missing required fields.
 */
function buildLaboratoryPayload(newData, applicant) {
  if (!newData || typeof newData !== 'object') {
    throw new Error('بيانات المختبر الجديد غير صالحة');
  }

  const name = (newData.name || '').trim();
  const license = (newData.license || newData.registrationNumber || '').trim();
  const governorate = newData.governorate;
  const city = (newData.city || '').trim();
  const address = (newData.address || '').trim();

  if (!name) throw new Error('اسم المختبر الجديد مطلوب');
  if (!license) throw new Error('رقم ترخيص المختبر الجديد مطلوب');
  if (!governorate) throw new Error('محافظة المختبر الجديد مطلوبة');
  if (!city) throw new Error('مدينة المختبر الجديد مطلوبة');
  if (!address) throw new Error('عنوان المختبر الجديد مطلوب');

  // Placeholder GeoJSON at the center of the chosen governorate — Laboratory
  // schema validator requires coordinates within Syria. Admin can refine
  // the exact coordinates later via the Laboratories admin panel.
  const GOVERNORATE_CENTROIDS = {
    damascus:     [36.2765, 33.5138],
    rif_dimashq:  [36.3090, 33.5238],
    aleppo:       [37.1613, 36.2021],
    homs:         [36.7156, 34.7324],
    hama:         [36.7443, 35.1318],
    latakia:      [35.7833, 35.5167],
    tartus:       [35.8867, 34.8890],
    idlib:        [36.6335, 35.9306],
    deir_ez_zor:  [40.1500, 35.3333],
    raqqa:        [39.0167, 35.9500],
    hasakah:      [40.7417, 36.4833],
    daraa:        [36.1062, 32.6189],
    as_suwayda:   [36.5697, 32.7095],
    quneitra:     [35.8242, 33.1258]
  };
  const coords = GOVERNORATE_CENTROIDS[governorate] || [36.2765, 33.5138];

  return {
    name,
    arabicName: name,
    registrationNumber: license.toUpperCase(),
    labLicense: license.toUpperCase(),
    labType: 'independent',
    phoneNumber: applicant.phoneNumber || '0000000000',
    governorate,
    city,
    address,
    location: {
      type: 'Point',
      coordinates: coords
    },
    isActive: true,
    isAcceptingTests: true
  };
}

/**
 * Helper: build Pharmacy payload from newPharmacyData in a DoctorRequest.
 */
function buildPharmacyPayload(newData, applicant) {
  if (!newData || typeof newData !== 'object') {
    throw new Error('بيانات الصيدلية الجديدة غير صالحة');
  }

  const name = (newData.name || '').trim();
  const license = (newData.license || newData.pharmacyLicense || '').trim();
  const governorate = newData.governorate;
  const city = (newData.city || '').trim();
  const address = (newData.address || '').trim();

  if (!name) throw new Error('اسم الصيدلية الجديدة مطلوب');
  if (!license) throw new Error('رقم ترخيص الصيدلية الجديدة مطلوب');
  if (!governorate) throw new Error('محافظة الصيدلية الجديدة مطلوبة');
  if (!city) throw new Error('مدينة الصيدلية الجديدة مطلوبة');
  if (!address) throw new Error('عنوان الصيدلية الجديدة مطلوب');

  const GOVERNORATE_CENTROIDS = {
    damascus:     [36.2765, 33.5138],
    rif_dimashq:  [36.3090, 33.5238],
    aleppo:       [37.1613, 36.2021],
    homs:         [36.7156, 34.7324],
    hama:         [36.7443, 35.1318],
    latakia:      [35.7833, 35.5167],
    tartus:       [35.8867, 34.8890],
    idlib:        [36.6335, 35.9306],
    deir_ez_zor:  [40.1500, 35.3333],
    raqqa:        [39.0167, 35.9500],
    hasakah:      [40.7417, 36.4833],
    daraa:        [36.1062, 32.6189],
    as_suwayda:   [36.5697, 32.7095],
    quneitra:     [35.8242, 33.1258]
  };
  const coords = GOVERNORATE_CENTROIDS[governorate] || [36.2765, 33.5138];

  // Pharmacy schema requires BOTH registrationNumber and pharmacyLicense
  // (two separate unique indexes). The applicant provides one value, so
  // we reuse it for both — if this collides later, the admin can edit it.
  return {
    name,
    arabicName: name,
    registrationNumber: license.toUpperCase(),
    pharmacyLicense: license.toUpperCase(),
    pharmacyType: 'community',
    phoneNumber: applicant.phoneNumber || '0000000000',
    governorate,
    city,
    address,
    location: {
      type: 'Point',
      coordinates: coords
    },
    isActive: true,
    isAcceptingOrders: true
  };
}

exports.approveDoctorRequest = async (req, res) => {
  console.log('✅ ========== APPROVE PROFESSIONAL REQUEST ==========');

  // ── Rollback bookkeeping ──────────────────────────────────────────────
  // We track every document we create so we can delete them in reverse
  // order if any step fails. This is a manual substitute for a Mongoose
  // transaction (this deployment is a standalone mongod, no replica set).
  const createdIds = {
    laboratoryId: null,
    pharmacyId: null,
    personId: null,
    accountId: null,
    professionalId: null
  };

  const rollback = async (reason) => {
    console.error(`🔄 Rolling back because: ${reason}`);
    try {
      if (createdIds.professionalId) {
        // We don't know the professional model at rollback time if the
        // error was very early — safest to try all three but log outcomes.
        await Promise.all([
          Doctor.deleteOne({ _id: createdIds.professionalId }).catch(() => null),
          Pharmacist.deleteOne({ _id: createdIds.professionalId }).catch(() => null),
          LabTechnician.deleteOne({ _id: createdIds.professionalId }).catch(() => null)
        ]);
      }
      if (createdIds.accountId) {
        await Account.deleteOne({ _id: createdIds.accountId }).catch(() => null);
      }
      if (createdIds.personId) {
        await Person.deleteOne({ _id: createdIds.personId }).catch(() => null);
      }
      if (createdIds.laboratoryId) {
        await Laboratory.deleteOne({ _id: createdIds.laboratoryId }).catch(() => null);
      }
      if (createdIds.pharmacyId) {
        await Pharmacy.deleteOne({ _id: createdIds.pharmacyId }).catch(() => null);
      }
      console.log('🔄 Rollback complete');
    } catch (rollbackErr) {
      console.error('⚠️  Rollback itself errored (non-fatal):', rollbackErr.message);
    }
  };

  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    // ── Load the request WITH plainPassword & password (select:false in schema)
    const request = await DoctorRequest.findById(id).select('+plainPassword +password');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'طلب التسجيل غير موجود'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `هذا الطلب ${request.status === 'approved' ? 'مقبول' : 'مرفوض'} مسبقاً`
      });
    }

    const requestType = request.requestType || 'doctor';
    console.log(`📋 Request type: ${requestType}`);
    console.log(`📋 Applicant: ${request.firstName} ${request.lastName} (${request.email})`);

    // ══════════════════════════════════════════════════════════════════
    // PRE-FLIGHT CHECKS — validate facility info BEFORE creating anything
    // ══════════════════════════════════════════════════════════════════

    if (requestType === 'pharmacist') {
      const hasExisting = !!request.pharmacyId;
      const hasNew = !!(request.newPharmacyData && Object.keys(request.newPharmacyData).length > 0);
      if (!hasExisting && !hasNew) {
        return res.status(400).json({
          success: false,
          message: 'لا يمكن قبول الطلب: لم يحدد المتقدم صيدلية موجودة ولم يقدم بيانات صيدلية جديدة'
        });
      }
      if (hasExisting) {
        const pharmExists = await Pharmacy.findById(request.pharmacyId);
        if (!pharmExists) {
          return res.status(400).json({
            success: false,
            message: 'الصيدلية المحددة في الطلب غير موجودة في النظام (ربما حُذفت). يرجى مراجعة الطلب.'
          });
        }
      }
    }

    if (requestType === 'lab_technician') {
      const hasExisting = !!request.laboratoryId;
      const hasNew = !!(request.newLaboratoryData && Object.keys(request.newLaboratoryData).length > 0);
      if (!hasExisting && !hasNew) {
        return res.status(400).json({
          success: false,
          message: 'لا يمكن قبول الطلب: لم يحدد المتقدم مختبراً موجوداً ولم يقدم بيانات مختبر جديد'
        });
      }
      if (hasExisting) {
        const labExists = await Laboratory.findById(request.laboratoryId);
        if (!labExists) {
          return res.status(400).json({
            success: false,
            message: 'المختبر المحدد في الطلب غير موجود في النظام (ربما حُذف). يرجى مراجعة الطلب.'
          });
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // STEP 0 — (if needed) CREATE NEW FACILITY FIRST
    // We do this BEFORE Person/Account so the facility has a stable _id
    // for the LabTechnician/Pharmacist creation downstream.
    // ══════════════════════════════════════════════════════════════════

    let resolvedFacilityId = null;

    if (requestType === 'lab_technician') {
      if (request.laboratoryId) {
        resolvedFacilityId = request.laboratoryId;
        console.log(`🏢 Using existing laboratory: ${resolvedFacilityId}`);
      } else {
        console.log('🏢 Creating new Laboratory from newLaboratoryData...');
        try {
          const labPayload = buildLaboratoryPayload(request.newLaboratoryData, {
            phoneNumber: request.phoneNumber
          });
          const newLab = await Laboratory.create(labPayload);
          createdIds.laboratoryId = newLab._id;
          resolvedFacilityId = newLab._id;
          console.log(`✅ New Laboratory created: ${newLab._id} (${newLab.name})`);
        } catch (labErr) {
          console.error('❌ Laboratory creation failed:', labErr.message);
          await rollback('Laboratory.create failed');
          // Handle duplicate registrationNumber specifically
          if (labErr.code === 11000) {
            return res.status(400).json({
              success: false,
              message: 'رقم ترخيص المختبر الجديد مستخدم بالفعل. يرجى مراجعة البيانات.'
            });
          }
          return res.status(400).json({
            success: false,
            message: 'فشل إنشاء المختبر الجديد: ' + labErr.message
          });
        }
      }
    }

    if (requestType === 'pharmacist') {
      if (request.pharmacyId) {
        resolvedFacilityId = request.pharmacyId;
        console.log(`🏢 Using existing pharmacy: ${resolvedFacilityId}`);
      } else {
        console.log('🏢 Creating new Pharmacy from newPharmacyData...');
        try {
          const pharmPayload = buildPharmacyPayload(request.newPharmacyData, {
            phoneNumber: request.phoneNumber
          });
          const newPharm = await Pharmacy.create(pharmPayload);
          createdIds.pharmacyId = newPharm._id;
          resolvedFacilityId = newPharm._id;
          console.log(`✅ New Pharmacy created: ${newPharm._id} (${newPharm.name})`);
        } catch (pharmErr) {
          console.error('❌ Pharmacy creation failed:', pharmErr.message);
          await rollback('Pharmacy.create failed');
          if (pharmErr.code === 11000) {
            return res.status(400).json({
              success: false,
              message: 'رقم ترخيص الصيدلية الجديدة مستخدم بالفعل. يرجى مراجعة البيانات.'
            });
          }
          return res.status(400).json({
            success: false,
            message: 'فشل إنشاء الصيدلية الجديدة: ' + pharmErr.message
          });
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // STEP 1 — CREATE PERSON (shared across all types)
    // ══════════════════════════════════════════════════════════════════

    console.log('1️⃣ Creating Person...');
    let person;
    try {
      person = await Person.create({
        nationalId: request.nationalId,
        firstName: request.firstName,
        fatherName: request.fatherName,
        lastName: request.lastName,
        motherName: request.motherName,
        dateOfBirth: request.dateOfBirth,
        gender: request.gender,
        phoneNumber: request.phoneNumber,
        address: request.address,
        governorate: request.governorate,
        city: request.city
      });
      createdIds.personId = person._id;
      console.log(`✅ Person created: ${person._id}`);
    } catch (personErr) {
      console.error('❌ Person creation failed:', personErr.message);
      await rollback('Person.create failed');
      if (personErr.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'الرقم الوطني موجود مسبقاً في النظام'
        });
      }
      throw personErr;
    }

    // ══════════════════════════════════════════════════════════════════
    // STEP 2 — CREATE ACCOUNT (check email uniqueness first)
    // ══════════════════════════════════════════════════════════════════

    console.log('2️⃣ Creating Account...');
    const emailToUse = request.email.trim().toLowerCase();

    const existingAccount = await Account.findOne({ email: emailToUse });
    if (existingAccount) {
      console.error(`❌ Email already taken: ${emailToUse}`);
      await rollback('Account email collision');
      return res.status(400).json({
        success: false,
        message: `البريد الإلكتروني ${emailToUse} موجود مسبقاً في النظام`
      });
    }

    const roleMap = {
      doctor: 'doctor',
      pharmacist: 'pharmacist',
      lab_technician: 'lab_technician'
    };

    let account;
    try {
      account = await Account.create({
        email: emailToUse,
        password: request.password,   // already bcrypt-hashed by authController at signup
        roles: [roleMap[requestType] || 'doctor'],
        personId: person._id,
        isActive: true
      });
      createdIds.accountId = account._id;
      console.log(`✅ Account created: ${account._id} (role: ${account.roles[0]})`);
    } catch (accountErr) {
      console.error('❌ Account creation failed:', accountErr.message);
      await rollback('Account.create failed');
      throw accountErr;
    }

    // ══════════════════════════════════════════════════════════════════
    // STEP 3 — CREATE PROFESSIONAL RECORD (branches by requestType)
    // ══════════════════════════════════════════════════════════════════

    let professionalRecord;

    try {
      if (requestType === 'doctor') {
        console.log('3️⃣ Creating Doctor...');
        professionalRecord = await Doctor.create({
          personId: person._id,
          medicalLicenseNumber: request.medicalLicenseNumber,
          specialization: request.specialization,
          ...(request.subSpecialization && request.subSpecialization.trim()
            ? { subSpecialization: request.subSpecialization }
            : {}),
          yearsOfExperience: request.yearsOfExperience,
          hospitalAffiliation: request.hospitalAffiliation,
          availableDays: request.availableDays || [],
          ...(request.scheduleTemplate
            ? { scheduleTemplate: request.scheduleTemplate.toObject
                  ? request.scheduleTemplate.toObject()
                  : request.scheduleTemplate }
            : {}),
          consultationFee: request.consultationFee,
          currency: request.currency || 'SYP'
        });
        createdIds.professionalId = professionalRecord._id;
        console.log(`✅ Doctor created: ${professionalRecord._id}`);

        // ── Auto-generate availability_slots from the schedule template ──
        // Non-fatal: if generation fails (e.g. template is invalid), the
        // doctor account is still approved successfully. The doctor can
        // manually trigger regeneration later from their dashboard.
        if (
          professionalRecord.scheduleTemplate &&
          professionalRecord.scheduleTemplate.isActive !== false
        ) {
          try {
            const slotResult = await slotController.regenerateSlotsForDoctor(
              professionalRecord
            );
            console.log(
              `✅ Auto-generated ${slotResult.inserted} availability slots ` +
              `from schedule template`
            );
          } catch (slotErr) {
            console.error(
              '⚠️  Initial slot generation failed (non-fatal):',
              slotErr.message
            );
          }
        } else {
          console.log(
            'ℹ️  Doctor has no active schedule template — skipping slot generation'
          );
        }

      } else if (requestType === 'pharmacist') {
        console.log('3️⃣ Creating Pharmacist...');
        professionalRecord = await Pharmacist.create({
          personId: person._id,
          pharmacyLicenseNumber: request.pharmacyLicenseNumber,
          pharmacyId: resolvedFacilityId,  // ⭐ resolved above (existing or newly created)
          ...(request.degree && { degree: request.degree }),
          ...(request.specialization && { specialization: request.specialization }),
          yearsOfExperience: request.yearsOfExperience || 0,
          ...(request.employmentType && { employmentType: request.employmentType }),
          isAvailable: true,
          totalPrescriptionsDispensed: 0
        });
        createdIds.professionalId = professionalRecord._id;
        console.log(`✅ Pharmacist created: ${professionalRecord._id}`);

      } else if (requestType === 'lab_technician') {
        console.log('3️⃣ Creating LabTechnician...');
        professionalRecord = await LabTechnician.create({
          personId: person._id,
          licenseNumber: request.licenseNumber,
          laboratoryId: resolvedFacilityId,  // ⭐ resolved above (existing or newly created)
          ...(request.degree && { degree: request.degree }),
          ...(request.specialization && { specialization: request.specialization }),
          ...(request.position && { position: request.position }),
          yearsOfExperience: request.yearsOfExperience || 0,
          isAvailable: true,
          totalTestsPerformed: 0
        });
        createdIds.professionalId = professionalRecord._id;
        console.log(`✅ LabTechnician created: ${professionalRecord._id}`);

      } else {
        throw new Error(`Unknown requestType: ${requestType}`);
      }

    } catch (profErr) {
      console.error('❌ Professional record creation failed:', profErr.message);
      await rollback('Professional.create failed');

      if (profErr.code === 11000) {
        const field = Object.keys(profErr.keyPattern || {})[0];
        const arabicFields = {
          medicalLicenseNumber: 'رقم الترخيص الطبي',
          pharmacyLicenseNumber: 'رقم ترخيص الصيدلية',
          licenseNumber: 'رقم الترخيص المهني',
          personId: 'الشخص'
        };
        return res.status(400).json({
          success: false,
          message: `${arabicFields[field] || field} موجود مسبقاً في النظام`
        });
      }

      if (profErr.name === 'ValidationError') {
        const messages = Object.values(profErr.errors).map(e => e.message);
        return res.status(400).json({
          success: false,
          message: `فشل التحقق من البيانات: ${messages.join(', ')}`
        });
      }

      return res.status(500).json({
        success: false,
        message: 'فشل إنشاء السجل المهني: ' + profErr.message
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // STEP 4 — MARK REQUEST APPROVED (final success step)
    // ══════════════════════════════════════════════════════════════════

    try {
      await request.markApproved(
        req.user._id,
        {
          personId: person._id,
          accountId: account._id,
          doctorId: professionalRecord._id
        },
        adminNotes
      );
      console.log('✅ Request marked approved');
    } catch (markErr) {
      // At this point all creates succeeded — if markApproved fails we still
      // consider the approval successful and log the status discrepancy, because
      // rolling back 4 successful creates over a status bookkeeping error would
      // be worse than leaving the request in 'pending' (the admin can retry).
      console.error('⚠️  markApproved failed but all records created. Manual fix needed:', markErr.message);
    }

    // ── Audit log (fire-and-forget)
    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: `APPROVE_${requestType.toUpperCase()}_REQUEST`,
      description: `Approved ${requestType} request for ${emailToUse}`,
      resourceType: 'doctor_request',
      resourceId: request._id,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        professionalId: professionalRecord._id,
        professionalType: requestType,
        facilityId: resolvedFacilityId || null,
        facilityCreated: !!(createdIds.laboratoryId || createdIds.pharmacyId)
      }
    });

    const typeLabels = {
      doctor: 'الطبيب',
      pharmacist: 'الصيدلي',
      lab_technician: 'فني المختبر'
    };

    return res.json({
      success: true,
      message: `تم قبول طلب التسجيل وإنشاء حساب ${typeLabels[requestType]} بنجاح`,
      data: {
        professionalId: professionalRecord._id,
        professionalType: requestType,
        personId: person._id,
        accountId: account._id,
        email: emailToUse,
        password: request.plainPassword,
        fullName: `${person.firstName} ${person.lastName}`,
        facilityId: resolvedFacilityId || null,
        facilityCreated: !!(createdIds.laboratoryId || createdIds.pharmacyId)
      }
    });

  } catch (error) {
    console.error('❌ Unexpected error approving request:', error);
    await rollback('unexpected error in outer try/catch');

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      const arabicFields = {
        nationalId: 'الرقم الوطني',
        email: 'البريد الإلكتروني',
        medicalLicenseNumber: 'رقم الترخيص الطبي',
        pharmacyLicenseNumber: 'رقم ترخيص الصيدلية',
        licenseNumber: 'رقم الترخيص'
      };
      return res.status(400).json({
        success: false,
        message: `${arabicFields[field] || field} موجود مسبقاً في النظام`
      });
    }

    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء قبول الطلب: ' + error.message
    });
  }
};

// ============================================================================
// 18. REJECT DOCTOR REQUEST
// ============================================================================

exports.rejectDoctorRequest = async (req, res) => {
  console.log('❌ ========== REJECT DOCTOR REQUEST ==========');

  try {
    const { id } = req.params;
    const { rejectionReason, rejectionDetails } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'سبب الرفض مطلوب'
      });
    }

    const request = await DoctorRequest.findById(id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'طلب التسجيل غير موجود'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `هذا الطلب ${request.status === 'approved' ? 'مقبول' : 'مرفوض'} مسبقاً`
      });
    }

    try {
      await request.markRejected(req.user._id, rejectionReason, rejectionDetails);
    } catch (modelError) {
      return res.status(400).json({
        success: false,
        message: modelError.message
      });
    }

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'REJECT_DOCTOR_REQUEST',
      description: `Rejected doctor request for ${request.email}`,
      resourceType: 'doctor_request',
      resourceId: request._id,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: { rejectionReason, rejectionDetails }
    });

    console.log('✅ Request rejected');
    return res.json({
      success: true,
      message: 'تم رفض طلب التسجيل',
      data: {
        requestId: request._id,
        doctorName: `${request.firstName} ${request.lastName}`,
        email: request.email,
        rejectionReason: request.rejectionReason,
        rejectionDetails: request.rejectionDetails,
        reviewedAt: request.reviewedAt
      }
    });

  } catch (error) {
    console.error('❌ Error rejecting doctor request:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء رفض الطلب'
    });
  }
};
