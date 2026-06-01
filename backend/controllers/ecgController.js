/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ECG Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  ECG AI analysis endpoints mounted under /api/ecg.
 *
 *  Two-step workflow (matches DoctorDashboard.jsx by design):
 *
 *    STEP A — Analyze (this controller, POST /api/ecg/analyze)
 *      Cardiologist uploads an ECG image. The Flask AI service classifies
 *      it (4 classes). We return the predictions to the frontend, which
 *      stores them in local state (`ecgResult`). NO persistence happens
 *      here — the analysis is a pure AI inference call.
 *
 *    STEP B — Save Visit (separate endpoint: doctorController.savePatientVisit)
 *      When the doctor finishes the visit, the frontend sends the whole
 *      payload (vitals + diagnosis + meds + ecgAnalysis JSON) in one shot.
 *      The visit document is created with `ecgAnalysis` already embedded.
 *
 *  Optional path:
 *      The endpoint ALSO supports an "attach to existing visit" mode for
 *      future use: if `visitId` is included in the body, the analysis is
 *      persisted directly onto that visit via Visit.attachECGAnalysis().
 *      This path is dormant in the current UI but kept for flexibility.
 *
 *  Functions:
 *    1. analyzeECG       — Run AI analysis (and optionally persist)
 *    2. testECGService   — Health check for the Flask AI service
 *    3. getVisitECG      — Fetch saved ECG analysis from a visit
 *
 *  CHANGES FROM PREVIOUS VERSION (Bug fixes):
 *    - ECG_AI_SERVICE_URL default port: 5001 → 8000 (matches Flask)
 *    - FormData field name to Flask: 'image' → 'file' (matches Flask)
 *    - Flask response parser rewritten to read `all_predictions`
 *    - CLASS_LABELS now recognizes both short names ("MI", "History of MI")
 *      and underscored names ("Myocardial_Infarction", "History_of_MI")
 *    - visitId made OPTIONAL — was required before, which broke the
 *      analyze-then-save workflow the frontend actually uses
 *    - Cardiologist authorization now works in both modes:
 *      • visitId present → check the visit's doctorId
 *      • visitId absent  → check req.user → personId → doctor.isECGSpecialist
 * ═══════════════════════════════════════════════════════════════════════════
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const { Visit, Doctor, AuditLog } = require('../models');

// Flask AI service URL — set via env or fall back to local default.
// IMPORTANT: Flask currently listens on port 8000 (see flask_ecg_server.py).
const ECG_AI_SERVICE_URL = process.env.ECG_AI_URL || 'http://localhost:8000';

// AI model version (passed through to the audit trail)
const AI_MODEL_VERSION = process.env.ECG_MODEL_VERSION || 'vgg16-v1.0';

// Field name the Flask server expects for the image upload.
// Flask reads: request.files['file']  — so we must send it as 'file'.
const FLASK_FILE_FIELD = 'file';

// ----------------------------------------------------------------------------
// CLASS_LABELS
//   Map Flask's class names (in either short form like "MI" or underscored
//   form like "Myocardial_Infarction") to bilingual labels used by the UI.
//   Keys are normalized (lowercased, spaces/underscores stripped) so we
//   can match both conventions transparently.
// ----------------------------------------------------------------------------
const CLASS_LABELS = {
  normal:               { englishLabel: 'Normal',                arabicLabel: 'طبيعي' },
  abnormalheartbeat:    { englishLabel: 'Abnormal Heartbeat',    arabicLabel: 'نبضات قلب غير طبيعية' },
  mi:                   { englishLabel: 'Myocardial Infarction', arabicLabel: 'احتشاء عضلة القلب' },
  myocardialinfarction: { englishLabel: 'Myocardial Infarction', arabicLabel: 'احتشاء عضلة القلب' },
  historyofmi:          { englishLabel: 'History of MI',         arabicLabel: 'تاريخ احتشاء سابق' }
};

/** Normalize a class name so "MI", "Myocardial_Infarction", "history of mi" all key consistently. */
function normalizeClassKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[_\s\-]+/g, '');
}

