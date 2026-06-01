/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Dental Caries Detection — Express Controller
 * Patient 360° — Syrian National Medical Platform
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Mounted at `/api/dental-caries/*` from routes/dentalCaries/dentalCaries.js.
 *
 * Responsibilities:
 *   1. Accept tooth X-ray images from authenticated dentists / doctors.
 *   2. Forward them to the FastAPI service (port 8004) for inference.
 *   3. Persist normalized results to MongoDB for audit + history.
 *   4. Serve history queries for both per-user and per-patient views.
 *
 * Storage pattern : Proxy + MongoDB  (matches KneeXrayAnalysis).
 *
 * The controller logs each analysis attempt to `audit_logs` using whichever
 * audit facility the project provides (utils/auditLogger.js → AuditLog model
 * fallback → no-op). Audit failures never block the response.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const mongoose = require('mongoose');

const DentalCariesAnalysis      = require('../../models/dentalCaries/DentalCariesAnalysis');

// Use the models barrel (../../models/index.js) so we automatically pick up
// the project's naming convention. The barrel exports `Children` (plural)
// matching the file name `Children.js` — singular `Child` does NOT exist in
// this codebase.
const {
  Person,
  Children,
  Doctor,
  Dentist,
} = require('../../models');

const FastApiDentalCariesClient = require('../../services/dentalCaries/fastApiDentalCariesClient');

/* ═══════════════════════════════════════════════════════════════════════════
   GRAD-CAM VISUALIZATION STORAGE
   ─────────────────────────────────────────────────────────────────────────
   FastAPI returns three base64-encoded PNGs. We decode them and write them
   to disk so the frontend can render them via plain <img> tags (URLs are
   small, base64 strings would bloat every history payload).

   Layout on disk:
     backend/uploads/dental-caries/gradcam/<analysisStem>__enhanced.png
     backend/uploads/dental-caries/gradcam/<analysisStem>__overlay.png
     backend/uploads/dental-caries/gradcam/<analysisStem>__boxes.png

   URL served:  /uploads/dental-caries/gradcam/<file>
   ═══════════════════════════════════════════════════════════════════════════ */

const GRADCAM_DIR = path.join(__dirname, '..', '..', 'uploads', 'dental-caries', 'gradcam');
if (!fs.existsSync(GRADCAM_DIR)) {
  fs.mkdirSync(GRADCAM_DIR, { recursive: true });
}

/**
 * Decode a base64 PNG payload (with or without the `data:image/png;base64,`
 * prefix) and write it to GRADCAM_DIR. Returns the public URL or null on
 * failure — we never let a viz write failure block the prediction response.
 */
