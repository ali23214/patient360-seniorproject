/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Lab Test Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Lab test order + execution endpoints. Mounted at /api/lab-tests.
 *
 *  Workflow:
 *
 *  Doctor side:
 *    POST /api/lab-tests              — Doctor orders one or more tests
 *    GET  /api/lab-tests/:id          — Get single test (any role)
 *    POST /api/lab-tests/:id/cancel   — Doctor cancels before sample collected
 *
 *  Lab tech side:
 *    POST /api/lab-tests/:id/collect-sample      — Mark sample collected
 *    POST /api/lab-tests/:id/start-processing    — Status → in_progress
 *    POST /api/lab-tests/:id/enter-results       — Add testResults[]
 *    POST /api/lab-tests/:id/upload-pdf          — Multer-handled PDF upload
 *    POST /api/lab-tests/:id/complete            — Mark completed
 *    POST /api/lab-tests/:id/reject              — Reject sample (bad sample)
 *
 *  Patient/Doctor view:
 *    POST /api/lab-tests/:id/mark-viewed         — Mark as viewed
 *
 *  ⚠️  PDF upload note:
 *  The upload route uses multer (configured in middleware/uploadLabResults.js
 *  which we'll create in B6). The controller just receives req.file and
 *  saves the URL to the LabTest.
 *
 *  Conventions kept:
 *    - Arabic error messages, emoji-marked console logs
 *    - { success, message, [data] } response shape
 *    - Try/catch in every async function
 * ═══════════════════════════════════════════════════════════════════════════
 */

const {
  LabTest, Laboratory, LabTechnician, Doctor, Visit,
  Person, Children, Patient, AuditLog
} = require('../models');

const { createNotification } = require('./notificationController');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolve the patient identifier into the dual-ref shape.
 * Accepts: patientPersonId, patientChildId, patientNationalId,
 *          childRegistrationNumber.
 */
async function resolvePatientRef(body) {
  const { patientPersonId, patientChildId, patientNationalId, childRegistrationNumber } = body;

  if (patientPersonId) return { patientPersonId };
  if (patientChildId) return { patientChildId };

  if (childRegistrationNumber) {
    const child = await Children.findOne({ childRegistrationNumber }).lean();
    return child ? { patientChildId: child._id } : null;
  }

  if (patientNationalId) {
    const adult = await Person.findOne({ nationalId: patientNationalId }).lean();
    if (adult) return { patientPersonId: adult._id };
    const child = await Children.findOne({ nationalId: patientNationalId }).lean();
    if (child) return { patientChildId: child._id };
  }

  return null;
}

/**
 * Load lab tech from current account; throws if not linked.
 */
async function getLabTechFromAccount(account) {
  if (!account.personId) {
    throw new Error('الحساب غير مرتبط بفني مختبر');
  }
  const labTech = await LabTechnician.findOne({ personId: account.personId });
  if (!labTech) {
    throw new Error('لم يتم العثور على ملف فني المختبر');
  }
  return labTech;
}

// ============================================================================
// 1. CREATE LAB TEST ORDER (doctor)
// ============================================================================

/**
 * @route   POST /api/lab-tests
 * @desc    Doctor orders one or more lab tests for a patient
 * @access  Private (doctor)
 *
 * Body:
 *   patient identifier (one of)   — patientNationalId | patientPersonId | patientChildId | childRegistrationNumber
 *   laboratoryId (required)       — which lab will perform the test
 *   visitId? (recommended)        — link to the visit that ordered this
 *   testsOrdered[] (required)     — list of { testCode, testName, notes? }
 *   testCategory?                 — blood | urine | imaging | etc.
 *   priority?                     — routine | urgent | stat (default: routine)
 *   sampleType?                   — blood | urine | etc.
 *   scheduledDate?                — when patient is expected at lab
 *   totalCost?
 */
exports.createLabTest = async (req, res) => {
  console.log('🔵 ========== CREATE LAB TEST ==========');

  try {
    const {
      laboratoryId,
      visitId,
      testsOrdered,
      testCategory,
      priority = 'routine',
      sampleType,
      scheduledDate,
      totalCost
    } = req.body;

 // ── 1. VALIDATION ─────────────────────────────────────────────────────
    // laboratoryId is now OPTIONAL — patient chooses lab later.
    // Only testsOrdered is required from the doctor.
    if (!Array.isArray(testsOrdered) || testsOrdered.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب طلب اختبار واحد على الأقل'
      });
    }

    // ── 2. RESOLVE PATIENT ────────────────────────────────────────────────
    const patientRef = await resolvePatientRef(req.body);
    if (!patientRef) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على المريض'
      });
    }

    // ── 3. RESOLVE ORDERING DOCTOR (from logged-in account) ───────────────
    const doctor = await Doctor.findOne({ personId: req.account.personId });
    if (!doctor) {
      return res.status(403).json({
        success: false,
        message: 'الحساب غير مرتبط بطبيب'
      });
    }