function resolveLabels(className) {
  const key = normalizeClassKey(className);
  return CLASS_LABELS[key] || { englishLabel: className, arabicLabel: className };
}

// ============================================================================
// HELPER: Forward image to Flask AI service
// ============================================================================

async function callFlaskAIService(imagePath) {
  const form = new FormData();
  form.append(FLASK_FILE_FIELD, fs.createReadStream(imagePath));

  let response;
  try {
    response = await axios.post(
      `${ECG_AI_SERVICE_URL}/predict`,
      form,
      {
        headers: form.getHeaders(),
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength:    50 * 1024 * 1024
      }
    );
  } catch (axiosError) {
    if (axiosError.code === 'ECONNREFUSED') {
      throw new Error('خدمة تحليل ECG غير متاحة حالياً. تأكد من تشغيل خادم AI');
    }
    if (axiosError.code === 'ETIMEDOUT' || axiosError.code === 'ECONNABORTED') {
      throw new Error('انتهت مهلة تحليل ECG. الرجاء المحاولة مرة أخرى');
    }
    throw new Error(`خطأ في خدمة تحليل ECG: ${axiosError.message}`);
  }

  // ── Validate Flask response shape ────────────────────────────────────────
  const data = response.data;
  if (!data || data.success === false) {
    throw new Error(data?.error || 'استجابة غير متوقعة من خدمة تحليل ECG');
  }
  if (!Array.isArray(data.all_predictions) || data.all_predictions.length === 0) {
    throw new Error('استجابة غير متوقعة من خدمة تحليل ECG');
  }

  // ── Normalize each prediction to { class, confidence, ...labels } ───────
  const enriched = data.all_predictions.map((p) => {
    const rawClass = p.class_name_short || p.class || 'Unknown';
    const labels   = resolveLabels(rawClass);
    return {
      class:        rawClass,
      confidence:   Number(p.probability ?? p.confidence ?? 0),
      englishLabel: labels.englishLabel,
      arabicLabel:  labels.arabicLabel
    };
  });

  const topPrediction = enriched.reduce(
    (max, p) => (p.confidence > (max?.confidence || 0) ? p : max),
    null
  );

  return {
    predictions:    enriched,
    topPrediction:  topPrediction?.class || 'Unknown',
    recommendation: generateRecommendation(topPrediction?.class)
  };
}

function generateRecommendation(topClass) {
  const recommendations = {
    normal:               'النتيجة طبيعية. لا توجد علامات على مشاكل قلبية واضحة.',
    abnormalheartbeat:    'تم اكتشاف نبضات قلب غير طبيعية. يُنصح بإجراء فحوصات إضافية.',
    mi:                   'تم اكتشاف علامات احتشاء عضلة القلب. حالة طارئة - يجب التدخل الفوري.',
    myocardialinfarction: 'تم اكتشاف علامات احتشاء عضلة القلب. حالة طارئة - يجب التدخل الفوري.',
    historyofmi:          'تم اكتشاف علامات احتشاء سابق. يُنصح بمتابعة دقيقة مع طبيب القلب.'
  };
  const key = normalizeClassKey(topClass);
  return recommendations[key] || 'يرجى مراجعة النتائج مع طبيب مختص.';
}

// ============================================================================
// AUTHORIZATION HELPER
// ============================================================================

/**
 * Resolve the cardiologist record for this request.
 *   - If visitId is provided, verify via the visit's doctorId.
 *   - Otherwise, resolve via req.user.personId (logged-in doctor).
 *
 * @returns {Promise<{ doctor: object, visit: object|null }>}
 * @throws  Error (.statusCode set) when authorization fails
 */
