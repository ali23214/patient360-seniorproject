/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ECG Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  ECG AI analysis endpoints mounted under /api/ecg.
 *
 *  Workflow:
 *    1. Cardiologist uploads ECG image during a visit
 *    2. Image is forwarded to a Python/Flask AI service running locally
 *       (the VGG16 model trained on ECG classifications)
 *    3. Flask returns predictions — 4 classes:
 *         - Normal
 *         - Abnormal_Heartbeat
 *         - Myocardial_Infarction (MI)
 *         - History_of_MI
 *       Each with a confidence score
 *    4. Result is stored permanently on visit.ecgAnalysis (was discarded
 *       in the old code — now persisted)
 *    5. Result is returned to the frontend to display
 *
 *  Functions:
 *    1. analyzeECG       — Run AI analysis and persist to visit
 *    2. testECGService   — Health check for the Flask AI service
 *    3. getVisitECG      — Fetch saved ECG analysis from a visit
 *
 *  Conventions kept:
 *    - Arabic error messages, emoji-marked console logs
 *    - { success, message, [data] } response shape
 *    - Try/catch in every async function
 * ═══════════════════════════════════════════════════════════════════════════
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const { Visit, Doctor, AuditLog } = require('../models');

// Flask AI service URL — set via env or fall back to local default
const ECG_AI_SERVICE_URL = process.env.ECG_AI_URL || 'http://localhost:5001';

// AI model version (passed through to the audit trail)
const AI_MODEL_VERSION = process.env.ECG_MODEL_VERSION || 'vgg16-v1.0';

// Map raw class names from the Flask service to bilingual labels
// (so the frontend doesn't need to do its own translation)
const CLASS_LABELS = {
  Normal: { englishLabel: 'Normal', arabicLabel: 'طبيعي' },
  Abnormal_Heartbeat: { englishLabel: 'Abnormal Heartbeat', arabicLabel: 'نبضات قلب غير طبيعية' },
  Myocardial_Infarction: { englishLabel: 'Myocardial Infarction', arabicLabel: 'احتشاء عضلة القلب' },
  History_of_MI: { englishLabel: 'History of MI', arabicLabel: 'تاريخ احتشاء سابق' }
};

// ============================================================================
// HELPER: Forward image to Flask AI service
// ============================================================================

/**
 * Send the uploaded image to the Flask AI service and parse the response.
 *
 * @param {string} imagePath - absolute path to the uploaded image on disk
 * @returns {Promise<{ predictions: Array, topPrediction: string, recommendation: string }>}
 * @throws  Error with descriptive Arabic message on Flask failure
 */
