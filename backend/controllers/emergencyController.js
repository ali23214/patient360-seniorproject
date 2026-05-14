/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Emergency Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Mobile + web emergency AI feature. Mounted at /api/emergency.
 *
 *  Workflow:
 *    1. Patient opens app, taps SOS / opens الإسعاف الأولي
 *    2. Patient submits text description AND/OR image AND/OR voice recording
 *    3. App also sends GeoJSON location (required — Syria-bounded)
 *    4. Controller calls Redwan's FastAPI service for AI assessment
 *    5. Result saved as EmergencyReport with aiRiskLevel + aiFirstAid steps
 *    6. If risk is high/critical, patient can one-tap "Call Ambulance"
 *    7. Dispatcher views all active reports near a location for prioritization
 *
 *  AI INTEGRATION:
 *    callEmergencyAI() proxies to the FastAPI service running on
 *    EMERGENCY_AI_URL (default http://localhost:8000) — Redwan's service
 *    exposes /predict/text, /predict/image, /predict/voice. The helper
 *    routes to the correct endpoint based on which input was provided
 *    and maps FastAPI's rich response shape to the DB schema enums.
 *
 *    Schema-vs-API split:
 *      • DB schema (locked) only stores 4 severity levels + a small set
 *        of summary fields.
 *      • FastAPI returns much richer data (top-5 predictions, secondary
 *        diagnosis, clarifying questions, multi-condition arrays, …).
 *      • We persist the summary fields per the schema and ALSO surface
 *        the full detail in the API response payload so the frontend
 *        ResultCard can display the rich shape without a second round-
 *        trip. The detail is not stored — by design.
 *
 *  BSON-double discipline:
 *    The locked schema declares aiConfidence and location.coordinates.items
 *    as bsonType: "double". A raw JS integer (0, 1, 36) would be encoded
 *    as BSON Int32 and rejected by the $jsonSchema validator (error code
 *    121). Every numeric value bound for those fields is therefore wrapped
 *    in `bson.Double` to force the correct BSON type.
 *
 *    Refs:
 *      • https://www.mongodb.com/docs/manual/core/schema-validation/specify-json-schema/
 *      • https://www.mongodb.com/docs/manual/reference/operator/query/jsonschema/
 *
 *  Functions:
 *    1. submitEmergencyReport      — Patient submits emergency
 *    2. getMyEmergencyReports      — Patient's own report history
 *    3. getEmergencyReportById     — Single report detail
 *    4. callAmbulance              — Trigger ambulance dispatch on report
 *    5. resolveEmergencyReport     — Mark report resolved
 *    6. getActiveEmergencies       — Dispatcher view of active reports
 *    7. getNearbyEmergencies       — Dispatcher view by location radius
 *
 *  Conventions kept:
 *    - Arabic error messages, emoji-marked console logs
 *    - { success, message, [data] } response shape
 *    - Try/catch in every async function
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs       = require('fs');
const path     = require('path');
const axios    = require('axios');
const FormData = require('form-data');
const { Double } = require('bson');

const {
  EmergencyReport, Person, Children, AuditLog
} = require('../models');

const { createNotification } = require('./notificationController');

// ============================================================================
// AI SERVICE — Real FastAPI integration (Redwan's service)
// ============================================================================

// ─── FastAPI configuration (override via .env if needed) ───────────────────
const EMERGENCY_AI_URL        = process.env.EMERGENCY_AI_URL        || 'http://localhost:8000';
const EMERGENCY_AI_TIMEOUT_MS = parseInt(process.env.EMERGENCY_AI_TIMEOUT_MS || '60000', 10);
const EMERGENCY_AI_VERSION    = 'redwan-fastapi-v1.0.0';

// ─── Severity mapping ──────────────────────────────────────────────────────
// FastAPI returns granular bilingual labels; the DB enum is 4 levels.
// `is_emergency: true` always overrides to `critical`.
const FASTAPI_SEVERITY_TO_DB = {
  'Mild — خفيف':       'low',
  'None — لا يوجد':    'low',
  'Moderate — متوسط': 'moderate',
  'Severe — شديد':    'high',
  'Critical — حرج':   'critical',
};

function mapSeverity(fastApiSeverity, isEmergency) {
  if (isEmergency) return 'critical';
  return FASTAPI_SEVERITY_TO_DB[fastApiSeverity] || 'low';
}

/**
 * Normalize FastAPI's confidence value into a BSON Double in [0, 0.9999].
 *
 * Two things matter here:
 *   1. The DB schema declares aiConfidence as bsonType: "double". A raw JS
 *      integer (0, 1) serializes to BSON Int32 and fails $jsonSchema
 *      validation (MongoServerError code 121). We wrap the result in
 *      bson.Double to force the BSON type regardless of the value.
 *   2. We clamp into [0, 0.9999] so neither boundary becomes a JS integer
 *      before the wrap (defense in depth — the wrap alone is sufficient).
 *
 * Refs:
 *   • https://www.mongodb.com/docs/manual/core/schema-validation/specify-json-schema/
 *   • https://www.mongodb.com/docs/manual/reference/operator/query/jsonschema/
 */
function parseConfidence(value) {
  let n;
  if (typeof value === 'number') {
    n = value > 1 ? value / 100 : value;
  } else if (typeof value === 'string') {
    const num = parseFloat(value.replace('%', '').trim());
    if (Number.isNaN(num)) n = 0;
    else                   n = num > 1 ? num / 100 : num;
  } else {
    n = 0;
  }

  if (!Number.isFinite(n) || n < 0) n = 0;
  if (n >= 1)                       n = 0.9999;

  // Force BSON Double — JS `0` would otherwise serialize as Int32
  // and the $jsonSchema validator (bsonType: "double") would reject it.
  return new Double(n);
}

// Pick the worst-severity condition from a multi-condition response.
function pickWorstCondition(conditions) {
  if (!Array.isArray(conditions) || conditions.length === 0) return null;
  const priority = { critical: 4, high: 3, moderate: 2, low: 1 };
  return conditions.reduce((worst, current) => {
    if (!worst) return current;
    const w = priority[mapSeverity(worst.severity,   worst.is_emergency)]   || 0;
    const c = priority[mapSeverity(current.severity, current.is_emergency)] || 0;
    return c > w ? current : worst;
  }, null);
}

/**
 * Real emergency AI assessment — calls Redwan's FastAPI service.
 *
 * Routes to the correct FastAPI endpoint based on which input is provided:
 *   • image present → POST /predict/image  (form-data: image)
 *   • audio present → POST /predict/voice  (form-data: audio)
 *   • text  present → POST /predict/text   (form-data: text)
 * Priority: image > audio > text (matches FastAPI's natural multimodal order).
 *
 * @param {Object} input
 * @param {string} input.text       — Arabic symptom description
 * @param {string} input.imagePath  — local path to uploaded image
 * @param {string} input.audioPath  — local path to uploaded voice note
 * @param {string} input.inputType  — text | image | voice | combined
 * @returns {Promise<{
 *   aiRiskLevel: 'low'|'moderate'|'high'|'critical',
 *   aiAssessment: string,
 *   aiFirstAid: string[],
 *   confidenceScore: import('bson').Double,
 *   modelVersion: string,
 *   recommendAmbulance: boolean,
 *   aiRawResponse: string,
 *   voiceTranscript: string,
 *   diseaseClass: string,
 *   diseaseNameAr: string,
 *   topPredictions: Array,
 *   domain: string,
 *   ambiguityLevel: string,
 *   secondaryClass: string,
 *   secondaryNameAr: string,
 *   secondaryConfidence: string,
 *   clarifyingQuestions: Array,
 *   conditions: Array,
 *   outOfScopeMessage: string
 * }>}
 */
async function callEmergencyAI(input) {
  const { text, imagePath, audioPath, inputType } = input;

  console.log('🤖 [AI] Calling FastAPI:', EMERGENCY_AI_URL, 'mode:', inputType);

  // ── Build form-data and resolve endpoint ────────────────────────────────
  const formData = new FormData();
  let endpoint;

  if (imagePath) {
    endpoint = '/predict/image';
    formData.append('image', fs.createReadStream(imagePath));
  } else if (audioPath) {
    endpoint = '/predict/voice';
    formData.append('audio', fs.createReadStream(audioPath));
  } else if (text && text.trim()) {
    endpoint = '/predict/text';
    formData.append('text', text.trim());
  } else {
    throw new Error('لا يوجد إدخال صالح للتحليل');
  }

  // ── Call FastAPI with proper error translation ──────────────────────────
  let aiResponse;
  try {
    const { data } = await axios.post(
      `${EMERGENCY_AI_URL}${endpoint}`,
      formData,
      {
        headers: formData.getHeaders(),
        timeout: EMERGENCY_AI_TIMEOUT_MS,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      },
    );
    aiResponse = data;
    console.log('🎯 [AI] FastAPI response:', {
      ambiguity: aiResponse.ambiguity_level,
      class:     aiResponse.class,
      severity:  aiResponse.severity,
      domain:    aiResponse.domain,
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.error('❌ [AI] FastAPI unreachable at', EMERGENCY_AI_URL);
      throw new Error('خدمة الذكاء الاصطناعي غير متوفرة حالياً. يرجى المحاولة لاحقاً.');
    }
    if (error.code === 'ECONNABORTED') {
      throw new Error('انتهت مهلة الاتصال بخدمة الذكاء الاصطناعي. يرجى إعادة المحاولة.');
    }
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail
                  || error.response.data?.message
                  || error.response.statusText;
      console.error('❌ [AI] FastAPI error:', status, detail);
      if (status === 503) throw new Error('نموذج الذكاء الاصطناعي قيد التحميل. يرجى المحاولة بعد قليل.');
      if (status === 400) throw new Error(`بيانات الإدخال غير صالحة: ${detail}`);
      throw new Error(`خطأ في خدمة الذكاء الاصطناعي: ${detail}`);
    }
    throw error;
  }

  // ── Map FastAPI's rich response → internal contract ─────────────────────
  return mapFastApiResponse(aiResponse);
}

/**
 * Translates FastAPI's response shape into the contract the rest of the
 * controller expects. Handles every ambiguity_level branch separately.
 *
 * Each branch returns the full set of fields documented above, with
 * sensible defaults where a branch doesn't naturally produce that piece
 * of data (e.g. out_of_scope has no top5 predictions).
 *
 * NB: every confidenceScore value here MUST be a bson.Double — see the
 *     comment block above parseConfidence(). Hardcoded zeros use
 *     `new Double(0)` for the same reason.
 */
function mapFastApiResponse(r) {
  const ambiguity      = r.ambiguity_level || 'confident';
  const transcription  = r.transcription   || '';
  const rawResponseStr = JSON.stringify(r);

  // Default field set — branches override what they actually have.
  const baseFields = {
    modelVersion:        EMERGENCY_AI_VERSION,
    aiRawResponse:       rawResponseStr,
    voiceTranscript:     transcription,
    ambiguityLevel:      ambiguity,
    diseaseClass:        '',
    diseaseNameAr:       '',
    topPredictions:      [],
    domain:              '',
    secondaryClass:      '',
    secondaryNameAr:     '',
    secondaryConfidence: '',
    clarifyingQuestions: [],
    conditions:          [],
    outOfScopeMessage:   '',
  };

  // ── EMPTY ──────────────────────────────────────────────────────────────
  if (ambiguity === 'empty') {
    return {
      ...baseFields,
      aiRiskLevel:        'low',
      aiAssessment:       'لم يتم تقديم وصف كافٍ للتحليل.',
      aiFirstAid:         ['يرجى إعادة المحاولة بوصف أوضح للأعراض.'],
      confidenceScore:    new Double(0),
      recommendAmbulance: false,
    };
  }

  // ── OUT OF SCOPE ───────────────────────────────────────────────────────
  if (ambiguity === 'out_of_scope') {
    const message = r.message_ar || 'هذا الموضوع خارج نطاق النظام الطبي.';
    return {
      ...baseFields,
      aiRiskLevel:        'low',
      aiAssessment:       message,
      aiFirstAid:         ['يرجى طرح سؤال طبي محدد أو التوجه إلى المختص المناسب.'],
      confidenceScore:    new Double(0),
      recommendAmbulance: false,
      outOfScopeMessage:  message,
    };
  }

  // ── LOW CONFIDENCE IMAGE ───────────────────────────────────────────────
  if (ambiguity === 'low_confidence_image') {
    return {
      ...baseFields,
      aiRiskLevel:  'low',
      aiAssessment: r.message_ar || 'جودة الصورة غير كافية للتحليل.',
      aiFirstAid: [
        'التقط صورة مقربة وواضحة للمنطقة المصابة.',
        'تأكد من توفر إضاءة جيدة.',
        'أو استخدم وصفاً نصياً بدلاً من الصورة.',
      ],
      confidenceScore:    parseConfidence(r.confidence),
      recommendAmbulance: false,
      outOfScopeMessage:  r.message_ar || '',
    };
  }

  // ── MULTI-CONDITION (multiple symptoms detected) ───────────────────────
  if (ambiguity === 'multi') {
    const worst = pickWorstCondition(r.conditions);
    if (!worst) {
      return {
        ...baseFields,
        aiRiskLevel:        'low',
        aiAssessment:       'لم نتمكن من تحديد الحالة بدقة.',
        aiFirstAid:         ['يرجى استشارة الطبيب لتقييم الحالة.'],
        confidenceScore:    new Double(0),
        recommendAmbulance: false,
      };
    }
    const worstSeverity  = mapSeverity(worst.severity, worst.is_emergency);
    const ambulance      = !!(worst.call_ambulance || r.call_ambulance || r.any_emergency);
    const conditionLabel = worst.name_ar || worst.class || 'حالة طبية';

    return {
      ...baseFields,
      aiRiskLevel:        worstSeverity,
      aiAssessment:       `تم اكتشاف ${r.conditions.length} حالات. الأشد خطورة: ${conditionLabel}.`,
      aiFirstAid:         Array.isArray(worst.steps_ar) ? worst.steps_ar : [],
      confidenceScore:    parseConfidence(worst.confidence),
      recommendAmbulance: ambulance,
      diseaseClass:       worst.class    || '',
      diseaseNameAr:      worst.name_ar  || '',
      topPredictions:     Array.isArray(worst.top5) ? worst.top5 : [],
      domain:             worst.domain   || '',
      conditions:         Array.isArray(r.conditions) ? r.conditions : [],
    };
  }

  // ── SINGLE RESULT (confident | uncertain | very_ambiguous) ─────────────
  const severity = mapSeverity(r.severity, r.is_emergency);
  const steps    = Array.isArray(r.steps_ar) ? r.steps_ar : [];
  const nameAr   = r.name_ar || '';
  const cls      = r.class   || '';

  let assessment;
  if (ambiguity === 'confident') {
    assessment = nameAr
      ? `الحالة المحتملة: ${nameAr} (دقة ${r.confidence || ''})`
      : 'تم تحليل الحالة بنجاح.';
  } else if (ambiguity === 'uncertain') {
    const second = r.name_ar_2nd || r.class_2nd || '';
    assessment = second
      ? `الحالة قد تكون ${nameAr} أو ${second}. يرجى توضيح الأعراض.`
      : `الحالة المحتملة: ${nameAr}. يرجى توضيح الأعراض للتأكد.`;
  } else { // very_ambiguous
    assessment = 'الوصف غير واضح بما يكفي. يرجى تقديم تفاصيل إضافية أو رفع صورة.';
  }

  return {
    ...baseFields,
    aiRiskLevel:         severity,
    aiAssessment:        assessment,
    aiFirstAid:          steps,
    confidenceScore:     parseConfidence(r.confidence),
    recommendAmbulance:  !!r.call_ambulance,
    diseaseClass:        cls,
    diseaseNameAr:       nameAr,
    topPredictions:      Array.isArray(r.top5) ? r.top5 : [],
    domain:              r.domain || '',
    secondaryClass:      r.class_2nd   || '',
    secondaryNameAr:     r.name_ar_2nd || '',
    secondaryConfidence: r.conf_2nd    || '',
    clarifyingQuestions: Array.isArray(r.clarifying_questions) ? r.clarifying_questions : [],
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolve patient ref from logged-in account.
 */
function getPatientRefFromAccount(account) {
  if (account.personId) return { patientPersonId: account.personId };
  if (account.childId)  return { patientChildId:  account.childId  };
  return null;
}

/**
 * Validate GeoJSON location is Syria-bounded.
 * Syria roughly: lng 35.5–42.5, lat 32.0–37.5
 */
function validateSyriaLocation(location) {
  if (!location || location.type !== 'Point' || !Array.isArray(location.coordinates)) {
    return 'الموقع الجغرافي غير صالح (يجب أن يكون GeoJSON Point)';
  }
  const [lng, lat] = location.coordinates;
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    return 'إحداثيات الموقع غير صالحة';
  }
  if (lng < 35.5 || lng > 42.5 || lat < 32.0 || lat > 37.5) {
    return 'الموقع خارج حدود سوريا';
  }
  return null;
}

/**
 * Wrap GeoJSON Point coordinates in bson.Double so they survive the
 * collection-level $jsonSchema validator's bsonType: "double" check.
 * Whole-number-looking coordinates (e.g. 36, 33) would otherwise be
 * encoded as BSON Int32 by the driver and rejected.
 */
function toGeoDouble(location) {
  return {
    type: 'Point',
    coordinates: [
      new Double(Number(location.coordinates[0])),  // lng
      new Double(Number(location.coordinates[1])),  // lat
    ],
  };
}

// AI service errors (in Arabic) that should bubble up to the user instead of
// being swallowed by the generic 500 message. Detected by their prefix.
const AI_ERROR_PREFIXES = ['خدمة', 'نموذج', 'انتهت', 'بيانات', 'لا يوجد'];

function isAiServiceError(error) {
  return !!(error?.message
         && AI_ERROR_PREFIXES.some(p => error.message.startsWith(p)));
}

// ============================================================================
// 1. SUBMIT EMERGENCY REPORT
// ============================================================================

/**
 * @route   POST /api/emergency
 * @desc    Patient submits an emergency report. AI assesses, returns risk
 *          + first aid. Ambulance is NOT auto-called — patient confirms.
 * @access  Private (patient)
 *
 * Multipart body (any combination):
 *   text                         — text description
 *   image                        — image file (uploaded via multer)
 *   audio                        — voice recording file
 *   location                     — JSON string: { type:'Point', coordinates:[lng,lat] }
 *   locationAddress?             — human-readable address
 *   governorate?                 — for routing/dispatch
 *
 * Response (201 on success):
 *   {
 *     success: true,
 *     message: 'تم إرسال البلاغ بنجاح',
 *     report: {
 *       _id, status, ambulanceStatus,
 *       inputType, textDescription, imageUrl, voiceNoteUrl,
 *       reportedAt,
 *       aiRiskLevel, aiAssessment, aiFirstAid, aiConfidence,
 *       recommendAmbulance, voiceTranscript,
 *       // Enriched fields (not persisted, derived from FastAPI response):
 *       ambiguityLevel, diseaseClass, diseaseNameAr, domain,
 *       topPredictions, secondaryClass, secondaryNameAr,
 *       secondaryConfidence, clarifyingQuestions, conditions,
 *       outOfScopeMessage
 *     }
 *   }
 */
exports.submitEmergencyReport = async (req, res) => {
  console.log('🚨 ========== SUBMIT EMERGENCY ==========');

  // Track uploaded paths for cleanup on error
  const imagePath = req.files?.image?.[0]?.path;
  const audioPath = req.files?.audio?.[0]?.path;

  try {
    const patientRef = getPatientRefFromAccount(req.account);
    if (!patientRef) {
      return res.status(403).json({
        success: false,
        message: 'الحساب غير مرتبط بمريض'
      });
    }

    const { text, locationAddress, governorate } = req.body;

    // ── 1. PARSE & VALIDATE LOCATION ──────────────────────────────────────
    let location;
    try {
      location = typeof req.body.location === 'string'
        ? JSON.parse(req.body.location)
        : req.body.location;
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'الموقع الجغرافي بصيغة غير صالحة'
      });
    }

    if (!location) {
      return res.status(400).json({
        success: false,
        message: 'الموقع الجغرافي مطلوب لإرسال البلاغ'
      });
    }

    const locationError = validateSyriaLocation(location);
    if (locationError) {
      return res.status(400).json({
        success: false,
        message: locationError
      });
    }

    // Promote the validated coords to BSON Double — see toGeoDouble()
    // for the schema rationale.
    location = toGeoDouble(location);

    // ── 2. DETERMINE INPUT TYPE ───────────────────────────────────────────
    const hasText  = text && text.trim().length > 0;
    const hasImage = !!imagePath;
    const hasAudio = !!audioPath;
    const inputCount = [hasText, hasImage, hasAudio].filter(Boolean).length;

    if (inputCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب تقديم وصف نصي أو صورة أو تسجيل صوتي'
      });
    }

    let inputType;
    if (inputCount > 1)      inputType = 'combined';
    else if (hasImage)       inputType = 'image';
    else if (hasAudio)       inputType = 'voice';
    else                     inputType = 'text';

    console.log('📝 Input type:', inputType);

    // ── 3. CALL AI SERVICE (real FastAPI) ─────────────────────────────────
    const aiResult = await callEmergencyAI({
      text: text?.trim(),
      imagePath,
      audioPath,
      inputType
    });

    console.log('🎯 AI risk level:', aiResult.aiRiskLevel);

    // ── 4. CREATE EMERGENCY REPORT ────────────────────────────────────────
    // Note: we persist only the fields defined in the locked DB schema.
    // The richer AI fields (top predictions, clarifying questions, …) are
    // surfaced in the API response below for the frontend to display, but
    // are not stored — the schema doesn't define them.
    const imageUrl     = imagePath ? `/uploads/emergency/${path.basename(imagePath)}` : undefined;
    const voiceNoteUrl = audioPath ? `/uploads/emergency/${path.basename(audioPath)}` : undefined;

    const report = await EmergencyReport.create({
      ...patientRef,
      reportedAt:         new Date(),
      inputType,
      textDescription:    text?.trim(),
      imageUrl,
      voiceNoteUrl,
      location,
      locationAddress:    locationAddress?.trim(),
      governorate,
      aiRiskLevel:        aiResult.aiRiskLevel,
      aiAssessment:       aiResult.aiAssessment,
      aiFirstAid:         aiResult.aiFirstAid,
      aiConfidence:       aiResult.confidenceScore,   // already a bson.Double
      aiModelVersion:     aiResult.modelVersion,
      aiProcessedAt:      new Date(),
      aiRawResponse:      aiResult.aiRawResponse,
      voiceTranscript:    aiResult.voiceTranscript,
      recommendAmbulance: aiResult.recommendAmbulance,
      ambulanceStatus:    'not_called',
      status:             'active'
    });

    console.log('✅ Emergency report created:', report._id);

    // ── 5. AUDIT ──────────────────────────────────────────────────────────
    AuditLog.record({
      userId:           req.user._id,
      userEmail:        req.user.email,
      action:           'EMERGENCY_REPORT_SUBMITTED',
      description:      `Emergency report (${aiResult.aiRiskLevel})`,
      resourceType:     'emergency_report',
      resourceId:       report._id,
      patientPersonId:  report.patientPersonId,
      patientChildId:   report.patientChildId,
      ipAddress:        req.ip || 'unknown',
      success:          true,
      metadata: {
        inputType,
        aiRiskLevel:        aiResult.aiRiskLevel,
        recommendAmbulance: aiResult.recommendAmbulance
      }
    });

    // ── 6. RESPONSE — enriched payload for the redesigned ResultCard ──────
    return res.status(201).json({
      success: true,
      message: 'تم إرسال البلاغ بنجاح',
      report: {
        // Persisted fields
        _id:                report._id,
        status:             report.status,
        ambulanceStatus:    report.ambulanceStatus,
        reportedAt:         report.reportedAt,
        inputType:          report.inputType,
        textDescription:    report.textDescription,
        imageUrl:           report.imageUrl,
        voiceNoteUrl:       report.voiceNoteUrl,
        aiRiskLevel:        report.aiRiskLevel,
        aiAssessment:       report.aiAssessment,
        aiFirstAid:         report.aiFirstAid,
        aiConfidence:       report.aiConfidence,
        voiceTranscript:    report.voiceTranscript,
        recommendAmbulance: report.recommendAmbulance,

        // Enriched fields — derived from FastAPI, not stored in DB.
        // The frontend ResultCard reads these to show the rich shape
        // (top predictions, secondary diagnosis, clarifying questions,
        // multi-condition arrays, out-of-scope messages, …).
        ambiguityLevel:      aiResult.ambiguityLevel,
        diseaseClass:        aiResult.diseaseClass,
        diseaseNameAr:       aiResult.diseaseNameAr,
        domain:              aiResult.domain,
        topPredictions:      aiResult.topPredictions,
        secondaryClass:      aiResult.secondaryClass,
        secondaryNameAr:     aiResult.secondaryNameAr,
        secondaryConfidence: aiResult.secondaryConfidence,
        clarifyingQuestions: aiResult.clarifyingQuestions,
        conditions:          aiResult.conditions,
        outOfScopeMessage:   aiResult.outOfScopeMessage,
      }
    });

  } catch (error) {
    console.error('❌ Submit emergency error:', error);

    // Surface the EXACT $jsonSchema rule that rejected the document so
    // any future schema mismatch is self-diagnosing in one log block.
    if (error && error.code === 121 && error.errInfo) {
      console.error(
        '❌ Validation details:',
        JSON.stringify(error.errInfo.details, null, 2)
      );
    }

    // Cleanup uploaded files on error
    [imagePath, audioPath].forEach(p => {
      if (p && fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (e) { /* swallow */ }
      }
    });

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'خطأ في البيانات'
      });
    }

    // Surface specific AI service errors so the patient knows it's a service
    // issue (not their fault) and can retry meaningfully.
    const userMessage = isAiServiceError(error)
      ? error.message
      : 'حدث خطأ في إرسال البلاغ';

    return res.status(500).json({
      success: false,
      message: userMessage,
    });
  }
};