// ── 4. VERIFY LABORATORY (IF SPECIFIED) ───────────────────────────────
    // laboratoryId is optional. If provided, verify it exists.
    if (laboratoryId) {
      const lab = await Laboratory.findById(laboratoryId).lean();
      if (!lab) {
        return res.status(404).json({
          success: false,
          message: 'المختبر المحدد غير موجود'
        });
      }
    }

const labTest = await LabTest.create({
      ...patientRef,
      orderedBy: doctor._id,
      visitId: visitId || undefined,
      laboratoryId: laboratoryId || undefined,
      orderDate: new Date(),
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      testsOrdered: testsOrdered.map(t => ({
        testCode: t.testCode.toUpperCase().trim(),
        testName: t.testName.trim(),
        notes: t.notes?.trim()
      })),
      testCategory: testCategory || undefined,
      priority,
      sampleType: sampleType || undefined,
      status: 'ordered',
      totalCost: totalCost ? parseFloat(totalCost) : undefined,
      currency: 'SYP'
    });

    console.log('✅ Lab test created:', labTest.testNumber);

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'CREATE_LAB_TEST',
      description: `Ordered ${testsOrdered.length} test(s) — ${labTest.testNumber}`,
      resourceType: 'lab_test',
      resourceId: labTest._id,
      patientPersonId: labTest.patientPersonId,
      patientChildId: labTest.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        testNumber: labTest.testNumber,
        laboratoryId,
        priority,
        testCount: testsOrdered.length
      }
    });

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء طلب الفحص بنجاح',
      labTest: {
        _id: labTest._id,
        testNumber: labTest.testNumber,
        status: labTest.status,
        priority: labTest.priority,
        scheduledDate: labTest.scheduledDate,
        testsOrdered: labTest.testsOrdered
      }
    });

} catch (error) {
    console.error('❌ Create lab test error:', error);

    // طباعة تفاصيل validation error من MongoDB (للديباغ)
    if (error.code === 121 && error.errInfo) {
      console.error('🔍 ========== VALIDATION DETAILS ==========');
      console.error(JSON.stringify(error.errInfo.details, null, 2));
      console.error('🔍 ==========================================');
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'خطأ في البيانات'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إنشاء طلب الفحص'
    });
  }
};

// ============================================================================
// 2. GET LAB TEST BY ID
// ============================================================================

/**
 * @route   GET /api/lab-tests/:id
 * @desc    Single lab test detail
 * @access  Private (patient owner, ordering doctor, lab tech, admin)
 */
exports.getLabTestById = async (req, res) => {
  try {
    const { id } = req.params;

    const labTest = await LabTest.findById(id)
      .populate('orderedBy', 'specialization medicalLicenseNumber')
      .populate('laboratoryId', 'name arabicName phoneNumber address')
      .populate('patientPersonId', 'firstName lastName nationalId phoneNumber')
      .populate('patientChildId', 'firstName lastName childRegistrationNumber phoneNumber')
      .populate('sampleCollectedBy', 'licenseNumber')
      .populate('completedBy', 'licenseNumber')
      .populate('resultPdfUploadedBy', 'licenseNumber')
      .populate('visitId', 'visitDate chiefComplaint diagnosis')
      .lean();

    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'الفحص غير موجود'
      });
    }

    return res.json({
      success: true,
      labTest
    });
  } catch (error) {
    console.error('Get lab test error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الفحص'
    });
  }
};

// ============================================================================
// 3. CANCEL LAB TEST (doctor only, before sample collection)
// ============================================================================

/**
 * @route   POST /api/lab-tests/:id/cancel
 * @desc    Doctor cancels test order. Only allowed before sample is collected.
 * @access  Private (ordering doctor, admin)
 */
