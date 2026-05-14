/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Lab Controller — Patient 360°  (Frontend-facing layer)
 *  ─────────────────────────────────────────────────────────────────────────
 *  This controller serves the Lab Dashboard (LabDashboard.jsx) exclusively.
 *  It mirrors the labAPI contract in frontend/src/services/api.js 1:1 —
 *  every function here matches a labAPI method in name, parameters, and
 *  response shape.
 *
 *  Mounted at: /api/lab
 *
 *  ────────────────────────────────────────────────────────────────────────
 *  Function map (frontend labAPI → backend):
 *    labAPI.getDashboardKPIs          → GET  /dashboard/kpis
 *    labAPI.getMyNotifications        → GET  /notifications
 *    labAPI.markNotificationRead      → PATCH /notifications/:id/read
 *    labAPI.searchPatientByNationalId → GET  /patient/:nationalId
 *    labAPI.getReadyTests             → GET  /tests/ready
 *    labAPI.getMyTests                → GET  /tests
 *    labAPI.collectSample             → PUT  /tests/:id/collect-sample
 *    labAPI.startProcessing           → PUT  /tests/:id/start
 *    labAPI.submitResults             → PUT  /tests/:id/complete (multipart)
 *    labAPI.rejectTest                → POST /tests/:id/reject
 *  ────────────────────────────────────────────────────────────────────────
 *
 *  Design notes:
 *    • Every function first resolves the lab technician's record & lab so
 *      that access control is enforced (a lab tech can only see/modify tests
 *      at their own laboratory).
 *    • All responses follow: { success: boolean, ...payload }
 *    • Arabic user-facing error messages; English console logs with emojis.
 *    • Try/catch in every async function.
 *    • Soft-fails on non-critical actions (e.g., failed notification send
 *      does not fail the main write).
 *
 *  Coexistence with existing controllers:
 *    The older labTestController.js and labTechnicianController.js remain
 *    UNTOUCHED — they serve the doctor and admin flows (POST /api/lab-tests
 *    for order creation, /api/lab-technician for profile endpoints).
 *    This new controller is a frontend-shaped facade, not a replacement.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const {
  LabTest, LabTechnician, Laboratory,
  Person, Children, Patient,
  Doctor, Notification, AuditLog
} = require('../models');

// ============================================================================
// SHARED CONSTANTS
// ============================================================================

/**
 * Explicit priority ranking — MongoDB has no native enum ordering so we
 * sort in-memory when lists mix priorities.
 */
const PRIORITY_RANK = { stat: 1, urgent: 2, routine: 3 };

/**
 * Lab test workflow statuses — grouped by lifecycle phase for query reuse.
 */
const STATUS_PRE_COLLECT = ['ordered', 'scheduled'];
const STATUS_ACTIVE      = ['sample_collected', 'in_progress'];
const STATUS_WORK_QUEUE  = [...STATUS_PRE_COLLECT, ...STATUS_ACTIVE];
const STATUS_TERMINAL    = ['completed', 'cancelled', 'rejected'];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolve the logged-in account into a LabTechnician record.
 * Throws a user-friendly Arabic error if the account isn't linked to one.
 *
 * This guard is the access-control boundary: every endpoint calls it first,
 * which means a doctor or patient accidentally hitting a lab route gets a
 * clean 404 instead of leaking data.
 */
async function resolveLabTech(account) {
  if (!account?.personId) {
    const err = new Error('الحساب غير مرتبط بفني مختبر');
    err.statusCode = 403;
    throw err;
  }
  const labTech = await LabTechnician.findOne({ personId: account.personId });
  if (!labTech) {
    const err = new Error('لم يتم العثور على ملف فني المختبر');
    err.statusCode = 404;
    throw err;
  }
  return labTech;
}

/**
 * Build a patient display name from a LabTest document.
 * Works whether the test references an adult (patientPersonId) or a child
 * (patientChildId). Falls back to '—' if neither is populated.
 */
function formatPatientName(test) {
  const p = test.patientPersonId;
  if (p?.firstName || p?.lastName) {
    return [p.firstName, p.fatherName, p.lastName].filter(Boolean).join(' ');
  }
  const c = test.patientChildId;
  if (c?.firstName || c?.lastName) {
    return [c.firstName, c.fatherName, c.lastName].filter(Boolean).join(' ');
  }
  return '—';
}