async function callFlaskAIService(imagePath) {
  const form = new FormData();
  form.append('image', fs.createReadStream(imagePath));

  let response;
  try {
    response = await axios.post(
      `${ECG_AI_SERVICE_URL}/predict`,
      form,
      {
        headers: form.getHeaders(),
        timeout: 30000,            // 30 sec timeout
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024
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

  // Validate Flask response shape
  if (!response.data || !Array.isArray(response.data.predictions)) {
    throw new Error('استجابة غير متوقعة من خدمة تحليل ECG');
  }

  // Enrich predictions with bilingual labels
  const enriched = response.data.predictions.map(p => ({
    class: p.class,
    confidence: p.confidence,
    englishLabel: CLASS_LABELS[p.class]?.englishLabel || p.class,
    arabicLabel: CLASS_LABELS[p.class]?.arabicLabel || p.class
  }));

  // The top prediction (highest confidence)
  const topPrediction = enriched.reduce((max, p) =>
    p.confidence > (max?.confidence || 0) ? p : max,
    null
  );

  return {
    predictions: enriched,
    topPrediction: topPrediction?.class || 'Unknown',
    recommendation: response.data.recommendation || generateRecommendation(topPrediction?.class)
  };
}

/**
 * Fallback recommendation text if Flask doesn't return one.
 */
function generateRecommendation(topClass) {
  const recommendations = {
    Normal: 'النتيجة طبيعية. لا توجد علامات على مشاكل قلبية واضحة.',
    Abnormal_Heartbeat: 'تم اكتشاف نبضات قلب غير طبيعية. يُنصح بإجراء فحوصات إضافية.',
    Myocardial_Infarction: 'تم اكتشاف علامات احتشاء عضلة القلب. حالة طارئة - يجب التدخل الفوري.',
    History_of_MI: 'تم اكتشاف علامات احتشاء سابق. يُنصح بمتابعة دقيقة مع طبيب القلب.'
  };
  return recommendations[topClass] || 'يرجى مراجعة النتائج مع طبيب مختص.';
}

// ============================================================================
// 1. ANALYZE ECG
// ============================================================================

/**
 * @route   POST /api/ecg/analyze
 * @desc    Upload ECG image, run AI analysis, persist result to the visit
 * @access  Private (cardiologist only — verified via doctor.isECGSpecialist)
 *
 * Body (multipart/form-data):
 *   image    — file upload (jpg/png)
 *   visitId  — required, the visit to attach the analysis to
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

    // ── 2. VALIDATE visitId ───────────────────────────────────────────────
    const { visitId } = req.body;
    if (!visitId) {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد الزيارة (visitId)'
      });
    }

    const visit = await Visit.findById(visitId);
    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'الزيارة غير موجودة'
      });
    }

    // ── 3. VERIFY DOCTOR IS A CARDIOLOGIST ────────────────────────────────
    if (!visit.doctorId) {
      return res.status(400).json({
        success: false,
        message: 'هذه الزيارة ليست لطبيب — لا يمكن تحليل ECG'
      });
    }

    const doctor = await Doctor.findById(visit.doctorId).lean();
    if (!doctor || !doctor.isECGSpecialist) {
      console.log('❌ Doctor is not an ECG specialist');
      return res.status(403).json({
        success: false,
        message: 'تحليل ECG متاح فقط لأطباء القلب'
      });
    }

    console.log('✅ Doctor verified as cardiologist');

    // ── 4. CALL FLASK AI SERVICE ──────────────────────────────────────────
    console.log('🤖 Calling Flask AI service...');
    const aiResult = await callFlaskAIService(uploadedImagePath);
    console.log('✅ AI analysis complete');
    console.log('🎯 Top prediction:', aiResult.topPrediction);

    // ── 5. BUILD ANALYSIS OBJECT ──────────────────────────────────────────
    const analysis = {
      ecgImageUrl: `/uploads/ecg/${req.file.filename}`,
      predictions: aiResult.predictions,
      topPrediction: aiResult.topPrediction,
      recommendation: aiResult.recommendation,
      modelVersion: AI_MODEL_VERSION
    };

    // ── 6. PERSIST TO VISIT ───────────────────────────────────────────────
    // The Visit model has an attachECGAnalysis() instance method that sets
    // the analysis sub-doc and stamps analyzedAt — much cleaner than us
    // assembling the object inline here.
    await visit.attachECGAnalysis(analysis);
    console.log('💾 Analysis persisted to visit:', visit._id);

    // ── 7. AUDIT LOG ──────────────────────────────────────────────────────
    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'ECG_ANALYSIS',
      description: `Analyzed ECG for visit ${visit._id}`,
      resourceType: 'visit',
      resourceId: visit._id,
      patientPersonId: visit.patientPersonId,
      patientChildId: visit.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        topPrediction: aiResult.topPrediction,
        modelVersion: AI_MODEL_VERSION
      }
    });

    // ── 8. RESPOND ────────────────────────────────────────────────────────
    return res.json({
      success: true,
      message: 'تم تحليل ECG بنجاح',
      analysis: {
        visitId: visit._id,
        ...analysis,
        analyzedAt: new Date()
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
      userId: req.user?._id,
      userEmail: req.user?.email,
      action: 'ECG_ANALYSIS',
      ipAddress: req.ip || 'unknown',
      success: false,
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
        url: ECG_AI_SERVICE_URL,
        status: response.data?.status || 'ok',
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
      success: true,
      visitId: visit._id,
      visitDate: visit.visitDate,
      analysis: visit.ecgAnalysis
    });
  } catch (error) {
    console.error('Get visit ECG error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب تحليل ECG'
    });
  }
};