exports.cancelLabTest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const labTest = await LabTest.findById(id);
    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'الفحص غير موجود'
      });
    }

    // Only allow cancel before sample collected
    if (!['ordered', 'scheduled'].includes(labTest.status)) {
      return res.status(400).json({
        success: false,
        message: `لا يمكن إلغاء فحص حالته ${labTest.status}`
      });
    }

    // Ownership check
    const isAdmin = req.user.roles?.includes('admin');
    let isOwner = false;
    if (req.user.personId) {
      const doctor = await Doctor.findOne({ personId: req.user.personId }).lean();
      isOwner = doctor && String(labTest.orderedBy) === String(doctor._id);
    }

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'فقط الطبيب الطالب يمكنه إلغاء الفحص'
      });
    }

    labTest.status = 'cancelled';
    if (reason) labTest.labNotes = `[ملغي بواسطة الطبيب: ${reason}]`;
    await labTest.save();

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'CANCEL_LAB_TEST',
      description: `Cancelled ${labTest.testNumber}`,
      resourceType: 'lab_test',
      resourceId: labTest._id,
      patientPersonId: labTest.patientPersonId,
      patientChildId: labTest.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true
    });

    return res.json({
      success: true,
      message: 'تم إلغاء الفحص'
    });
  } catch (error) {
    console.error('Cancel lab test error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إلغاء الفحص'
    });
  }
};

// ============================================================================
// 4. COLLECT SAMPLE (lab tech)
// ============================================================================

/**
 * @route   POST /api/lab-tests/:id/collect-sample
 * @desc    Lab tech marks sample as collected. Records sampleId barcode.
 * @access  Private (lab_technician)
 *
 * Body: { sampleId?: string, notes?: string }
 */
exports.collectSample = async (req, res) => {
  console.log('🔵 ========== COLLECT SAMPLE ==========');

  try {
    const { id } = req.params;
    const { sampleId, notes } = req.body;

    const labTech = await getLabTechFromAccount(req.account);

    const labTest = await LabTest.findById(id);
    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'الفحص غير موجود'
      });
    }

    // Verify lab tech belongs to the right lab
    if (String(labTest.laboratoryId) !== String(labTech.laboratoryId)) {
      return res.status(403).json({
        success: false,
        message: 'هذا الفحص ليس في مختبرك'
      });
    }

    // Status gate
    if (!['ordered', 'scheduled'].includes(labTest.status)) {
      return res.status(400).json({
        success: false,
        message: `لا يمكن جمع عينة لفحص حالته ${labTest.status}`
      });
    }

    labTest.status = 'sample_collected';
    labTest.sampleCollectedAt = new Date();
    labTest.sampleCollectedBy = labTech._id;
    if (sampleId) labTest.sampleId = sampleId.trim();
    if (notes) labTest.labNotes = notes.trim();
    await labTest.save();

    console.log('✅ Sample collected for', labTest.testNumber);

    // ── PUSH NOTIFICATION TO PATIENT ────────────────────────────────────────
    try {
      createNotification({
        recipientPersonId: labTest.patientPersonId,
        recipientChildId:  labTest.patientChildId,
        recipientType: 'patient',
        notificationType: 'lab_results_ready',
        title:       'تم استلام عينتك',
        titleArabic: 'تم استلام عينتك',
        body: `تم استلام عينة الفحص رقم ${labTest.testNumber} بنجاح. ستصلك النتائج عند جاهزيتها.`,
        channels: ['push', 'in_app'],
        relatedType: 'lab_test',
        relatedId:   labTest._id,
        deepLinkRoute: '/lab',
        priority: 'normal'
      }).catch(err => console.warn('⚠️  Notification failed:', err.message));
    } catch (notifError) {
      console.warn('⚠️  Notification dispatch error (non-fatal):', notifError.message);
    }

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'COLLECT_LAB_SAMPLE',
      description: `Collected sample for ${labTest.testNumber}`,
      resourceType: 'lab_test',
      resourceId: labTest._id,
      patientPersonId: labTest.patientPersonId,
      patientChildId: labTest.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: { sampleId }
    });

    return res.json({
      success: true,
      message: 'تم تسجيل جمع العينة',
      labTest
    });
  } catch (error) {
    console.error('Collect sample error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في تسجيل العينة'
    });
  }
};

// ============================================================================
// 5. START PROCESSING (lab tech)
// ============================================================================

/**
 * @route   POST /api/lab-tests/:id/start-processing
 * @desc    Lab tech moves test from sample_collected → in_progress
 * @access  Private (lab_technician)
 */