/**
 * Fire-and-forget notification creation. Never throws upward — if the
 * notification fails, the main operation still succeeds.
 */
async function createNotification(payload) {
  try {
    await Notification.create({
      ...payload,
      status: 'pending',
      channels: ['in_app'],
      createdAt: new Date()
    });
  } catch (err) {
    console.warn('⚠️  Notification creation failed (non-fatal):', err.message);
  }
}

/**
 * Flatten a lab_test document into the shape expected by the frontend's
 * history and list views. Centralizing this keeps all list endpoints
 * consistent (getReadyTests, getMyTests, dashboard recentActivity).
 */
function flattenTestForList(test) {
  const adult = test.patientPersonId;
  const child = test.patientChildId;
  const doctor = test.orderedBy;

  return {
    _id: test._id,
    testNumber: test.testNumber,
    status: test.status,
    priority: test.priority || 'routine',
    testCategory: test.testCategory || null,
    orderDate: test.orderDate,
    scheduledDate: test.scheduledDate || null,
    sampleCollectedAt: test.sampleCollectedAt || null,
    completedAt: test.completedAt || null,
    testsOrdered: test.testsOrdered || [],
    sampleId: test.sampleId || null,
    sampleType: test.sampleType || null,
    resultPdfUrl: test.resultPdfUrl || null,
    isCritical: !!test.isCritical,
    isViewedByDoctor: !!test.isViewedByDoctor,
    isViewedByPatient: !!test.isViewedByPatient,
    totalCost: test.totalCost ?? null,
    currency: test.currency || 'SYP',
    patientName: formatPatientName(test),
    patientNationalId: adult?.nationalId || child?.nationalId || null,
    patientDateOfBirth: adult?.dateOfBirth || child?.dateOfBirth || null,
    patientGender: adult?.gender || child?.gender || null,
    orderedBy: doctor ? {
      _id: doctor._id,
      firstName: doctor?.personId?.firstName || '',
      lastName: doctor?.personId?.lastName || '',
      specialization: doctor.specialization || null,
      medicalLicenseNumber: doctor.medicalLicenseNumber || null
    } : null,
    orderedByName: doctor?.personId
      ? `${doctor.personId.firstName || ''} ${doctor.personId.lastName || ''}`.trim()
      : null
  };
}

/**
 * Standard error responder. Maps our custom statusCode field onto the HTTP
 * response, defaulting to 500.
 */
function sendError(res, error, defaultMessage) {
  const status = error.statusCode || 500;
  const message = error.message || defaultMessage;
  if (status >= 500) console.error('❌', defaultMessage, error);
  return res.status(status).json({ success: false, message });
}

// ============================================================================
// 1. GET DASHBOARD KPIs
// ──────────────────────────────────────────────────────────────────────────
// GET /api/lab/dashboard/kpis
// Response shape matches labAPI.getDashboardKPIs exactly:
//   { success, kpis: {6 numeric fields}, recentActivity: [...], laboratory: {...} }
// ============================================================================

