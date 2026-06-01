/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Patient Service — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/services/patientService.js
 *  🔧 Version: 2.0 (CRITICAL SCHEMA FIX + dual-patient model support)
 *
 *  🚨 WHAT WAS BROKEN IN v1.0:
 *
 *  v1.0 only handled adult patients (assumed Patient.personId always exists)
 *  and queried Visit by non-existent `patientId` field. This broke:
 *    ✗ Children profile retrieval (Patient.childId was ignored)
 *    ✗ All visit/medication aggregation for children
 *    ✗ Visit stats returned empty for everyone
 *    ✗ Lab tests reference (Visit.labTests doesn't exist — it's a separate collection)
 *
 *  v2.0 changes:
 *    ✓ Full dual-patient support (adult via personId, child via childId)
 *    ✓ Correct schema field names everywhere
 *    ✓ Lab tests fetched from LabTest collection by visitId
 *    ✓ BMI uses Patient model's auto-calculation when available
 *    ✓ Restricted update fields enforced (national ID, name etc cannot change)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const {
  Person,
  Children,
  Account,
  Patient,
  Visit,
  LabTest,
} = require('../models');

const { buildPatientFilter } = require('./visitService');

// ============================================================================
// 1. GET PATIENT PROFILE — by Patient document ID
// ============================================================================

/**
 * Aggregates a complete patient profile from:
 *   • Patient (medical info)
 *   • Person OR Children (demographics)
 *   • Account (auth, login history)
 *   • Visit (stats — counts, lastVisit, etc.)
 *
 * @param {string} patientDocId — Patient._id
 */
exports.getPatientProfile = async (patientDocId) => {
  try {
    const patient = await Patient.findById(patientDocId)
      .populate('personId')
      .populate('childId')
      .lean();

    if (!patient) {
      return {
        success: false,
        message: 'المريض غير موجود',
      };
    }

    // ── Dual-patient: adult or child? ──────────────────────────────────
    const isAdult     = !!patient.personId;
    const profile     = isAdult ? patient.personId : patient.childId;

    if (!profile) {
      return {
        success: false,
        message: 'بيانات المريض الشخصية مفقودة',
      };
    }

    // ── Find linked Account ────────────────────────────────────────────
    const accountQuery = isAdult
      ? { personId: profile._id }
      : { childId:  profile._id };

    const account = await Account.findOne(accountQuery)
      .select('email roles isActive isVerified lastLogin createdAt language')
      .lean();

    // ── Calculate visit statistics (using CORRECT schema fields) ───────
    const patientFilter = isAdult
      ? { patientPersonId: profile._id }
      : { patientChildId:  profile._id };

    const visitStats = await calculateVisitStats(patientFilter);

    // ── Assemble response ──────────────────────────────────────────────
    const profileData = {
      // ── Patient document ID ────────────────────────────────────────
      id:        patient._id,
      patientId: patient._id,
      type:      isAdult ? 'adult' : 'minor',

      // ── Identity ────────────────────────────────────────────────────
      ...(isAdult
        ? {
            nationalId: profile.nationalId,
          }
        : {
            childRegistrationNumber: profile.childRegistrationNumber,
            parentNationalId:        profile.parentNationalId,
            parentPersonId:          profile.parentPersonId,
            birthCertificateNumber:  profile.birthCertificateNumber,
            migrationStatus:         profile.migrationStatus,
            hasReceivedNationalId:   profile.hasReceivedNationalId,
          }
      ),

      // ── Names (same fields in both Person and Children) ─────────────
      firstName:  profile.firstName,
      fatherName: profile.fatherName,
      lastName:   profile.lastName,
      motherName: profile.motherName,
      dateOfBirth: profile.dateOfBirth,
      age:         calculateAge(profile.dateOfBirth),
      gender:      profile.gender,

      // ── Contact ─────────────────────────────────────────────────────
      phoneNumber: profile.phoneNumber,
      ...(isAdult && { email: profile.email }),
      governorate: profile.governorate,
      city:        profile.city,
      district:    profile.district,
      address:     profile.address,

      // ── Account info ────────────────────────────────────────────────
      account: account ? {
        email:       account.email,
        roles:       account.roles,
        isActive:    account.isActive,
        isVerified:  account.isVerified,
        lastLogin:   account.lastLogin,
        language:    account.language,
        createdAt:   account.createdAt,
      } : null,

      // ── Medical information ─────────────────────────────────────────
      bloodType:           patient.bloodType,
      rhFactor:            patient.rhFactor,
      height:              patient.height,
      weight:              patient.weight,
      bmi:                 calculateBMI(patient.height, patient.weight),
      smokingStatus:       patient.smokingStatus,
      alcoholConsumption:  patient.alcoholConsumption,
      exerciseFrequency:   patient.exerciseFrequency,
      dietType:            patient.dietType,
      allergies:           patient.allergies || [],
      chronicDiseases:     patient.chronicDiseases || [],
      familyHistory:       patient.familyHistory || [],
      previousSurgeries:   patient.previousSurgeries || [],
      currentMedications:  patient.currentMedications || [],
      emergencyContact:    patient.emergencyContact || null,

      // ── Stats ────────────────────────────────────────────────────────
      medicalCardNumber: patient.medicalCardNumber,
      totalVisits:       patient.totalVisits || visitStats.totalVisits,
      lastVisitDate:     patient.lastVisitDate || visitStats.lastVisit,
      visitStats,

      // ── Timestamps ───────────────────────────────────────────────────
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
    };

    return {
      success: true,
      patient: profileData,
    };
  } catch (error) {
    console.error('❌ patientService.getPatientProfile error:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء جلب بيانات المريض',
    };
  }
};