// ============================================================================
// 2. GET MY EMERGENCY REPORTS (patient's history)
// ============================================================================

/**
 * @route   GET /api/emergency/mine
 * @desc    Patient's own emergency report history
 * @access  Private (patient)
 */
exports.getMyEmergencyReports = async (req, res) => {
  try {
    const patientRef = getPatientRefFromAccount(req.account);
    if (!patientRef) {
      return res.status(403).json({
        success: false,
        message: 'الحساب غير مرتبط بمريض'
      });
    }

    const { page = 1, limit = 20 } = req.query;
    const safePage  = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);

    const [reports, total] = await Promise.all([
      EmergencyReport.find(patientRef)
        .sort({ reportedAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      EmergencyReport.countDocuments(patientRef)
    ]);

    return res.json({
      success: true,
      count:   total,
      page:    safePage,
      pages:   Math.ceil(total / safeLimit),
      reports
    });
  } catch (error) {
    console.error('Get my emergencies error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب البلاغات'
    });
  }
};

// ============================================================================
// 3. GET EMERGENCY REPORT BY ID
// ============================================================================

/**
 * @route   GET /api/emergency/:id
 * @desc    Single report detail
 * @access  Private (reporter, dispatcher/admin)
 */
exports.getEmergencyReportById = async (req, res) => {
  try {
    const { id } = req.params;

    const report = await EmergencyReport.findById(id)
      .populate('patientPersonId', 'firstName lastName nationalId phoneNumber')
      .populate('patientChildId',  'firstName lastName childRegistrationNumber phoneNumber')
      .lean();

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'البلاغ غير موجود'
      });
    }

    return res.json({
      success: true,
      report
    });
  } catch (error) {
    console.error('Get emergency error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب البلاغ'
    });
  }
};