exports.getDashboardKPIs = async (req, res) => {
  try {
    const labTech = await resolveLabTech(req.account);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // ── Fetch KPIs in parallel — all six counters share the same filter base
    //    (laboratoryId), so a parallel Promise.all is ~6x faster than serial.
    const [
      samplesCollectedToday,
      inProgress,
      completedToday,
      completedThisMonth,
      pendingResults,
      criticalAlerts,
      laboratory,
      recentTestsRaw
    ] = await Promise.all([
      LabTest.countDocuments({
        laboratoryId: labTech.laboratoryId,
        sampleCollectedBy: labTech._id,
        sampleCollectedAt: { $gte: startOfToday }
      }),
      LabTest.countDocuments({
        laboratoryId: labTech.laboratoryId,
        status: 'in_progress'
      }),
      LabTest.countDocuments({
        laboratoryId: labTech.laboratoryId,
        completedBy: labTech._id,
        completedAt: { $gte: startOfToday }
      }),
      LabTest.countDocuments({
        laboratoryId: labTech.laboratoryId,
        completedAt: { $gte: startOfMonth }
      }),
      LabTest.countDocuments({
        laboratoryId: labTech.laboratoryId,
        status: 'sample_collected'
      }),
      LabTest.countDocuments({
        laboratoryId: labTech.laboratoryId,
        isCritical: true,
        status: 'completed',
        completedAt: { $gte: last24h }
      }),
      Laboratory.findById(labTech.laboratoryId)
        .select('name arabicName governorate city phoneNumber labType address')
        .lean(),
      // Recent activity: last 8 tests touched by this lab, any status
      LabTest.find({ laboratoryId: labTech.laboratoryId })
        .populate('patientPersonId', 'firstName fatherName lastName')
        .populate('patientChildId', 'firstName fatherName lastName')
        .sort({ updatedAt: -1 })
        .limit(8)
        .lean()
    ]);

    // ── Transform recent tests into the activity-feed shape ──
    const recentActivity = recentTestsRaw.map((t) => {
      let action;
      let timestamp;
      if (t.completedAt) {
        action = 'completed';
        timestamp = t.completedAt;
      } else if (t.sampleCollectedAt && t.status === 'in_progress') {
        action = 'in_progress';
        timestamp = t.sampleCollectedAt;
      } else if (t.sampleCollectedAt) {
        action = 'sample_collected';
        timestamp = t.sampleCollectedAt;
      } else {
        action = 'ordered';
        timestamp = t.orderDate;
      }
      return {
        _id: t._id,
        testNumber: t.testNumber,
        action,
        patientName: formatPatientName(t),
        testNames: (t.testsOrdered || []).map((x) => x.testName),
        timestamp,
        isCritical: !!t.isCritical
      };
    });

    return res.json({
      success: true,
      kpis: {
        samplesCollectedToday,
        inProgress,
        completedToday,
        completedThisMonth,
        pendingResults,
        criticalAlerts
      },
      recentActivity,
      laboratory: laboratory || null
    });
  } catch (error) {
    return sendError(res, error, 'حدث خطأ في تحميل لوحة المعلومات');
  }
};

// ============================================================================
// 2. GET MY NOTIFICATIONS
// ──────────────────────────────────────────────────────────────────────────
// GET /api/lab/notifications
// Reads the real notifications collection, filtered to this lab tech's
// Account._id and role. Sorted newest-first.
// ============================================================================

exports.getMyNotifications = async (req, res) => {
  try {
    await resolveLabTech(req.account);  // authorization guard

    const notifications = await Notification.find({
      recipientId: req.account._id,
      recipientType: 'lab_technician'
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({
      success: true,
      notifications: notifications.map((n) => ({
        _id: n._id,
        type: n.type,
        title: n.title,
        message: n.message,
        status: n.status,
        priority: n.priority || 'medium',
        relatedId: n.relatedId || null,
        relatedType: n.relatedType || null,
        createdAt: n.createdAt,
        readAt: n.readAt || null
      }))
    });
  } catch (error) {
    return sendError(res, error, 'حدث خطأ في تحميل الإشعارات');
  }
};

// ============================================================================
// 3. MARK NOTIFICATION READ
// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/lab/notifications/:id/read
// ============================================================================

exports.markNotificationRead = async (req, res) => {
  try {
    await resolveLabTech(req.account);

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'معرّف الإشعار غير صحيح' });
    }

    // Only update if the notification actually belongs to this account —
    // prevents a lab tech from marking someone else's notification as read.
    const updated = await Notification.findOneAndUpdate(
      { _id: id, recipientId: req.account._id },
      { $set: { status: 'read', readAt: new Date() } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'الإشعار غير موجود' });
    }

    return res.json({ success: true, notification: updated });
  } catch (error) {
    return sendError(res, error, 'حدث خطأ في تحديث الإشعار');
  }
};

// ============================================================================
// 4. SEARCH PATIENT BY NATIONAL ID
// ──────────────────────────────────────────────────────────────────────────
// GET /api/lab/patient/:nationalId
// Looks up the patient in BOTH persons AND children collections (per the
// "adults + children" scope decision). Returns:
//   - the patient's core demographics + medical summary
//   - all NON-TERMINAL lab tests at THIS lab for this patient
// ============================================================================