async function resolveCardiologist(req, visitId) {
  // ── Mode A: visitId supplied → authorize via the visit ──────────────────
  if (visitId) {
    const visit = await Visit.findById(visitId);
    if (!visit) {
      const err = new Error('الزيارة غير موجودة');
      err.statusCode = 404;
      throw err;
    }
    if (!visit.doctorId) {
      const err = new Error('هذه الزيارة ليست لطبيب — لا يمكن تحليل ECG');
      err.statusCode = 400;
      throw err;
    }
    const doctor = await Doctor.findById(visit.doctorId).lean();
    if (!doctor || !doctor.isECGSpecialist) {
      const err = new Error('تحليل ECG متاح فقط لأطباء القلب');
      err.statusCode = 403;
      throw err;
    }
    return { doctor, visit };
  }

  // ── Mode B: no visitId → authorize via req.user (the logged-in doctor) ──
  if (!req.user || !req.user.personId) {
    const err = new Error('غير مصرّح');
    err.statusCode = 401;
    throw err;
  }

  const doctor = await Doctor.findOne({ personId: req.user.personId }).lean();
  if (!doctor) {
    const err = new Error('لم يتم العثور على بيانات الطبيب');
    err.statusCode = 403;
    throw err;
  }
  if (!doctor.isECGSpecialist) {
    const err = new Error('تحليل ECG متاح فقط لأطباء القلب');
    err.statusCode = 403;
    throw err;
  }

  return { doctor, visit: null };
}

// ============================================================================
// 1. ANALYZE ECG
// ============================================================================

/**
 * @route   POST /api/ecg/analyze
 * @desc    Upload ECG image, run AI analysis.
 *          - If visitId is provided: persist the result to the visit.
 *          - If visitId is omitted : return the result for client-side use.
 * @access  Private (cardiologist only — verified via doctor.isECGSpecialist)
 *
 * Body (multipart/form-data):
 *   ecg_image  — file upload (jpg/png), name matches multer in routes/ecg.js
 *   visitId    — OPTIONAL, the visit to attach the analysis to
 *   patientId  — OPTIONAL, used by multer to organize file storage
 */
exports.analyzeECG = async (req, res) => {
  console.log('🔵 ========== ANALYZE ECG ==========');

  let uploadedImagePath = null;

  try {
    // ── 1. VALIDATE UPLOAD ────────────────────────────────────────────────
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'صورة ECG مطلوبة'
      });
    }

    uploadedImagePath = req.file.path;
    console.log('📎 Uploaded image:', req.file.filename);

    // ── 2. AUTHORIZE (visitId is optional) ────────────────────────────────
    const { visitId } = req.body;
    let doctor, visit;
    try {
      ({ doctor, visit } = await resolveCardiologist(req, visitId));
    } catch (authErr) {
      console.log('❌ Authorization failed:', authErr.message);
      return res.status(authErr.statusCode || 403).json({
        success: false,
        message: authErr.message
      });
    }
    console.log(
      visit
        ? `✅ Cardiologist verified via visit ${visit._id}`
        : '✅ Cardiologist verified via logged-in user (no visit attached)'
    );

    // ── 3. CALL FLASK AI SERVICE ──────────────────────────────────────────
    console.log('🤖 Calling Flask AI service at', ECG_AI_SERVICE_URL);
    const aiResult = await callFlaskAIService(uploadedImagePath);
    console.log('✅ AI analysis complete');
    console.log('🎯 Top prediction:', aiResult.topPrediction);

    // ── 4. BUILD ANALYSIS OBJECT ──────────────────────────────────────────
    const analysis = {
      ecgImageUrl:    `/uploads/ecg/${req.file.filename}`,
      predictions:    aiResult.predictions,
      topPrediction:  aiResult.topPrediction,
      recommendation: aiResult.recommendation,
      modelVersion:   AI_MODEL_VERSION,
      analyzedAt:     new Date()
    };

    // ── 5. (OPTIONAL) PERSIST TO VISIT ────────────────────────────────────
    // Only if visitId was supplied. In the current workflow the frontend
    // omits visitId and instead embeds the analysis in the save-visit call.
    if (visit) {
      await visit.attachECGAnalysis(analysis);
      console.log('💾 Analysis persisted to visit:', visit._id);
    }

    // ── 6. AUDIT LOG ──────────────────────────────────────────────────────
    AuditLog.record({
      userId:          req.user._id,
      userEmail:       req.user.email,
      action:          'ECG_ANALYSIS',
      description:     visit
        ? `Analyzed ECG for visit ${visit._id}`
        : 'Analyzed ECG (standalone, not yet attached to a visit)',
      resourceType:    visit ? 'visit' : 'doctor',
      resourceId:      visit ? visit._id : doctor._id,
      patientPersonId: visit?.patientPersonId,
      patientChildId:  visit?.patientChildId,
      ipAddress:       req.ip || 'unknown',
      success:         true,
      metadata: {
        topPrediction: aiResult.topPrediction,
        modelVersion:  AI_MODEL_VERSION,
        persisted:     Boolean(visit)
      }
    });

    // ── 7. RESPOND ────────────────────────────────────────────────────────
    return res.json({
      success: true,
      message: 'تم تحليل ECG بنجاح',
      analysis: {
        ...(visit && { visitId: visit._id }),
        ...analysis
      }
    });

  } catch (error) {
    console.error('❌ Analyze ECG error:', error);

    // Clean up uploaded file on error (don't leave orphan files)
    if (uploadedImagePath && fs.existsSync(uploadedImagePath)) {
      try {
        fs.unlinkSync(uploadedImagePath);
        console.log('🗑️  Cleaned up failed upload');
      } catch (unlinkErr) {
        console.error('Failed to delete orphan file:', unlinkErr);
      }
    }

    // Audit the failure too
    AuditLog.record({
      userId:       req.user?._id,
      userEmail:    req.user?.email,
      action:       'ECG_ANALYSIS',
      ipAddress:    req.ip || 'unknown',
      success:      false,
      errorMessage: error.message
    });

    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في تحليل ECG'
    });
  }
};