exports.startProcessing = async (req, res) => {
  try {
    const { id } = req.params;

    const labTech = await getLabTechFromAccount(req.account);

    const labTest = await LabTest.findById(id);
    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'الفحص غير موجود'
      });
    }

    if (String(labTest.laboratoryId) !== String(labTech.laboratoryId)) {
      return res.status(403).json({
        success: false,
        message: 'هذا الفحص ليس في مختبرك'
      });
    }

    if (labTest.status !== 'sample_collected') {
      return res.status(400).json({
        success: false,
        message: 'يجب جمع العينة أولاً قبل البدء بالمعالجة'
      });
    }

    labTest.status = 'in_progress';
    await labTest.save();

    return res.json({
      success: true,
      message: 'تم بدء معالجة الفحص',
      labTest
    });
  } catch (error) {
    console.error('Start processing error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ'
    });
  }
};

// ============================================================================
// 6. ENTER RESULTS (lab tech)
// ============================================================================

/**
 * @route   POST /api/lab-tests/:id/enter-results
 * @desc    Lab tech enters structured test results.
 *          Each result has value, unit, reference range, isAbnormal/isCritical.
 *          The model's pre-save hook auto-flags overall isCritical if any
 *          line item is critical.
 * @access  Private (lab_technician)
 *
 * Body:
 *   testResults[] (required, >=1):
 *     {
 *       testCode: string,
 *       testName: string,
 *       value: string,            — stored as string (supports qualitative)
 *       numericValue?: number,    — for trend/graph plotting
 *       unit?: string,            — e.g. mg/dL
 *       referenceRange?: string,  — e.g. "70-100"
 *       isAbnormal?: boolean,
 *       isCritical?: boolean
 *     }
 *   labNotes?: string
 */
exports.enterResults = async (req, res) => {
  console.log('🔵 ========== ENTER LAB RESULTS ==========');

  try {
    const { id } = req.params;
    const { testResults, labNotes } = req.body;

    if (!Array.isArray(testResults) || testResults.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب إدخال نتيجة واحدة على الأقل'
      });
    }

    const labTech = await getLabTechFromAccount(req.account);

    const labTest = await LabTest.findById(id);
    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'الفحص غير موجود'
      });
    }

    if (String(labTest.laboratoryId) !== String(labTech.laboratoryId)) {
      return res.status(403).json({
        success: false,
        message: 'هذا الفحص ليس في مختبرك'
      });
    }

    if (labTest.status !== 'in_progress' && labTest.status !== 'sample_collected') {
      return res.status(400).json({
        success: false,
        message: 'لا يمكن إدخال نتائج لفحص في هذه الحالة'
      });
    }

    // Validate each result row
    for (const r of testResults) {
      if (!r.testName || r.value === undefined || r.value === null) {
        return res.status(400).json({
          success: false,
          message: 'كل نتيجة يجب أن تحتوي على testName وقيمة value'
        });
      }
    }

    labTest.testResults = testResults.map(r => ({
      testCode: r.testCode?.toUpperCase().trim(),
      testName: r.testName.trim(),
      value: String(r.value).trim(),
      numericValue: r.numericValue !== undefined ? Number(r.numericValue) : undefined,
      unit: r.unit?.trim(),
      referenceRange: r.referenceRange?.trim(),
      isAbnormal: !!r.isAbnormal,
      isCritical: !!r.isCritical
    }));

    if (labNotes) labTest.labNotes = labNotes.trim();

    // Pre-save hook will auto-set the overall isCritical flag
    await labTest.save();

    console.log('✅ Results entered for', labTest.testNumber);
    if (labTest.isCritical) {
      console.log('⚠️  CRITICAL RESULT — doctor notification will fire on completion');
    }

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'ENTER_LAB_RESULTS',
      description: `Entered ${testResults.length} result(s) for ${labTest.testNumber}`,
      resourceType: 'lab_test',
      resourceId: labTest._id,
      patientPersonId: labTest.patientPersonId,
      patientChildId: labTest.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        resultCount: testResults.length,
        isCritical: labTest.isCritical,
        abnormalCount: labTest.testResults.filter(r => r.isAbnormal).length
      }
    });

    return res.json({
      success: true,
      message: 'تم حفظ النتائج بنجاح',
      labTest: {
        _id: labTest._id,
        testNumber: labTest.testNumber,
        status: labTest.status,
        testResults: labTest.testResults,
        isCritical: labTest.isCritical
      }
    });
  } catch (error) {
    console.error('Enter results error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في حفظ النتائج'
    });
  }
};