exports.searchPatientByNationalId = async (req, res) => {
  try {
    const labTech = await resolveLabTech(req.account);
    const { nationalId } = req.params;

    if (!/^\d{11}$/.test(nationalId)) {
      return res.status(400).json({
        success: false,
        message: 'الرقم الوطني يجب أن يكون 11 رقماً'
      });
    }

    // ── 1) Look up person first — most adults will match here ──
    let patientProfile = null;
    let isChild = false;
    let refField;  // 'patientPersonId' OR 'patientChildId'
    let refValue;

    const person = await Person.findOne({ nationalId, isActive: { $ne: false } })
      .lean();

    if (person) {
      patientProfile = person;
      refField = 'patientPersonId';
      refValue = person._id;
    } else {
      // ── 2) Fall back to children collection ──
      //    Children may have nationalId set after age 14 (pre-migration phase)
      const child = await Children.findOne({ nationalId, isActive: { $ne: false } })
        .lean();
      if (child) {
        patientProfile = child;
        isChild = true;
        refField = 'patientChildId';
        refValue = child._id;
      }
    }

    if (!patientProfile) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على مريض بهذا الرقم الوطني'
      });
    }

    // ── 3) Fetch medical summary from patients collection ──
    const patientFilter = isChild
      ? { childId: patientProfile._id }
      : { personId: patientProfile._id };
    const medical = await Patient.findOne(patientFilter)
      .select('bloodType allergies chronicDiseases height weight')
      .lean();

const activeTests = await LabTest.find({
      [refField]: refValue,
      // New visibility rule: see tests assigned to this lab OR unassigned
      // (bare tests any lab can pick up — matches the new free-choice workflow)
      $or: [
        { laboratoryId: labTech.laboratoryId },
        { laboratoryId: { $exists: false } },
        { laboratoryId: null }
      ],
      status: { $in: STATUS_WORK_QUEUE }
    })
      .populate({
        path: 'orderedBy',
        select: 'specialization medicalLicenseNumber personId',
        populate: { path: 'personId', select: 'firstName lastName' }
      })
      .sort({ orderDate: -1 })
      .lean();

    return res.json({
      success: true,
      patient: {
        _id: patientProfile._id,
        personId: isChild ? null : patientProfile._id,
        childId: isChild ? patientProfile._id : null,
        firstName: patientProfile.firstName,
        fatherName: patientProfile.fatherName || null,
        lastName: patientProfile.lastName,
        nationalId: patientProfile.nationalId,
        dateOfBirth: patientProfile.dateOfBirth,
        gender: patientProfile.gender,
        phoneNumber: patientProfile.phoneNumber || null,
        governorate: patientProfile.governorate,
        bloodType: medical?.bloodType || null,
        allergies: medical?.allergies || [],
        chronicDiseases: medical?.chronicDiseases || []
      },
      labTests: activeTests.map(flattenTestForList)
    });
  } catch (error) {
    return sendError(res, error, 'حدث خطأ في البحث عن المريض');
  }
};

// ============================================================================
// 5. GET READY TESTS
// ──────────────────────────────────────────────────────────────────────────
// GET /api/lab/tests/ready
// All tests at this lab where status='sample_collected' — i.e., tests
// waiting for the technician to enter results or upload the PDF.
// ============================================================================

exports.getReadyTests = async (req, res) => {
  try {
    const labTech = await resolveLabTech(req.account);

    const tests = await LabTest.find({
      laboratoryId: labTech.laboratoryId,
      status: 'sample_collected'
    })
      .populate('patientPersonId', 'firstName fatherName lastName nationalId dateOfBirth gender')
      .populate('patientChildId', 'firstName fatherName lastName nationalId dateOfBirth gender')
      .populate({
        path: 'orderedBy',
        select: 'specialization medicalLicenseNumber personId',
        populate: { path: 'personId', select: 'firstName lastName' }
      })
      .lean();

    // ── In-memory priority sort (stat → urgent → routine, then oldest first)
    tests.sort((a, b) => {
      const ap = PRIORITY_RANK[a.priority] || 99;
      const bp = PRIORITY_RANK[b.priority] || 99;
      if (ap !== bp) return ap - bp;
      return new Date(a.sampleCollectedAt || a.orderDate) -
             new Date(b.sampleCollectedAt || b.orderDate);
    });

    return res.json({
      success: true,
      tests: tests.map(flattenTestForList)
    });
  } catch (error) {
    return sendError(res, error, 'حدث خطأ في تحميل التحاليل الجاهزة للمعالجة');
  }
};

