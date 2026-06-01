/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Knee X-Ray Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  📁 Path: backend/controllers/kneeXray/kneeXrayController.js
 *
 *  Responsibilities:
 *    1. analyze()              — POST /api/knee-xray/analyze
 *                                Forwards uploaded image to FastAPI,
 *                                persists result, returns enriched payload.
 *    2. myHistory()            — GET  /api/knee-xray/history/me
 *                                Returns the calling doctor's last N analyses.
 *    3. getPatientHistory()    — GET  /api/knee-xray/patient/:nationalId
 *                                Returns all analyses for a specific patient.
 *    4. getOne()               — GET  /api/knee-xray/:id
 *                                Returns a single analysis record.
 *    5. healthCheck()          — GET  /api/knee-xray/health
 *                                Verifies FastAPI reachability.
 *
 *  Persistence: `knee_xray_analyses` collection (added by Mongoose dynamically).
 *  Authorization: All endpoints require JWT + role='doctor' (health also
 *                 accepts 'admin'). Enforced at the route layer.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs   = require('fs');
const path = require('path');

const {
  KneeXrayAnalysis,
  Doctor,
  Person,
  Children,
  Patient,
  AuditLog,
} = require('../../models');

const {
  predictKneeOA,
  checkHealth,
  translateUpstreamError,
} = require('../../services/kneeXray/fastApiKneeXrayClient');

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════════════

const HISTORY_DEFAULT_LIMIT = 20;
const HISTORY_MAX_LIMIT     = 100;

/**
 * Arabic descriptions — used to enrich the AI response with localized text
 * for the dashboard. Keys match the English class names from the model.
 */
const ARABIC_DESCRIPTIONS = {
  Normal:    'الدرجة 0: ركبة سليمة بدون علامات التهاب مفصل',
  Mild_OA:   'الدرجة 1-2: التهاب مفصلي خفيف إلى مشكوك فيه',
  Severe_OA: 'الدرجة 3-4: التهاب مفصلي متوسط إلى شديد',
};

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Best-effort cleanup of an uploaded temp file. Never throws.
 */
function safeUnlink(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.warn('⚠️  Failed to delete uploaded file:', filePath, err.message);
    }
  });
}

/**
 * Resolve a patient by either nationalId (adult, 11 digits) or
 * childRegistrationNumber (minor). Returns the Person/Children doc and
 * the corresponding ID field for the analysis record.
 *
 * @param {string} identifier nationalId OR childRegistrationNumber
 * @returns {Promise<{ patientPersonId?, patientChildId?, patientNationalId?, patientChildRegistrationNumber?, patientFullName? } | null>}
 */
async function resolvePatientByIdentifier(identifier) {
  if (!identifier) return null;
  const trimmed = String(identifier).trim();

  // Try adult (nationalId — 11 digits)
  if (/^\d{11}$/.test(trimmed)) {
    const person = await Person.findOne({ nationalId: trimmed }).lean();
    if (person) {
      return {
        patientPersonId:   person._id,
        patientNationalId: person.nationalId,
        patientFullName:   [person.firstName, person.fatherName, person.lastName]
          .filter(Boolean).join(' '),
      };
    }
  }

  // Try child (CRN format: CRN-YYYYMMDD-XXXXX or generic string)
  const child = await Children.findOne({
    childRegistrationNumber: trimmed,
  }).lean();
  if (child) {
    return {
      patientChildId:                  child._id,
      patientChildRegistrationNumber:  child.childRegistrationNumber,
      patientFullName: [child.firstName, child.fatherName, child.lastName]
        .filter(Boolean).join(' '),
    };
  }

  return null;
}

/**
 * Get the calling doctor's record from the request.
 * `req.user` is set by the `protect` middleware (account doc).
 *
 * @returns {Promise<{ doctorId, doctorAccountId, doctorFullName } | null>}
 */