// ============================================================================
// 7. UPLOAD PDF REPORT (lab tech)
// ============================================================================

/**
 * @route   POST /api/lab-tests/:id/upload-pdf
 * @desc    Lab tech uploads the official PDF report. Multer handles the
 *          file upload (configured in routes file). This controller just
 *          saves the URL to the LabTest document.
 * @access  Private (lab_technician)
 *
 * Multipart body:
 *   resultPdf: <PDF file>
 */
exports.uploadResultPDF = async (req, res) => {
  console.log('🔵 ========== UPLOAD LAB PDF ==========');

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'ملف PDF مطلوب'
      });
    }

    const { id } = req.params;
    const labTech = await getLabTechFromAccount(req.account);

    const labTest = await LabTest.findById(id);
    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'الفحص غير موجود'
      });
    }

    if (String(labTest.laboratoryId) !== String(labTech.laboratoryId)) {
      return res.status(403).json({
        success: false,
        message: 'هذا الفحص ليس في مختبرك'
      });
    }

    labTest.resultPdfUrl = `/uploads/lab-results/${req.file.filename}`;
    labTest.resultPdfUploadedAt = new Date();
    labTest.resultPdfUploadedBy = labTech._id;
    await labTest.save();

    console.log('✅ PDF uploaded:', req.file.filename);

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'UPLOAD_LAB_PDF',
      description: `Uploaded result PDF for ${labTest.testNumber}`,
      resourceType: 'lab_test',
      resourceId: labTest._id,
      patientPersonId: labTest.patientPersonId,
      patientChildId: labTest.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        fileName: req.file.originalname,
        fileSize: req.file.size
      }
    });

    return res.json({
      success: true,
      message: 'تم رفع ملف النتائج بنجاح',
      resultPdfUrl: labTest.resultPdfUrl
    });
  } catch (error) {
    console.error('Upload PDF error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في رفع الملف'
    });
  }
};

// ============================================================================
// 8. COMPLETE LAB TEST (lab tech)
// ============================================================================

/**
 * @route   POST /api/lab-tests/:id/complete
 * @desc    Lab tech finalizes the test. Uses the model's markCompleted()
 *          which stamps completedAt + completedBy AND resets view flags
 *          so notifications fire to doctor + patient.
 * @access  Private (lab_technician)
 */
exports.completeLabTest = async (req, res) => {
  console.log('🔵 ========== COMPLETE LAB TEST ==========');

  try {
    const { id } = req.params;

    const labTech = await getLabTechFromAccount(req.account);

    const labTest = await LabTest.findById(id);
    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'الفحص غير موجود'
      });
    }

    if (String(labTest.laboratoryId) !== String(labTech.laboratoryId)) {
      return res.status(403).json({
        success: false,
        message: 'هذا الفحص ليس في مختبرك'
      });
    }

    if (labTest.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'الفحص مكتمل بالفعل'
      });
    }

    if (labTest.status === 'cancelled' || labTest.status === 'rejected') {
      return res.status(400).json({
        success: false,
        message: `لا يمكن إنهاء فحص حالته ${labTest.status}`
      });
    }

    // Sanity check — should have either results or a PDF (or both)
    const hasResults = labTest.testResults && labTest.testResults.length > 0;
    const hasPdf = !!labTest.resultPdfUrl;
    if (!hasResults && !hasPdf) {
      return res.status(400).json({
        success: false,
        message: 'يجب إدخال النتائج أو رفع ملف PDF قبل إنهاء الفحص'
      });
    }

    // Use the model method (sets status, completedAt, completedBy,
    // and resets view flags to trigger notifications)
    await labTest.markCompleted(labTech._id);

    // Update lab tech stats
    await labTech.recordTestCompleted();

    console.log('✅ Test completed:', labTest.testNumber);

    // ── PUSH NOTIFICATION TO PATIENT ────────────────────────────────────────
    try {
      const isCriticalResult = labTest.isCritical === true;
      createNotification({
        recipientPersonId: labTest.patientPersonId,
        recipientChildId:  labTest.patientChildId,
        recipientType: 'patient',
        notificationType: isCriticalResult ? 'lab_results_critical' : 'lab_results_ready',
        title:       isCriticalResult ? 'نتائج فحص حرجة' : 'نتائج فحصك جاهزة',
        titleArabic: isCriticalResult ? 'نتائج فحص حرجة' : 'نتائج فحصك جاهزة',
        body: isCriticalResult
          ? `يوجد نتائج فحص حرجة تتطلب مراجعة طبيبك فوراً — رقم الفحص ${labTest.testNumber}`
          : `نتائج فحصك رقم ${labTest.testNumber} جاهزة الآن. اضغط للاطلاع عليها.`,
        channels: ['push', 'in_app'],
        relatedType: 'lab_test',
        relatedId:   labTest._id,
        deepLinkRoute: '/lab',
        priority: isCriticalResult ? 'urgent' : 'normal'
      }).catch(err => console.warn('⚠️  Notification failed:', err.message));
    } catch (notifError) {
      console.warn('⚠️  Notification dispatch error (non-fatal):', notifError.message);
    }

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'COMPLETE_LAB_TEST',
      description: `Completed ${labTest.testNumber}`,
      resourceType: 'lab_test',
      resourceId: labTest._id,
      patientPersonId: labTest.patientPersonId,
      patientChildId: labTest.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        isCritical: labTest.isCritical,
        hasResults,
        hasPdf
      }
    });

    return res.json({
      success: true,
      message: 'تم إنهاء الفحص بنجاح',
      labTest: {
        _id: labTest._id,
        testNumber: labTest.testNumber,
        status: labTest.status,
        completedAt: labTest.completedAt,
        isCritical: labTest.isCritical
      }
    });
  } catch (error) {
    console.error('Complete lab test error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في إنهاء الفحص'
    });
  }
};