// ============================================================================
// 6. GET MY TESTS (history with optional status filter)
// ──────────────────────────────────────────────────────────────────────────
// GET /api/lab/tests?status=<filter>
// ============================================================================

exports.getMyTests = async (req, res) => {
  try {
    const labTech = await resolveLabTech(req.account);
    const { status, limit = 100 } = req.query;

    const safeLimit = Math.min(parseInt(limit, 10) || 100, 500);

    const query = { laboratoryId: labTech.laboratoryId };
    if (status && status !== 'all') {
      query.status = status;
    }

    const tests = await LabTest.find(query)
      .populate('patientPersonId', 'firstName fatherName lastName nationalId')
      .populate('patientChildId', 'firstName fatherName lastName nationalId')
      .populate({
        path: 'orderedBy',
        select: 'specialization medicalLicenseNumber personId',
        populate: { path: 'personId', select: 'firstName lastName' }
      })
      .sort({ orderDate: -1 })
      .limit(safeLimit)
      .lean();

    return res.json({
      success: true,
      tests: tests.map(flattenTestForList)
    });
  } catch (error) {
    return sendError(res, error, 'حدث خطأ في تحميل سجل التحاليل');
  }
};

// ============================================================================
// 7. COLLECT SAMPLE
// ──────────────────────────────────────────────────────────────────────────
// PUT /api/lab/tests/:id/collect-sample
// Body: { sampleId: string, sampleType: enum }
//
// State transition: 'ordered' OR 'scheduled'  →  'sample_collected'
// ============================================================================

const VALID_SAMPLE_TYPES = ['blood', 'urine', 'stool', 'tissue', 'swab', 'saliva', 'other'];

exports.collectSample = async (req, res) => {
  console.log('🧪 ========== COLLECT SAMPLE ==========');

  try {
    const labTech = await resolveLabTech(req.account);
    const { id } = req.params;
    const { sampleId, sampleType } = req.body;

    // ── Input validation ──
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'معرّف التحليل غير صحيح' });
    }
    if (!sampleId || typeof sampleId !== 'string' || !sampleId.trim()) {
      return res.status(400).json({ success: false, message: 'رقم العينة مطلوب' });
    }
    if (!sampleType || !VALID_SAMPLE_TYPES.includes(sampleType)) {
      return res.status(400).json({
        success: false,
        message: `نوع العينة يجب أن يكون أحد: ${VALID_SAMPLE_TYPES.join(', ')}`
      });
    }

    // ── Load the test and verify state + lab ownership ──
    const test = await LabTest.findById(id);
    if (!test) {
      return res.status(404).json({ success: false, message: 'التحليل غير موجود' });
    }
 if (test.laboratoryId && String(test.laboratoryId) !== String(labTech.laboratoryId)) {
      return res.status(403).json({
        success: false,
        message: 'هذا التحليل لا ينتمي لمختبرك'
      });
    }
    if (!STATUS_PRE_COLLECT.includes(test.status)) {
   return res.status(400).json({
        success: false,
        message: `لا يمكن تسجيل عينة لتحليل حالته "${test.status}"`
      });
    }

    if (!test.laboratoryId) {
      test.laboratoryId = labTech.laboratoryId;
      console.log(`📌 Lab ${labTech.laboratoryId} claimed unassigned test ${test.testNumber}`);
    }

    // ── Update ──
    test.sampleId = sampleId.trim();
    test.sampleType = sampleType;
    test.sampleCollectedAt = new Date();
    test.sampleCollectedBy = labTech._id;
    test.status = 'sample_collected';
    await test.save();

    console.log(`✅ Sample collected for test ${test.testNumber}`);

    // ── Notify the patient (fire-and-forget) ──
    const patientAccountQuery = test.patientPersonId
      ? { personId: test.patientPersonId }
      : { childId: test.patientChildId };
    const { Account } = require('../models');
    const patientAccount = await Account.findOne(patientAccountQuery).select('_id').lean();
    if (patientAccount) {
      createNotification({
        recipientId: patientAccount._id,
        recipientType: 'patient',
        type: 'lab_results_ready',  // reusing closest enum — DB enum is fixed
        title: 'تم استلام عينتك',
        message: `تم استلام عينة التحليل رقم ${test.testNumber}. ستصلك النتائج بعد الانتهاء.`,
        priority: 'medium',
        relatedId: test._id,
        relatedType: 'lab_tests'
      });
    }

    // ── Audit log ──
    AuditLog.record?.({
      userId: req.account._id,
      userEmail: req.account.email,
      action: 'LAB_COLLECT_SAMPLE',
      description: `Sample collected for ${test.testNumber}`,
      resourceType: 'lab_test',
      resourceId: test._id,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: { sampleId: test.sampleId, sampleType: test.sampleType }
    });

    return res.json({ success: true, labTest: test });
  } catch (error) {
    return sendError(res, error, 'حدث خطأ في تسجيل العينة');
  }
};