// ============================================================================
// 2. TEST ECG SERVICE (health check)
// ============================================================================

/**
 * @route   GET /api/ecg/test
 * @desc    Verify the Flask AI service is reachable
 * @access  Private (any authenticated user, useful for admin troubleshooting)
 */
exports.testECGService = async (req, res) => {
  try {
    const response = await axios.get(`${ECG_AI_SERVICE_URL}/health`, {
      timeout: 5000
    });

    return res.json({
      success: true,
      message: 'خدمة تحليل ECG متاحة',
      service: {
        url:          ECG_AI_SERVICE_URL,
        status:       response.data?.status || 'ok',
        modelLoaded:  response.data?.model_loaded ?? null,
        totalClasses: response.data?.total_classes ?? null,
        modelVersion: AI_MODEL_VERSION
      }
    });
  } catch (error) {
    console.error('ECG service health check failed:', error.message);
    return res.status(503).json({
      success: false,
      message: 'خدمة تحليل ECG غير متاحة',
      details: error.code === 'ECONNREFUSED'
        ? 'خادم AI غير مشغّل'
        : error.message
    });
  }
};

// ============================================================================
// 3. GET VISIT ECG (retrieve previously-analyzed result)
// ============================================================================

/**
 * @route   GET /api/ecg/visit/:visitId
 * @desc    Fetch the ECG analysis attached to a specific visit
 * @access  Private (treating doctor, patient owner, admin)
 */
exports.getVisitECG = async (req, res) => {
  try {
    const { visitId } = req.params;

    const visit = await Visit.findById(visitId)
      .select('ecgAnalysis patientPersonId patientChildId doctorId visitDate')
      .lean();

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'الزيارة غير موجودة'
      });
    }

    if (!visit.ecgAnalysis) {
      return res.status(404).json({
        success: false,
        message: 'لا يوجد تحليل ECG لهذه الزيارة'
      });
    }

    return res.json({
      success:   true,
      visitId:   visit._id,
      visitDate: visit.visitDate,
      analysis:  visit.ecgAnalysis
    });
  } catch (error) {
    console.error('Get visit ECG error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب تحليل ECG'
    });
  }
};