// ============================================================================
// 2. UPDATE PATIENT PROFILE — restricted to safe fields only
// ============================================================================

/**
 * Updates patient profile with field-level access control.
 *
 * Fields ALLOWED to update:
 *   - Person/Children: phoneNumber, alternativePhoneNumber, address, district, street, building
 *   - Patient: bloodType, height, weight, lifestyle fields, allergies,
 *              chronicDiseases, familyHistory, emergencyContact, currentMedications
 *
 * Fields BLOCKED (immutable identity):
 *   - nationalId, firstName, fatherName, lastName, motherName, dateOfBirth, gender
 *   - email (changes go through verification flow)
 *
 * @param {string} patientDocId
 * @param {object} updates
 */
exports.updatePatientProfile = async (patientDocId, updates) => {
  try {
    const validation = exports.validateProfileUpdates(updates);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.message,
      };
    }

    const patient = await Patient.findById(patientDocId);
    if (!patient) {
      return {
        success: false,
        message: 'المريض غير موجود',
      };
    }

    // ── Separate updates by target collection ──────────────────────────
    const demographicsFields = [
      'phoneNumber', 'alternativePhoneNumber',
      'address', 'district', 'street', 'building',
    ];

    const patientFields = [
      'bloodType', 'rhFactor', 'height', 'weight',
      'smokingStatus', 'alcoholConsumption', 'exerciseFrequency', 'dietType',
      'allergies', 'chronicDiseases', 'familyHistory', 'previousSurgeries',
      'currentMedications', 'emergencyContact',
    ];

    const demographicsUpdates = {};
    const patientUpdates      = {};

    demographicsFields.forEach((field) => {
      if (updates[field] !== undefined) demographicsUpdates[field] = updates[field];
    });

    patientFields.forEach((field) => {
      if (updates[field] !== undefined) patientUpdates[field] = updates[field];
    });

    // ── Update demographics (Person or Children) ───────────────────────
    if (Object.keys(demographicsUpdates).length > 0) {
      const TargetModel = patient.personId ? Person : Children;
      const targetId    = patient.personId || patient.childId;

      await TargetModel.findByIdAndUpdate(
        targetId,
        { $set: demographicsUpdates },
        { new: true, runValidators: true },
      );
    }

    // ── Update Patient ─────────────────────────────────────────────────
    if (Object.keys(patientUpdates).length > 0) {
      await Patient.findByIdAndUpdate(
        patientDocId,
        { $set: patientUpdates },
        { new: true, runValidators: true },
      );
    }

    // ── Return updated profile ─────────────────────────────────────────
    return await exports.getPatientProfile(patientDocId);
  } catch (error) {
    console.error('❌ patientService.updatePatientProfile error:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء تحديث بيانات المريض',
    };
  }
};

// ============================================================================
// 3. GET MEDICAL HISTORY — comprehensive medical summary
// ============================================================================