// ============================================================================
// 8. START PROCESSING
// ──────────────────────────────────────────────────────────────────────────
// PUT /api/lab/tests/:id/start
// State transition: 'sample_collected'  →  'in_progress'
// ============================================================================

exports.startProcessing = async (req, res) => {
  console.log('🔬 ========== START PROCESSING ==========');

  try {
    const labTech = await resolveLabTech(req.account);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'معرّف التحليل غير صحيح' });
    }

    const test = await LabTest.findById(id);
    if (!test) {
      return res.status(404).json({ success: false, message: 'التحليل غير موجود' });
    }
    if (String(test.laboratoryId) !== String(labTech.laboratoryId)) {
      return res.status(403).json({
        success: false,
        message: 'هذا التحليل لا ينتمي لمختبرك'
      });
    }
    if (test.status !== 'sample_collected') {
      return res.status(400).json({
        success: false,
        message: `لا يمكن بدء التحليل من الحالة "${test.status}" — يجب أن تكون العينة مستلمة أولاً`
      });
    }

    test.status = 'in_progress';
    await test.save();

    console.log(`✅ Test ${test.testNumber} marked in_progress`);

    AuditLog.record?.({
      userId: req.account._id,
      userEmail: req.account.email,
      action: 'LAB_START_PROCESSING',
      description: `Started processing ${test.testNumber}`,
      resourceType: 'lab_test',
      resourceId: test._id,
      ipAddress: req.ip || 'unknown',
      success: true
    });

    return res.json({ success: true, labTest: test });
  } catch (error) {
    return sendError(res, error, 'حدث خطأ في بدء التحليل');
  }
};

// ============================================================================
// 9. SUBMIT RESULTS  (combined: PDF upload + testResults + isCritical + notes)
// ──────────────────────────────────────────────────────────────────────────
// PUT /api/lab/tests/:id/complete  (multipart/form-data)
// Body form-fields:
//   - resultPdf: File (REQUIRED per user decision — PDF strict)
//   - testResults: JSON string of Array<{...}>  (may be empty array '[]')
//   - labNotes: string (may be empty)
//   - isCritical: 'true' | 'false'
//
// State transition: 'in_progress' OR 'sample_collected'  →  'completed'
// ============================================================================