// ============================================================================
// 4. CALL AMBULANCE
// ============================================================================

/**
 * @route   POST /api/emergency/:id/call-ambulance
 * @desc    Trigger ambulance dispatch for an emergency report. In production,
 *          this would integrate with the Syrian emergency services (133) via
 *          their dispatch API. For now, we just update the report status to
 *          'requested' and a dispatcher will pick it up manually.
 * @access  Private (reporter, dispatcher, admin)
 *
 * Body: { contactPhoneNumber?: string, additionalNotes?: string }
 */
exports.callAmbulance = async (req, res) => {
  console.log('🚑 ========== CALL AMBULANCE ==========');

  try {
    const { id } = req.params;
    const { contactPhoneNumber, additionalNotes } = req.body;

    const report = await EmergencyReport.findById(id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'البلاغ غير موجود'
      });
    }

    // Permission: reporter, dispatcher, or admin
    const isAdmin = req.user.roles?.includes('admin');
    const isOwner =
      (report.patientPersonId
        && String(report.patientPersonId) === String(req.user.personId))
      || (report.patientChildId
        && String(report.patientChildId) === String(req.user.childId));

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية لطلب الإسعاف لهذا البلاغ'
      });
    }

    if (report.ambulanceStatus !== 'not_called') {
      return res.status(400).json({
        success: false,
        message: 'تم طلب الإسعاف لهذا البلاغ مسبقاً'
      });
    }

    // Use the model's callAmbulance method
    await report.callAmbulance({
      contactPhoneNumber: contactPhoneNumber?.trim(),
      additionalNotes:    additionalNotes?.trim()
    });

    console.log('✅ Ambulance requested for report', report._id);

    AuditLog.record({
      userId:          req.user._id,
      userEmail:       req.user.email,
      action:          'AMBULANCE_REQUESTED',
      description:     `Ambulance dispatch requested for emergency ${report._id}`,
      resourceType:    'emergency_report',
      resourceId:      report._id,
      patientPersonId: report.patientPersonId,
      patientChildId:  report.patientChildId,
      ipAddress:       req.ip || 'unknown',
      success:         true,
      metadata: {
        aiRiskLevel:        report.aiRiskLevel,
        contactPhoneNumber
      }
    });

    // ── PUSH NOTIFICATION TO PATIENT ────────────────────────────────────────
    try {
      createNotification({
        recipientPersonId: report.patientPersonId,
        recipientChildId:  report.patientChildId,
        recipientType: 'patient',
        notificationType: 'emergency_alert',
        title:       'تم طلب الإسعاف',
        titleArabic: 'تم طلب الإسعاف',
        body: 'تم تسجيل طلب الإسعاف بنجاح. سيتم التواصل معك في أقرب وقت ممكن. ابقَ بمكانك إذا كان آمناً.',
        channels: ['push', 'in_app'],
        relatedType: 'emergency_report',
        relatedId:   report._id,
        deepLinkRoute: '/ai',
        priority: 'urgent'
      }).catch(err => console.warn('⚠️  Notification failed:', err.message));
    } catch (notifError) {
      console.warn('⚠️  Notification dispatch error (non-fatal):', notifError.message);
    }

    return res.json({
      success: true,
      message: 'تم طلب الإسعاف. سيتم التواصل معك قريباً',
      report: {
        _id:                  report._id,
        ambulanceStatus:      report.ambulanceStatus,
        ambulanceRequestedAt: report.ambulanceRequestedAt
      }
    });
  } catch (error) {
    console.error('❌ Call ambulance error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في طلب الإسعاف'
    });
  }
};