// ============================================================================
// 9. REJECT LAB TEST (lab tech)
// ============================================================================

/**
 * @route   POST /api/lab-tests/:id/reject
 * @desc    Lab tech rejects the sample (e.g. hemolyzed, insufficient,
 *          contaminated). Patient needs to come back for re-collection.
 * @access  Private (lab_technician)
 *
 * Body: { rejectionReason: string }
 */
exports.rejectLabTest = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'سبب الرفض مطلوب'
      });
    }

    const labTech = await getLabTechFromAccount(req.account);

    const labTest = await LabTest.findById(id);
    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'الفحص غير موجود'
      });
    }

    if (String(labTest.laboratoryId) !== String(labTech.laboratoryId)) {
      return res.status(403).json({
        success: false,
        message: 'هذا الفحص ليس في مختبرك'
      });
    }

    labTest.status = 'rejected';
    labTest.rejectionReason = rejectionReason.trim();
    await labTest.save();

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'REJECT_LAB_TEST',
      description: `Rejected sample for ${labTest.testNumber}`,
      resourceType: 'lab_test',
      resourceId: labTest._id,
      patientPersonId: labTest.patientPersonId,
      patientChildId: labTest.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: { rejectionReason }
    });

    return res.json({
      success: true,
      message: 'تم رفض العينة',
      labTest
    });
  } catch (error) {
    console.error('Reject lab test error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في رفض العينة'
    });
  }
};

// ============================================================================
// 10. MARK VIEWED (doctor or patient)
// ============================================================================

/**
 * @route   POST /api/lab-tests/:id/mark-viewed
 * @desc    Mark lab test as viewed. The viewer type is inferred from the
 *          logged-in user's role.
 * @access  Private (doctor, patient)
 */
exports.markViewed = async (req, res) => {
  try {
    const { id } = req.params;

    const labTest = await LabTest.findById(id);
    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'الفحص غير موجود'
      });
    }

    let viewerType = null;
    if (req.user.roles?.includes('doctor')) viewerType = 'doctor';
    else if (req.user.roles?.includes('patient')) viewerType = 'patient';

    if (!viewerType) {
      return res.status(403).json({
        success: false,
        message: 'فقط الأطباء والمرضى يمكنهم تسجيل المشاهدة'
      });
    }

    await labTest.markViewedBy(viewerType);

    return res.json({
      success: true,
      message: 'تم تسجيل المشاهدة'
    });
  } catch (error) {
    console.error('Mark viewed error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تسجيل المشاهدة'
    });
  }
};