exports.submitResults = async (req, res) => {
  console.log('📄 ========== SUBMIT RESULTS (with PDF) ==========');

  // We'll need the uploaded file's path for cleanup on any failure.
  const uploadedFilePath = req.file?.path || null;

  // Helper: best-effort file cleanup — called from multiple error branches.
  const cleanupUpload = () => {
    if (uploadedFilePath) {
      fs.unlink(uploadedFilePath, (err) => {
        if (err) console.warn('⚠️  Failed to cleanup orphan PDF:', err.message);
      });
    }
  };

  try {
    const labTech = await resolveLabTech(req.account);
    const { id } = req.params;

    // ── 1) PDF strict-required check (per user decision) ──
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'ملف نتيجة التحليل (PDF) مطلوب'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      cleanupUpload();
      return res.status(400).json({ success: false, message: 'معرّف التحليل غير صحيح' });
    }

    // ── 2) Parse multipart form fields ──
    let testResults = [];
    if (req.body.testResults) {
      try {
        testResults = JSON.parse(req.body.testResults);
        if (!Array.isArray(testResults)) {
          throw new Error('testResults must be an array');
        }
      } catch (parseErr) {
        cleanupUpload();
        return res.status(400).json({
          success: false,
          message: 'تنسيق نتائج التحليل غير صحيح'
        });
      }
    }

    const labNotes = (req.body.labNotes || '').trim();
    const isCritical = req.body.isCritical === 'true' || req.body.isCritical === true;

    // ── 3) Load test + verify state + lab ownership ──
    const test = await LabTest.findById(id);
    if (!test) {
      cleanupUpload();
      return res.status(404).json({ success: false, message: 'التحليل غير موجود' });
    }
    if (String(test.laboratoryId) !== String(labTech.laboratoryId)) {
      cleanupUpload();
      return res.status(403).json({
        success: false,
        message: 'هذا التحليل لا ينتمي لمختبرك'
      });
    }
    if (!STATUS_ACTIVE.includes(test.status)) {
      cleanupUpload();
      return res.status(400).json({
        success: false,
        message: `لا يمكن إكمال تحليل حالته "${test.status}"`
      });
    }

    // ── 4) Normalize testResults (defensive — don't trust client completely) ──
    const sanitizedResults = testResults.map((r) => ({
      testCode: String(r.testCode || '').trim(),
      testName: String(r.testName || '').trim(),
      value: String(r.value ?? '').trim(),
      numericValue: r.numericValue != null ? Number(r.numericValue) : undefined,
      unit: r.unit ? String(r.unit).trim() : undefined,
      referenceRange: r.referenceRange ? String(r.referenceRange).trim() : undefined,
      isAbnormal: !!r.isAbnormal,
      isCritical: !!r.isCritical
    }));

    // ── 5) Build the public URL for the uploaded PDF ──
    //    multer saved it to uploads/lab-results/<filename>; we expose it under
    //    /uploads/lab-results/<filename> via express.static (already wired in
    //    backend/index.js). Store the relative URL for portability.
    const relativeUrl = `/uploads/lab-results/${path.basename(req.file.path)}`;

    // ── 6) Apply updates atomically ──
    test.testResults = sanitizedResults;
    test.resultPdfUrl = relativeUrl;
    test.resultPdfUploadedAt = new Date();
    test.resultPdfUploadedBy = labTech._id;
    test.labNotes = labNotes;
    test.isCritical = isCritical;
    test.completedAt = new Date();
    test.completedBy = labTech._id;
    test.status = 'completed';
    test.isViewedByDoctor = false;
    test.isViewedByPatient = false;

    await test.save();

    console.log(`✅ Test ${test.testNumber} completed (critical=${isCritical})`);

    // ── 7) Increment lab tech's counter (denormalized stat) ──
    //    We do this AFTER save() so a validation failure doesn't leave a
    //    dangling counter increment.
    LabTechnician.updateOne(
      { _id: labTech._id },
      { $inc: { totalTestsPerformed: 1 } }
    ).catch((err) => console.warn('⚠️  Counter increment failed:', err.message));

    // ── 8) Notifications (fire-and-forget) ──
    const { Account } = require('../models');

    // Notify ordering doctor
    if (test.orderedBy) {
      const doctorAccount = await Account.findOne({
        personId: { $in: [await Doctor.findById(test.orderedBy).select('personId').lean().then(d => d?.personId)] }
      }).select('_id').lean();
      if (doctorAccount) {
        createNotification({
          recipientId: doctorAccount._id,
          recipientType: 'doctor',
          type: isCritical ? 'lab_results_critical' : 'lab_results_ready',
          title: isCritical ? '⚠️ نتيجة تحليل حرجة' : 'نتائج تحليل جديدة',
          message: `تحليل ${test.testNumber} — ${isCritical ? 'يحتاج مراجعة عاجلة' : 'جاهز للمراجعة'}`,
          priority: isCritical ? 'urgent' : 'high',
          relatedId: test._id,
          relatedType: 'lab_tests'
        });
      }
    }

    // Notify patient
    const patientAccountQuery = test.patientPersonId
      ? { personId: test.patientPersonId }
      : { childId: test.patientChildId };
    const patientAccount = await Account.findOne(patientAccountQuery).select('_id').lean();
    if (patientAccount) {
      createNotification({
        recipientId: patientAccount._id,
        recipientType: 'patient',
        type: 'lab_results_ready',
        title: 'نتائج تحليلك جاهزة',
        message: `نتائج تحليل ${test.testNumber} متوفرة الآن.`,
        priority: 'medium',
        relatedId: test._id,
        relatedType: 'lab_tests'
      });
    }

    // ── 9) Audit ──
    AuditLog.record?.({
      userId: req.account._id,
      userEmail: req.account.email,
      action: 'LAB_COMPLETE_TEST',
      description: `Completed ${test.testNumber}${isCritical ? ' (CRITICAL)' : ''}`,
      resourceType: 'lab_test',
      resourceId: test._id,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        isCritical,
        resultCount: sanitizedResults.length,
        pdfUrl: relativeUrl
      }
    });

    return res.json({
      success: true,
      labTest: {
        _id: test._id,
        testNumber: test.testNumber,
        status: test.status,
        completedAt: test.completedAt,
        resultPdfUrl: test.resultPdfUrl,
        isCritical: test.isCritical
      }
    });
  } catch (error) {
    // Any exception → cleanup the orphan upload so disk doesn't fill up
    cleanupUpload();
    return sendError(res, error, 'حدث خطأ في إرسال النتائج');
  }
};