async function resolveDoctorFromRequest(req) {
  const account = req.user;
  if (!account || !account._id) return null;

  // The Account model has a personId reference. Look up the Doctor by that.
  const personId = account.personId?._id || account.personId;
  if (!personId) return null;

  const doctor = await Doctor.findOne({ personId })
    .populate('personId', 'firstName fatherName lastName')
    .lean();
  if (!doctor) return null;

  const p = doctor.personId || {};
  const fullName = [p.firstName, p.fatherName, p.lastName].filter(Boolean).join(' ');

  return {
    doctorId:        doctor._id,
    doctorAccountId: account._id,
    doctorFullName:  fullName || account.email,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. ANALYZE — POST /api/knee-xray/analyze
// ════════════════════════════════════════════════════════════════════════════

/**
 * Multipart upload + AI analysis + persistence.
 * Body fields:
 *   - knee_image    (File, required) — multer field name
 *   - patientIdentifier (string, optional) — nationalId or CRN
 *   - visitId       (string, optional) — link analysis to a visit
 *   - doctorNotes   (string, optional)
 */
exports.analyze = async (req, res) => {
  console.log('🦵 ========== KNEE OA ANALYZE ==========');
  console.log('   By doctor:', req.user?.email || '?');

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'يجب رفع صورة الأشعة',
    });
  }

  const { path: filePath, filename, originalname, mimetype, size } = req.file;
  console.log(`   File: ${originalname} (${(size / 1024).toFixed(1)} KB, ${mimetype})`);

  let analysisDoc;

  try {
    // ── 1. Identify the doctor ─────────────────────────────────────────────
    const doctorInfo = await resolveDoctorFromRequest(req);
    if (!doctorInfo) {
      safeUnlink(filePath);
      return res.status(403).json({
        success: false,
        message: 'لم يتم العثور على سجل الطبيب. تأكد من اكتمال ملفك الشخصي.',
      });
    }

    // ── 2. Optional: identify the patient ──────────────────────────────────
    const { patientIdentifier, visitId, doctorNotes } = req.body || {};
    let patientInfo = {};
    if (patientIdentifier) {
      const resolved = await resolvePatientByIdentifier(patientIdentifier);
      if (resolved) {
        patientInfo = resolved;
      } else {
        console.warn(`   ⚠️  Patient identifier not found: ${patientIdentifier}`);
      }
    }

    // ── 3. Call FastAPI ────────────────────────────────────────────────────
    const { status: upstreamStatus, data: aiData } = await predictKneeOA(
      filePath,
      originalname,
      mimetype
    );

    if (upstreamStatus < 200 || upstreamStatus >= 300) {
      console.warn(`   ❌ FastAPI returned ${upstreamStatus}:`, aiData);
      safeUnlink(filePath);
      return res.status(upstreamStatus).json({
        success: false,
        message: aiData?.detail || aiData?.message || 'فشل تحليل صورة الركبة',
      });
    }

    // ── 4. Validate the AI response shape ──────────────────────────────────
    const validation = KneeXrayAnalysis.validateAiResponse(aiData);
    if (!validation.valid) {
      console.error('   ❌ AI response validation failed:', validation.reason);
      safeUnlink(filePath);
      return res.status(502).json({
        success: false,
        message: 'استجابة غير صالحة من نموذج الذكاء الاصطناعي',
        detail:  validation.reason,
      });
    }

    console.log(
      `   ✅ ${aiData.predicted_class} (${aiData.confidence.toFixed(1)}%) — saved`
    );

    // ── 5. Persist the analysis ────────────────────────────────────────────
    // Note: we DON'T unlink the file on success — it's kept as the analysis
    // image, served via /uploads/knee-xray/<filename> by Express static.
    const imageUrl = `/uploads/knee-xray/${filename}`;

    analysisDoc = new KneeXrayAnalysis({
      ...patientInfo,
      ...doctorInfo,
      visitId: visitId || undefined,
      image: {
        filename,
        originalName: originalname,
        mimetype,
        sizeBytes:    size,
        url:          imageUrl,
        uploadedAt:   new Date(),
      },
      aiPredictedClass:    aiData.predicted_class,
      aiDescription:       aiData.description,
      aiDescriptionArabic: ARABIC_DESCRIPTIONS[aiData.predicted_class] || '',
      aiConfidence:        aiData.confidence,
      aiAllProbabilities:  aiData.all_probabilities,
      aiRawResponse:       JSON.stringify(aiData),
      doctorNotes:         doctorNotes || undefined,
      ipAddress:           req.ip,
      userAgent:           req.headers['user-agent'] || '',
    });

    await analysisDoc.save();

    // ── 6. Audit log (best-effort, never blocks the response) ──────────────
    try {
      await AuditLog.record({
        userId:       req.user._id,
        userEmail:    req.user.email,
        userRole:     'doctor',
        action:       'KNEE_OA_ANALYZE',
        description:  `Knee OA AI analysis: ${aiData.predicted_class} (${aiData.confidence.toFixed(1)}%)`,
        resourceType: 'KneeXrayAnalysis',
        resourceId:   analysisDoc._id,
        patientPersonId: patientInfo.patientPersonId,
        patientChildId:  patientInfo.patientChildId,
        ipAddress:    req.ip,
        userAgent:    req.headers['user-agent'] || '',
        platform:     req.headers['x-platform'] || 'web',
        success:      true,
      });
    } catch (auditErr) {
      console.warn('   ⚠️  Audit log failed:', auditErr.message);
    }

    // ── 7. Return enriched payload (frontend-friendly) ─────────────────────
    return res.status(200).json({
      success: true,
      analysisId: analysisDoc._id,
      bodyPart:   'knee', // mirrors the X-Ray "bodyPart" convention

      // Verbatim AI output (so the frontend can keep simple data binding)
      predicted_class:   aiData.predicted_class,
      description:       aiData.description,
      confidence:        aiData.confidence,
      all_probabilities: aiData.all_probabilities,

      // Enriched fields for Arabic UI
      predictedClassArabic: analysisDoc.aiPredictedClassArabic,
      descriptionArabic:    analysisDoc.aiDescriptionArabic,
      imageUrl,
      filename,
      modelVersion: analysisDoc.aiModelVersion,
      analyzedAt:   analysisDoc.createdAt,
    });

  } catch (err) {
    console.error('   💥 Knee OA analyze error:', err.code || err.message);
    safeUnlink(filePath);
    const { status, message } = translateUpstreamError(err);
    return res.status(status).json({ success: false, message });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 2. MY HISTORY — GET /api/knee-xray/history/me
// ════════════════════════════════════════════════════════════════════════════

/**
 * Returns the last N analyses performed by the calling doctor.
 * Query: ?limit=20 (max 100)
 */
exports.myHistory = async (req, res) => {
  try {
    const doctorInfo = await resolveDoctorFromRequest(req);
    if (!doctorInfo) {
      return res.status(403).json({
        success: false,
        message: 'لم يتم العثور على سجل الطبيب',
      });
    }

    const requested = parseInt(req.query.limit, 10) || HISTORY_DEFAULT_LIMIT;
    const limit     = Math.min(Math.max(requested, 1), HISTORY_MAX_LIMIT);

    const analyses = await KneeXrayAnalysis.find({ doctorId: doctorInfo.doctorId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      count:   analyses.length,
      analyses,
    });
  } catch (err) {
    console.error('💥 Knee OA myHistory error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحميل التاريخ',
      detail:  err.message,
    });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 3. PATIENT HISTORY — GET /api/knee-xray/patient/:identifier
// ════════════════════════════════════════════════════════════════════════════

/**
 * Returns all knee X-Ray analyses for a specific patient.
 * Path param `:identifier` can be nationalId (adult) or childRegistrationNumber.
 */
exports.getPatientHistory = async (req, res) => {
  try {
    const { identifier } = req.params;
    const resolved = await resolvePatientByIdentifier(identifier);
    if (!resolved) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على المريض',
      });
    }

    const query = {};
    if (resolved.patientPersonId)  query.patientPersonId = resolved.patientPersonId;
    if (resolved.patientChildId)   query.patientChildId  = resolved.patientChildId;

    const analyses = await KneeXrayAnalysis.find(query)
      .sort({ createdAt: -1 })
      .limit(HISTORY_MAX_LIMIT)
      .lean();

    return res.json({
      success: true,
      patient: {
        fullName: resolved.patientFullName,
        nationalId: resolved.patientNationalId,
        childRegistrationNumber: resolved.patientChildRegistrationNumber,
      },
      count: analyses.length,
      analyses,
    });
  } catch (err) {
    console.error('💥 Knee OA getPatientHistory error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحميل تاريخ المريض',
      detail:  err.message,
    });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 4. GET ONE — GET /api/knee-xray/:id
// ════════════════════════════════════════════════════════════════════════════

exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;
    const analysis = await KneeXrayAnalysis.findById(id).lean();
    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على التحليل',
      });
    }
    return res.json({ success: true, analysis });
  } catch (err) {
    console.error('💥 Knee OA getOne error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحميل التحليل',
      detail:  err.message,
    });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// 5. HEALTH — GET /api/knee-xray/health
// ════════════════════════════════════════════════════════════════════════════

exports.healthCheck = async (req, res) => {
  const result = await checkHealth();
  if (result.ok) {
    return res.json({
      success:  true,
      upstream: result.data,
    });
  }
  return res.status(503).json({
    success: false,
    message: 'خدمة تحليل صور الركبة غير متاحة',
    detail:  result.error,
  });
};