// ============================================================================
// 5. RESOLVE EMERGENCY REPORT
// ============================================================================

/**
 * @route   POST /api/emergency/:id/resolve
 * @desc    Mark report as resolved (patient is OK, false alarm, ambulance arrived, etc.)
 * @access  Private (reporter, dispatcher, admin)
 *
 * Body: { resolution: string, resolutionNotes?: string }
 */
exports.resolveEmergencyReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, resolutionNotes } = req.body;

    if (!resolution) {
      return res.status(400).json({
        success: false,
        message: 'سبب الإغلاق مطلوب'
      });
    }

    const report = await EmergencyReport.findById(id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'البلاغ غير موجود'
      });
    }

    if (report.status === 'resolved') {
      return res.status(400).json({
        success: false,
        message: 'البلاغ مغلق بالفعل'
      });
    }

    await report.resolve({
      resolution:      resolution.trim(),
      resolutionNotes: resolutionNotes?.trim(),
      resolvedBy:      req.user._id
    });

    AuditLog.record({
      userId:          req.user._id,
      userEmail:       req.user.email,
      action:          'EMERGENCY_RESOLVED',
      description:     `Resolved emergency ${report._id}`,
      resourceType:    'emergency_report',
      resourceId:      report._id,
      patientPersonId: report.patientPersonId,
      patientChildId:  report.patientChildId,
      ipAddress:       req.ip || 'unknown',
      success:         true,
      metadata: { resolution }
    });

    return res.json({
      success: true,
      message: 'تم إغلاق البلاغ',
      report
    });
  } catch (error) {
    console.error('Resolve emergency error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إغلاق البلاغ'
    });
  }
};