function persistGradcamImage(b64Payload, outName) {
  if (!b64Payload || typeof b64Payload !== 'string') return null;

  try {
    const cleaned = b64Payload.replace(/^data:image\/\w+;base64,/, '');
    const buffer  = Buffer.from(cleaned, 'base64');
    if (buffer.length === 0) return null;

    const safe = String(outName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
    const full = path.join(GRADCAM_DIR, safe);
    fs.writeFileSync(full, buffer);
    return `/uploads/dental-caries/gradcam/${safe}`;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[dentalCaries] persistGradcamImage failed:', err.message);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUDIT LOGGING — Defensive resolution
   ─────────────────────────────────────────────────────────────────────────
   Try utility helper first, fall back to direct AuditLog model insertion,
   final fallback is a console-only logger in development.
   ═══════════════════════════════════════════════════════════════════════════ */

const auditLog = (() => {
  // 1. Project-wide helper (preferred)
  try {
    const mod = require('../../utils/auditLogger');
    if (typeof mod === 'function')          return mod;
    if (typeof mod?.auditLog === 'function') return mod.auditLog;
    if (typeof mod?.log === 'function')      return mod.log;
  } catch (_) { /* fall through */ }

  // 2. Direct AuditLog model
  try {
    const AuditLog = require('../../models/AuditLog');
    return async (entry) => {
      try {
        await AuditLog.create({ ...entry, timestamp: entry.timestamp || new Date() });
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('[audit] write failed:', err.message);
        }
      }
    };
  } catch (_) { /* fall through */ }

  // 3. Final fallback: dev-only console log
  return async (entry) => {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[audit]', entry?.action, '—', entry?.description);
    }
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

const NATIONAL_ID_REGEX = /^\d{11}$/;
const CRN_REGEX         = /^CRN-/i;

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT     = 100;

const DEFAULT_PATIENT_LIMIT = 50;
const MAX_PATIENT_LIMIT     = 200;

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Map a (prediction, probability) pair to a UI severity bucket.
 * Aligns with the existing X-Ray / Knee OA CSS classes.
 */
function buildSeverity(prediction, probabilityCaries) {
  if (prediction === 'Not_Caries')    return 'normal';
  if (probabilityCaries >= 0.8)       return 'critical';
  return 'warning';
}

/**
 * Generate an Arabic clinician-facing recommendation. Server-side so the
 * wording always reflects the current clinical policy.
 */
function buildRecommendationAr(prediction, probabilityCaries) {
  if (prediction === 'Not_Caries') {
    return 'لم يتم رصد تسوس واضح في الصورة. يُنصح بالاستمرار على روتين العناية الفموية اليومي '
         + 'وزيارة طبيب الأسنان للفحص الدوري كل 6 أشهر.';
  }
  if (probabilityCaries >= 0.8) {
    return 'تم اكتشاف تسوس بدرجة ثقة عالية. يُنصح بإجراء فحص سريري عاجل وبدء خطة العلاج المناسبة '
         + '(حشوة، علاج لُبّ، أو تاج) حسب عمق الإصابة والفحص السريري.';
  }
  return 'تم رصد علامات تسوس محتملة. يُنصح بإجراء فحص سريري شامل وأشعة إضافية للتأكد من التشخيص '
       + 'قبل اتخاذ قرار العلاج النهائي.';
}

/** Safely delete an on-disk file. Never throws. */
function safeUnlink(filepath) {
  try {
    if (filepath && fs.existsSync(filepath)) fs.unlinkSync(filepath);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[dentalCaries] Failed to delete uploaded file:', filepath, '—', err.message);
  }
}

/**
 * Resolve the authenticated user's professional record.
 * @returns {{ personId, dentistId, doctorId, role }}
 * @throws  Error with .status set
 */
async function resolveProfessional(user) {
  // The `protect` middleware in this project populates `personId` from the
  // Account collection. Depending on whether it calls .populate('personId')
  // or not, req.user.personId can be either:
  //   • a raw ObjectId  (unpopulated)
  //   • a populated Person document with its own _id
  // The line below handles both cases safely.
  const rawPersonId = user?.personId;
  const personId    = (rawPersonId && typeof rawPersonId === 'object' && rawPersonId._id)
                        ? rawPersonId._id
                        : rawPersonId;

  if (!personId) {
    const err = new Error('حسابك غير مرتبط بملف شخصي');
    err.status = 403;
    throw err;
  }

  const roles     = Array.isArray(user.roles) ? user.roles : [];
  const isDentist = roles.includes('dentist');
  const isDoctor  = roles.includes('doctor');

  if (!isDentist && !isDoctor) {
    const err = new Error('هذه الميزة متاحة لأطباء الأسنان والأطباء فقط');
    err.status = 403;
    throw err;
  }

  // Prefer dentist when both flags coexist (defensive — shouldn't happen)
  if (isDentist) {
    const dentist = await Dentist.findOne({ personId }).lean();
    if (!dentist) {
      const err = new Error('لم يتم العثور على ملف طبيب الأسنان المرتبط بحسابك');
      err.status = 403;
      throw err;
    }
    return { personId, dentistId: dentist._id, doctorId: null, role: 'dentist' };
  }

  const doctor = await Doctor.findOne({ personId }).lean();
  if (!doctor) {
    const err = new Error('لم يتم العثور على ملف الطبيب المرتبط بحسابك');
    err.status = 403;
    throw err;
  }
  return { personId, dentistId: null, doctorId: doctor._id, role: 'doctor' };
}

/**
 * Resolve a patient identifier — 11-digit national ID or CRN-prefixed code.
 * @returns {Promise<{ kind: 'adult'|'child', _id, record } | null>}
 */
async function resolvePatient(identifier) {
  if (!identifier) return null;

  if (CRN_REGEX.test(identifier)) {
    const child = await Children.findOne({ childRegistrationNumber: identifier }).lean();
    return child ? { kind: 'child', _id: child._id, record: child } : null;
  }

  if (NATIONAL_ID_REGEX.test(identifier)) {
    const person = await Person.findOne({ nationalId: identifier }).lean();
    return person ? { kind: 'adult', _id: person._id, record: person } : null;
  }

  return null;
}

/**
 * Build the unified response shape consumed by the frontend.
 *
 * IMPORTANT — Dual shape support:
 *   The Pak Team FastAPI returns a "flat" shape (prediction, probability_caries,
 *   probability_not_caries, interpretation). The DoctorDashboard.jsx Dental
 *   Caries tool, however, was modelled after the Knee-OA Xray tool which uses
 *   a "structured" shape (predicted_class, all_probabilities, description,
 *   recommendation).
 *
 *   To avoid having to change EITHER side, this builder emits BOTH shapes:
 *   the legacy/upstream-flat keys for any consumer that still uses them,
 *   AND the structured keys the new frontend reads.
 *
 * Keeps `bodyPart: 'dental'` for the front-end dispatcher.
 */
function buildAnalyzeResponse(analysisDoc) {
  const r = analysisDoc.result || {};

  return {
    success:    true,
    analysisId: analysisDoc._id,
    bodyPart:   'dental',
    filename:   analysisDoc.image?.originalName,
    imageUrl:   analysisDoc.image?.url,

    // ── Structured shape (consumed by DoctorDashboard.renderDentalCariesTool) ──
    predicted_class: r.prediction,
    confidence:      r.confidence,
    all_probabilities: {
      Caries:     r.probabilityCaries,
      Not_Caries: r.probabilityNotCaries,
    },
    description:        r.interpretation,
    descriptionArabic:  r.recommendationAr,
    recommendation:     r.recommendationAr,

    // ── Legacy/flat shape (kept for backward compatibility with any older
    //    consumer that may still read these flat keys) ─────────────────────
    prediction:             r.prediction,
    probability_caries:     r.probabilityCaries,
    probability_not_caries: r.probabilityNotCaries,
    decision_threshold:     r.decisionThreshold,
    interpretation:         r.interpretation,
    recommendationArabic:   r.recommendationAr,
    severity:               r.severity,

    // ── X-Ray UI compatibility flag (boolean shortcut) ────────────────────
    cariesDetected: r.prediction === 'Caries',

    // ── Grad-CAM visualization (optional — present only when /predict_with_gradcam
    //    was used and at least one image was successfully written to disk) ──
    visualization: analysisDoc.visualization || null,

    // ── Telemetry ─────────────────────────────────────────────────────────
    processingTimeMs: analysisDoc.processingTimeMs,
    analyzedAt:       analysisDoc.createdAt,
    modelInfo:        analysisDoc.modelInfo,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/dental-caries/analyze
   ═══════════════════════════════════════════════════════════════════════════ */

exports.analyze = async (req, res) => {
  const uploadedFile = req.file;

  /* ── 0. Guard: file presence ───────────────────────────────────────── */
  if (!uploadedFile) {
    return res.status(400).json({
      success: false,
      message: 'لم يتم إرفاق صورة. يرجى رفع صورة أشعة الأسنان (الحقل: tooth_image).',
    });
  }

  try {
    /* ── 1. Resolve professional ───────────────────────────────────── */
    let prof;
    try {
      prof = await resolveProfessional(req.user);
    } catch (err) {
      safeUnlink(uploadedFile.path);
      return res.status(err.status || 403).json({ success: false, message: err.message });
    }

    /* ── 2. Optional patient context from request body ─────────────── */
    const {
      patientPersonId: pPersonId,
      patientChildId:  pChildId,
      visitId,
      notes,
    } = req.body || {};

    if (pPersonId && pChildId) {
      safeUnlink(uploadedFile.path);
      return res.status(400).json({
        success: false,
        message: 'لا يمكن تحديد patientPersonId و patientChildId في نفس الطلب',
      });
    }
    if (pPersonId && !mongoose.Types.ObjectId.isValid(pPersonId)) {
      safeUnlink(uploadedFile.path);
      return res.status(400).json({ success: false, message: 'patientPersonId غير صالح' });
    }
    if (pChildId && !mongoose.Types.ObjectId.isValid(pChildId)) {
      safeUnlink(uploadedFile.path);
      return res.status(400).json({ success: false, message: 'patientChildId غير صالح' });
    }
    if (visitId && !mongoose.Types.ObjectId.isValid(visitId)) {
      safeUnlink(uploadedFile.path);
      return res.status(400).json({ success: false, message: 'visitId غير صالح' });
    }

    /* ── 3. Send to FastAPI (with Grad-CAM) ───────────────────────── */
    let fastApiResult;
    try {
      const buffer = fs.readFileSync(uploadedFile.path);
      fastApiResult = await FastApiDentalCariesClient.analyzeWithGradcam({
        buffer,
        filename: uploadedFile.originalname,
        mimetype: uploadedFile.mimetype,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[dentalCaries.analyze] FastAPI error:', err.message);

      // Audit the failure (best-effort)
      auditLog({
        userId:        req.user?._id || req.user?.id,
        userEmail:     req.user?.email,
        userRole:      'dentist',
        action:        'DENTAL_CARIES_ANALYZE_FAILED',
        description:   `FastAPI error: ${err.message}`,
        resourceType:  'dental_caries_analyses',
        ipAddress:     req.ip,
        userAgent:     req.get('user-agent'),
        platform:      'web',
        success:       false,
        errorMessage:  err.message,
        timestamp:     new Date(),
      }).catch(() => {});

      // Keep the file on disk for retry / debug — don't delete
      return res.status(err.status || 502).json({
        success:  false,
        message:  'تعذر الاتصال بخدمة الذكاء الاصطناعي. يرجى المحاولة لاحقاً.',
        upstream: true,
        error:    err.message,
      });
    }

    /* ── 4. Validate upstream response shape ─────────────────────── */
    if (!fastApiResult || typeof fastApiResult.prediction !== 'string') {
      safeUnlink(uploadedFile.path);
      return res.status(502).json({
        success:  false,
        message:  'استجابة غير متوقعة من خدمة الذكاء الاصطناعي',
        upstream: fastApiResult,
      });
    }

    /* ── 5. Build derived fields ─────────────────────────────────── */
    const probCaries    = parseFloat(fastApiResult.probability_caries ?? 0) || 0;
    const probNotCaries = parseFloat(
      fastApiResult.probability_not_caries ?? (1 - probCaries)
    ) || 0;
    const confidence    = parseFloat(
      fastApiResult.confidence ?? Math.max(probCaries, probNotCaries)
    ) || 0;
    const threshold     = parseFloat(fastApiResult.decision_threshold ?? 0.5) || 0.5;
    const severity      = buildSeverity(fastApiResult.prediction, probCaries);
    const recAr         = buildRecommendationAr(fastApiResult.prediction, probCaries);

    /* ── 5b. Persist Grad-CAM visualization images (if provided) ───
       FastAPI returns three base64-encoded PNGs under `visualization`.
       We decode them and write them to disk; the frontend renders via
       plain <img src="..."> using the stored URLs. Soft-failing: a
       missing/broken viz never blocks the prediction. */
    let vizDoc = null;
    const vizUpstream = fastApiResult.visualization;
    if (vizUpstream && !vizUpstream.error) {
      // Reuse the upload's filename stem so the viz files are easy to
      // correlate with the source image during debugging.
      const stem = path.parse(uploadedFile.filename).name;

      const enhancedUrl = persistGradcamImage(
        vizUpstream.enhanced_xray_b64,   `${stem}__enhanced.png`
      );
      const overlayUrl  = persistGradcamImage(
        vizUpstream.gradcam_overlay_b64, `${stem}__overlay.png`
      );
      const boxesUrl    = persistGradcamImage(
        vizUpstream.boxes_overlay_b64,   `${stem}__boxes.png`
      );

      // Only store the viz subdocument if at least one image was written.
      if (enhancedUrl || overlayUrl || boxesUrl) {
        vizDoc = {
          enhancedXrayUrl:        enhancedUrl,
          gradcamOverlayUrl:      overlayUrl,
          boxesOverlayUrl:        boxesUrl,
          suspiciousRegionsCount: Number(vizUpstream.suspicious_regions_count) || 0,
          generatedAt:            new Date(),
        };
      }
    }

    /* ── 6. Persist ──────────────────────────────────────────────── */
    const analysis = await DentalCariesAnalysis.create({
      analyzedByPersonId: prof.personId,
      ...(prof.dentistId && { dentistId: prof.dentistId }),
      ...(prof.doctorId  && { doctorId:  prof.doctorId  }),
      analyzedByRole:     prof.role,
      ...(pPersonId && { patientPersonId: pPersonId }),
      ...(pChildId  && { patientChildId:  pChildId  }),
      ...(visitId   && { visitId }),
      image: {
        filename:     uploadedFile.filename,
        originalName: uploadedFile.originalname,
        path:         uploadedFile.path,
        url:          `/uploads/dental-caries/${uploadedFile.filename}`,
        size:         uploadedFile.size,
        mimeType:     uploadedFile.mimetype,
      },
      result: {
        prediction:           fastApiResult.prediction,
        predictedClass:       fastApiResult.prediction,
        confidence,
        probabilityCaries:    probCaries,
        probabilityNotCaries: probNotCaries,
        decisionThreshold:    threshold,
        interpretation:       fastApiResult.interpretation,
        recommendationAr:     recAr,
        severity,
      },
      ...(vizDoc && { visualization: vizDoc }),
      modelInfo: {
        name:         'DentalCaries_Binary_EfficientNetV2B0',
        version:      '1.0',
        architecture: 'EfficientNetV2-B0',
        dataset:      'DENTEX 2023',
      },
      processingTimeMs: fastApiResult.processingTimeMs,
      ...(notes && { notes: String(notes).slice(0, 1000) }),
    });

    /* ── 7. Audit (success) ──────────────────────────────────────── */
    auditLog({
      userId:        req.user?._id || req.user?.id,
      userEmail:     req.user?.email,
      userRole:      prof.role,
      action:        'DENTAL_CARIES_ANALYZE',
      description:   `Dental caries analysis: ${fastApiResult.prediction} `
                     + `(${(confidence * 100).toFixed(1)}% confidence)`,
      resourceType:  'dental_caries_analyses',
      resourceId:    analysis._id,
      patientPersonId: pPersonId || undefined,
      patientChildId:  pChildId  || undefined,
      ipAddress:     req.ip,
      userAgent:     req.get('user-agent'),
      platform:      'web',
      success:       true,
      timestamp:     new Date(),
    }).catch(() => {});

    /* ── 8. Respond ──────────────────────────────────────────────── */
    return res.status(200).json(buildAnalyzeResponse(analysis.toObject()));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[dentalCaries.analyze] Unexpected error:', err);
    safeUnlink(uploadedFile?.path);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ غير متوقع في عملية التحليل',
      error:   err.message,
    });
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/dental-caries/history/me
   ═══════════════════════════════════════════════════════════════════════════ */

exports.getMyHistory = async (req, res) => {
  try {
    // Handle populated/unpopulated personId from `protect` middleware
    const rawPersonId = req.user?.personId;
    const personId    = (rawPersonId && typeof rawPersonId === 'object' && rawPersonId._id)
                          ? rawPersonId._id
                          : rawPersonId;

    if (!personId) {
      return res.status(403).json({
        success: false,
        message: 'حسابك غير مرتبط بملف شخصي',
      });
    }

    const requested = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_HISTORY_LIMIT)
      : DEFAULT_HISTORY_LIMIT;

    const analyses = await DentalCariesAnalysis.find({
      analyzedByPersonId: personId,
      isDeleted:          false,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean({ virtuals: true });

    return res.json({
      success: true,
      count:   analyses.length,
      limit,
      analyses,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[dentalCaries.getMyHistory] error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/dental-caries/patient/:identifier
   ═══════════════════════════════════════════════════════════════════════════ */

exports.getByPatient = async (req, res) => {
  try {
    const identifier = (req.params.identifier || '').trim();
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'معرف المريض مطلوب' });
    }

    const patient = await resolvePatient(identifier);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على المريض. تأكد من الرقم الوطني (11 خانة) أو رقم تسجيل الطفل (CRN-...)',
      });
    }

    const requested = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_PATIENT_LIMIT)
      : DEFAULT_PATIENT_LIMIT;

    const query = { isDeleted: false };
    if (patient.kind === 'adult') query.patientPersonId = patient._id;
    else                          query.patientChildId  = patient._id;

    const analyses = await DentalCariesAnalysis.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean({ virtuals: true });

    return res.json({
      success: true,
      patient: {
        kind: patient.kind,
        _id:  patient._id,
        ...(patient.kind === 'adult'
          ? { nationalId: patient.record.nationalId }
          : { childRegistrationNumber: patient.record.childRegistrationNumber }),
        firstName:  patient.record.firstName,
        fatherName: patient.record.fatherName,
        lastName:   patient.record.lastName,
      },
      count: analyses.length,
      limit,
      analyses,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[dentalCaries.getByPatient] error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/dental-caries/:id
   ═══════════════════════════════════════════════════════════════════════════ */

exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'معرف التحليل غير صالح' });
    }

    const analysis = await DentalCariesAnalysis.findOne({
      _id:       id,
      isDeleted: false,
    }).lean({ virtuals: true });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على نتيجة التحليل',
      });
    }

    return res.json({ success: true, analysis });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[dentalCaries.getById] error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/dental-caries/health
   ═══════════════════════════════════════════════════════════════════════════ */

exports.health = async (req, res) => {
  const backendStatus = {
    status:    'healthy',
    timestamp: new Date().toISOString(),
    service:   'dental-caries-proxy',
  };

  try {
    const upstream = await FastApiDentalCariesClient.health();
    return res.json({
      success:    true,
      backend:    backendStatus,
      upstream,
      serviceUrl: FastApiDentalCariesClient.getServiceUrl(),
    });
  } catch (err) {
    return res.status(503).json({
      success:  false,
      message:  'خدمة الذكاء الاصطناعي للأسنان غير متاحة حالياً',
      backend:  backendStatus,
      upstream: {
        status: 'unreachable',
        error:  err.message,
      },
      serviceUrl: FastApiDentalCariesClient.getServiceUrl(),
    });
  }
};