exports.getPendingByPatient = async (req, res) => {
  console.log('🔵 ========== GET PENDING LAB TESTS BY PATIENT ==========');

  try {
    const { nationalId } = req.params;
    console.log('🔍 Searching for patient:', nationalId);

    // 1. Find patient (adult or child by nationalId, or child by CRN)
    let patientRef = null;
    let patientInfo = null;

    const adult = await Person.findOne({ nationalId }).lean();
    if (adult) {
      patientRef = { patientPersonId: adult._id };
      patientInfo = {
        type: 'adult',
        fullName: `${adult.firstName} ${adult.fatherName} ${adult.lastName}`,
        nationalId: adult.nationalId,
        dateOfBirth: adult.dateOfBirth,
        gender: adult.gender,
        phoneNumber: adult.phoneNumber
      };
    } else {
      // Try children — first by nationalId (post-migration), then by CRN
      let child = await Children.findOne({ nationalId }).lean();
      if (!child) {
        child = await Children.findOne({ childRegistrationNumber: nationalId }).lean();
      }
      if (child) {
        patientRef = { patientChildId: child._id };
        patientInfo = {
          type: 'child',
          fullName: `${child.firstName} ${child.fatherName} ${child.lastName}`,
          childRegistrationNumber: child.childRegistrationNumber,
          dateOfBirth: child.dateOfBirth,
          gender: child.gender,
          parentNationalId: child.parentNationalId
        };
      }
    }

    if (!patientRef) {
      console.log('❌ Patient not found');
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على المريض بهذا الرقم'
      });
    }

    console.log('✅ Patient found:', patientInfo.fullName);

    // 2. Find pending lab tests for this patient
    const labTests = await LabTest.find({
      ...patientRef,
      status: { $in: ['ordered', 'scheduled'] }
    })
      .populate('orderedBy', 'specialization medicalLicenseNumber')
      .populate('visitId', 'visitDate chiefComplaint diagnosis')
      .sort({ orderDate: -1 })
      .lean();

    console.log(`✅ Found ${labTests.length} pending test(s)`);

    return res.json({
      success: true,
      patient: patientInfo,
      count: labTests.length,
      labTests
    });
  } catch (error) {
    console.error('❌ Get pending lab tests error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب التحاليل'
    });
  }
};


exports.claimLabTest = async (req, res) => {
  console.log('🔵 ========== CLAIM LAB TEST ==========');

  try {
    const { id } = req.params;
    const { sampleId, notes } = req.body;

    const labTech = await getLabTechFromAccount(req.account);

    const labTest = await LabTest.findById(id);
    if (!labTest) {
      return res.status(404).json({
        success: false,
        message: 'الفحص غير موجود'
      });
    }

    // Status gate — only pending tests can be claimed
    if (!['ordered', 'scheduled'].includes(labTest.status)) {
      return res.status(400).json({
        success: false,
        message: `لا يمكن استلام فحص حالته "${labTest.status}"`
      });
    }

    // If already claimed by another lab, refuse
    if (labTest.laboratoryId && String(labTest.laboratoryId) !== String(labTech.laboratoryId)) {
      return res.status(403).json({
        success: false,
        message: 'هذا الفحص تم استلامه من مختبر آخر بالفعل'
      });
    }

    // Claim it: set lab + collect sample in one step
    labTest.laboratoryId = labTech.laboratoryId;
    labTest.status = 'sample_collected';
    labTest.sampleCollectedAt = new Date();
    labTest.sampleCollectedBy = labTech._id;
    if (sampleId) labTest.sampleId = sampleId.trim();
    if (notes) labTest.labNotes = notes.trim();
    await labTest.save();

    console.log('✅ Lab test claimed:', labTest.testNumber);

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'CLAIM_LAB_TEST',
      description: `Claimed ${labTest.testNumber}`,
      resourceType: 'lab_test',
      resourceId: labTest._id,
      patientPersonId: labTest.patientPersonId,
      patientChildId: labTest.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        testNumber: labTest.testNumber,
        sampleId,
        laboratoryId: labTech.laboratoryId
      }
    });

    return res.json({
      success: true,
      message: 'تم استلام الفحص بنجاح',
      labTest: {
        _id: labTest._id,
        testNumber: labTest.testNumber,
        status: labTest.status,
        sampleId: labTest.sampleId,
        sampleCollectedAt: labTest.sampleCollectedAt
      }
    });
  } catch (error) {
    console.error('❌ Claim lab test error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في استلام الفحص'
    });
  }
};