// ============================================================================
// 6. GET ACTIVE EMERGENCIES (dispatcher)
// ============================================================================

/**
 * @route   GET /api/emergency/active
 * @desc    All currently active emergency reports, sorted by severity then
 *          time. Used by dispatchers/admins for prioritization.
 * @access  Private (admin)
 *
 * Query: governorate?, riskLevel?, ambulanceStatus?
 */
exports.getActiveEmergencies = async (req, res) => {
  try {
    const { governorate, riskLevel, ambulanceStatus } = req.query;

    const query = { status: 'active' };
    if (governorate)     query.governorate     = governorate;
    if (riskLevel)       query.aiRiskLevel     = riskLevel;
    if (ambulanceStatus) query.ambulanceStatus = ambulanceStatus;

    const reports = await EmergencyReport.find(query)
      .populate('patientPersonId', 'firstName lastName phoneNumber')
      .populate('patientChildId',  'firstName lastName phoneNumber')
      .lean();

    // Sort by risk level (critical first) then by reportedAt (oldest first)
    const riskPriority = { critical: 1, high: 2, moderate: 3, low: 4 };
    reports.sort((a, b) => {
      const ap = riskPriority[a.aiRiskLevel] || 99;
      const bp = riskPriority[b.aiRiskLevel] || 99;
      if (ap !== bp) return ap - bp;
      return new Date(a.reportedAt) - new Date(b.reportedAt);
    });

    return res.json({
      success: true,
      count:   reports.length,
      reports
    });
  } catch (error) {
    console.error('Get active emergencies error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب البلاغات النشطة'
    });
  }
};

// ============================================================================
// 7. GET NEARBY EMERGENCIES (geo query)
// ============================================================================

/**
 * @route   GET /api/emergency/nearby?lng=...&lat=...&radiusKm=...
 * @desc    Active emergencies within a geographic radius. Used by ambulance
 *          dispatchers to find calls near the closest available ambulance.
 * @access  Private (admin)
 */
exports.getNearbyEmergencies = async (req, res) => {
  try {
    const { lng, lat, radiusKm = 10 } = req.query;

    if (lng === undefined || lat === undefined) {
      return res.status(400).json({
        success: false,
        message: 'lng و lat مطلوبان'
      });
    }

    const longitude    = parseFloat(lng);
    const latitude     = parseFloat(lat);
    const radiusMeters = parseFloat(radiusKm) * 1000;

    const reports = await EmergencyReport.findActiveNearby(
      [longitude, latitude],
      radiusMeters
    );

    return res.json({
      success: true,
      count:   reports.length,
      reports
    });
  } catch (error) {
    console.error('Get nearby emergencies error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في البحث الجغرافي'
    });
  }
};