// ============================================================================
// 10. REJECT TEST
// ──────────────────────────────────────────────────────────────────────────
// POST /api/lab/tests/:id/reject
// Body: { rejectionReason: string }
//
// State transition: ANY non-terminal  →  'rejected'
// (We allow rejection even during in_progress because sample contamination
//  may be discovered mid-analysis.)
// ============================================================================

exports.rejectTest = async (req, res) => {
  console.log('🚫 ========== REJECT TEST ==========');

  try {
    const labTech = await resolveLabTech(req.account);
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'معرّف التحليل غير صحيح' });
    }
    if (!rejectionReason || typeof rejectionReason !== 'string' || !rejectionReason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'سبب الرفض مطلوب'
      });
    }

    const test = await LabTest.findById(id);
    if (!test) {
      return res.status(404).json({ success: false, message: 'التحليل غير موجود' });
    }
    if (String(test.laboratoryId) !== String(labTech.laboratoryId)) {
      return res.status(403).json({
        success: false,
        message: 'هذا التحليل لا ينتمي لمختبرك'
      });
    }
    if (STATUS_TERMINAL.includes(test.status)) {
      return res.status(400).json({
        success: false,
        message: `لا يمكن رفض تحليل حالته "${test.status}"`
      });
    }

    test.status = 'rejected';
    test.rejectionReason = rejectionReason.trim();
    await test.save();

    console.log(`✅ Test ${test.testNumber} rejected: ${rejectionReason}`);

    // Notify ordering doctor
    if (test.orderedBy) {
      const { Account } = require('../models');
      const doctor = await Doctor.findById(test.orderedBy).select('personId').lean();
      if (doctor?.personId) {
        const doctorAccount = await Account.findOne({ personId: doctor.personId })
          .select('_id').lean();
        if (doctorAccount) {
          createNotification({
            recipientId: doctorAccount._id,
            recipientType: 'doctor',
            type: 'general',
            title: 'تم رفض تحليل',
            message: `تحليل ${test.testNumber} مرفوض. السبب: ${rejectionReason.trim()}`,
            priority: 'high',
            relatedId: test._id,
            relatedType: 'lab_tests'
          });
        }
      }
    }

    AuditLog.record?.({
      userId: req.account._id,
      userEmail: req.account.email,
      action: 'LAB_REJECT_TEST',
      description: `Rejected ${test.testNumber}: ${rejectionReason}`,
      resourceType: 'lab_test',
      resourceId: test._id,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: { rejectionReason: rejectionReason.trim() }
    });

    return res.json({ success: true, labTest: test });
  } catch (error) {
    return sendError(res, error, 'حدث خطأ في رفض التحليل');
  }
};