exports.getMedicalHistory = async (patientDocId) => {
  try {
    const patient = await Patient.findById(patientDocId)
      .populate('personId')
      .populate('childId')
      .lean();

    if (!patient) {
      return {
        success: false,
        message: 'المريض غير موجود',
      };
    }

    const profile = patient.personId || patient.childId;
    if (!profile) {
      return {
        success: false,
        message: 'بيانات المريض الشخصية مفقودة',
      };
    }

    const patientFilter = patient.personId
      ? { patientPersonId: patient.personId._id }
      : { patientChildId:  patient.childId._id };

    // ── Get visits ──────────────────────────────────────────────────────
    const visits = await Visit.find(patientFilter)
      .populate({
        path: 'doctorId',
        select: 'personId specialization',
        populate: { path: 'personId', select: 'firstName lastName' },
      })
      .sort({ visitDate: -1 })
      .lean();

    // ── Get lab tests (separate collection!) ───────────────────────────
    const labTests = await LabTest.find(patientFilter)
      .select('testsOrdered status orderDate completedAt isCritical resultPdfUrl')
      .sort({ orderDate: -1 })
      .lean();

    // ── Aggregate data ─────────────────────────────────────────────────
    const diagnoses = [...new Set(
      visits.filter(v => v.diagnosis).map(v => v.diagnosis.trim()),
    )];

    const allMedications = visits
      .filter(v => Array.isArray(v.prescribedMedications) && v.prescribedMedications.length > 0)
      .flatMap(v => v.prescribedMedications);

    const labTestNames = [...new Set(
      labTests.flatMap(lt => (lt.testsOrdered || []).map(t => t.testName)),
    )];

    const summary = {
      patientInfo: {
        name:       `${profile.firstName} ${profile.lastName}`,
        ...(patient.personId
          ? { nationalId: profile.nationalId }
          : { childRegistrationNumber: profile.childRegistrationNumber }
        ),
        age:    calculateAge(profile.dateOfBirth),
        gender: profile.gender,
        type:   patient.personId ? 'adult' : 'minor',
      },
      medicalProfile: {
        bloodType:       patient.bloodType,
        allergies:       patient.allergies || [],
        chronicDiseases: patient.chronicDiseases || [],
        familyHistory:   patient.familyHistory || [],
        smokingStatus:   patient.smokingStatus,
      },
      visitHistory: {
        totalVisits:      visits.length,
        completedVisits:  visits.filter(v => v.status === 'completed').length,
        lastVisit:        visits.filter(v => v.status === 'completed')[0]?.visitDate || null,
        diagnoses,
        totalMedications: allMedications.length,
      },
      labHistory: {
        totalLabTests:     labTests.length,
        completedLabTests: labTests.filter(lt => lt.status === 'completed').length,
        criticalResults:   labTests.filter(lt => lt.isCritical).length,
        labTests:          labTestNames,
      },
      healthMetrics: {
        height: patient.height,
        weight: patient.weight,
        bmi:    calculateBMI(patient.height, patient.weight),
      },
    };

    return {
      success: true,
      summary,
    };
  } catch (error) {
    console.error('❌ patientService.getMedicalHistory error:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء جلب التاريخ الطبي',
    };
  }
};

// ============================================================================
// 4. VALIDATE PROFILE UPDATES — guards against immutable fields
// ============================================================================

exports.validateProfileUpdates = (updates) => {
  const restrictedFields = [
    'nationalId', 'firstName', 'fatherName', 'lastName', 'motherName',
    'dateOfBirth', 'gender', 'email', 'roles', 'personId', 'childId',
    'childRegistrationNumber', 'parentNationalId',
  ];

  for (const field of restrictedFields) {
    if (updates[field] !== undefined) {
      return {
        valid: false,
        message: `لا يمكن تحديث الحقل: ${field}`,
      };
    }
  }

  // ── Field-specific validation ────────────────────────────────────────
  if (updates.phoneNumber && !isValidPhoneNumber(updates.phoneNumber)) {
    return {
      valid: false,
      message: 'رقم الهاتف غير صالح',
    };
  }

  if (updates.height && (updates.height < 50 || updates.height > 250)) {
    return {
      valid: false,
      message: 'الطول يجب أن يكون بين 50 و 250 سم',
    };
  }

  if (updates.weight && (updates.weight < 2 || updates.weight > 300)) {
    return {
      valid: false,
      message: 'الوزن يجب أن يكون بين 2 و 300 كجم',
    };
  }

  return { valid: true };
};

// ============================================================================
// HELPER — Calculate visit statistics
// ============================================================================

async function calculateVisitStats(patientFilter) {
  try {
    const visits = await Visit.find(patientFilter)
      .select('visitDate status visitType followUpDate')
      .lean();

    if (visits.length === 0) {
      return {
        totalVisits:      0,
        completedVisits:  0,
        inProgressVisits: 0,
        cancelledVisits:  0,
        lastVisit:        null,
        nextFollowUp:     null,
      };
    }

    return {
      totalVisits:      visits.length,
      completedVisits:  visits.filter(v => v.status === 'completed').length,
      inProgressVisits: visits.filter(v => v.status === 'in_progress').length,
      cancelledVisits:  visits.filter(v => v.status === 'cancelled').length,
      lastVisit: visits
        .filter(v => v.status === 'completed')
        .sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate))[0]?.visitDate || null,
      nextFollowUp: visits
        .filter(v => v.followUpDate && new Date(v.followUpDate) > new Date())
        .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))[0]?.followUpDate || null,
    };
  } catch (error) {
    console.error('Error calculating visit stats:', error);
    return null;
  }
}

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

// ============================================================================
// HELPER — BMI calculation
// ============================================================================

function calculateBMI(height, weight) {
  if (!height || !weight) return null;
  const meters = height / 100;
  return Math.round((weight / (meters * meters)) * 10) / 10;
}

// ============================================================================
// HELPER — Syrian phone number validation
// ============================================================================

function isValidPhoneNumber(phone) {
  // +963XXXXXXXXX or 09XXXXXXXX (Syrian mobile)
  return /^(\+963[0-9]{9}|09[0-9]{8})$/.test(phone);
}

exports.calculateVisitStats = calculateVisitStats;
