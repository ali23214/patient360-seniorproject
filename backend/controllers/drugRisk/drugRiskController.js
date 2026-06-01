/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  drugRiskController
 *  ─────────────────────────────────────────────────────────────────────────
 *  Orchestrates the end-to-end drug-risk check:
 *
 *    1. Resolve the patient (by personId for adults, childId for children)
 *    2. Fetch their Patient document for allergies, current meds, etc.
 *    3. Pre-check: is the requested drug even in our supported categories?
 *         - If YES  → continue to FastAPI
 *         - If NO   → save an out-of-scope record and skip the network call
 *                     (saves 50ms latency on every doctor keystroke)
 *    4. Normalize the profile (free-text → pipeline-friendly enums)
 *    5. Call Kinan's FastAPI /check-drug
 *    6. Persist the full check (DrugRiskCheck collection) for audit + history
 *    7. Return a clean response shape to the frontend
 *
 *  Two public endpoints:
 *    POST /api/drug-risk/check                (patient self-inquiry)
 *    POST /api/drug-risk/check-for-patient    (doctor or dentist screening)
 *
 *  Plus auxiliary endpoints:
 *    GET  /api/drug-risk/my-history           (patient's own history)
 *    POST /api/drug-risk/:id/acknowledge      (prescriber confirms an override)
 *    GET  /api/drug-risk/health               (FastAPI reachability probe)
 *
 *  Note on "doctor" vs "dentist":
 *    The DoctorDashboard is shared between both roles. The DrugRiskCheck
 *    schema keeps a single `doctorId` field which may reference EITHER a
 *    Doctor or a Dentist document (they're parallel collections with the
 *    same structural role: clinical prescriber). The helper
 *    `resolvePractitioner` below handles both transparently.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const {
  Person,
  Children,
  Patient,
  Doctor,
  Dentist,
  DrugRiskCheck,
} = require('../../models');

const fastApi = require('../../services/drugRisk/fastApiDrugClient');
const {
  buildPatientProfile,
  mentionsSupportedDrug,
} = require('../../services/drugRisk/drugNormalizationService');

// ── Constants ──────────────────────────────────────────────────────────

const RISK_LEVELS_HIGH = new Set(['مرتفع', 'متوسط']);

// Cap inputs server-side regardless of what the UI enforces.
const MAX_INPUT_TEXT_LENGTH = 500;

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Locate the patient document and the demographic reference (personId or
 * childId) given an identifier coming from the request.
 *
 * For self-inquiries the patient is `req.user` itself.
 * For doctor checks the patient is looked up by nationalId / childRegistrationNumber.
 */
async function resolvePatientForSelf(user) {
  // The accounts collection links to either persons or children.
  const ref = user.personId
    ? { personId: user.personId }
    : user.childId
    ? { childId: user.childId }
    : null;

  if (!ref) return null;

  const patient = await Patient.findOne(ref).lean();
  return { patient, ref };
}

async function resolvePatientByIdentifier(identifier) {
  if (!identifier) return null;

  // Identifier could be either an adult's nationalId (11 digits) or a child's
  // childRegistrationNumber. We try the most-likely path first.

  // (A) Adult lookup
  const person = await Person.findOne({ nationalId: identifier }).lean();
  if (person) {
    const patient = await Patient.findOne({ personId: person._id }).lean();
    return {
      patient,
      ref: { personId: person._id },
      kind: 'adult',
    };
  }

  // (B) Child lookup
  const child = await Children.findOne({ childRegistrationNumber: identifier }).lean();
  if (child) {
    const patient = await Patient.findOne({ childId: child._id }).lean();
    return {
      patient,
      ref: { childId: child._id },
      kind: 'child',
    };
  }

  return null;
}

/**
 * Resolve the prescriber's profile (Doctor or Dentist) given the
 * authenticated user. Returns null if no profile is found in either
 * collection.
 *
 * Why a unified helper:
 *   The DoctorDashboard is used by both doctors and dentists. Their
 *   profile documents live in separate collections (`doctors` and
 *   `dentists`), but they play the same structural role: prescriber.
 *   Rather than duplicate the lookup in every endpoint, we resolve once.
 *
 * Lookup strategy:
 *   We check the user's roles array and query only the relevant
 *   collection. If neither role is present (shouldn't happen since the
 *   route's authorize() already filters), we return null.
 */
async function resolvePractitioner(user) {
  const roles = Array.isArray(user.roles) ? user.roles : [];

  if (roles.includes('doctor')) {
    const doctor = await Doctor.findOne({ personId: user.personId }).lean();
    if (doctor) return { profile: doctor, kind: 'doctor' };
  }

  if (roles.includes('dentist')) {
    const dentist = await Dentist.findOne({ personId: user.personId }).lean();
    if (dentist) return { profile: dentist, kind: 'dentist' };
  }

  return null;
}

/**
 * Build the persistent DrugRiskCheck document from a FastAPI response (or
 * an out-of-scope short-circuit). Does not save — caller persists.
 */
function buildCheckRecord({
  ref,
  initiatedBy,
  doctorId,
  inputText,
  profile,
  fastApiResult,
  isOutOfScope,
}) {
  const record = {
    ...(ref.personId ? { patientPersonId: ref.personId } : {}),
    ...(ref.childId  ? { patientChildId:  ref.childId  } : {}),
    initiatedBy,
    ...(doctorId ? { doctorId } : {}),
    inputText,
    profileSnapshot: {
      allergies:           profile.allergies,
      chronicDiseases:     profile.chronic_diseases,
      geneticDiseases:     profile.genetic_diseases,
      currentMedications:  profile.current_medications,
    },
    isOutOfScope: Boolean(isOutOfScope),
  };

  if (isOutOfScope) {
    record.result = {
      drugNameAr: null,
      normalizedDrug: null,
      riskLevelAr: 'غير معروف',
      reasonAr: 'هذا الدواء خارج نطاق الفئات المدعومة حالياً (المسكنات، التنفسي، الهضمي).',
      adviceAr: 'يُفضّل مراجعة الطبيب أو الصيدلي قبل الاستخدام.',
      warningAr: null,
      interactionWarningAr: null,
    };
    record.isHighRisk = false;
    return record;
  }

  if (fastApiResult.ok) {
    const d = fastApiResult.data || {};
    record.result = {
      drugNameAr:            d.drug_name_ar           || null,
      normalizedDrug:        d.normalized_drug        || null,
      riskLevelAr:           d.risk_level_ar          || null,
      reasonAr:              d.reason_ar              || null,
      adviceAr:              d.advice_ar              || null,
      warningAr:             d.warning_ar             || null,
      interactionWarningAr:  d.interaction_warning_ar || null,
    };
    record.isHighRisk =
      RISK_LEVELS_HIGH.has(d.risk_level_ar) ||
      Boolean(d.interaction_warning_ar);
    record.fastApiRequestMs = fastApiResult.elapsedMs;
    record.fastApiStatus    = fastApiResult.status;
  } else {
    record.fastApiError     = fastApiResult.error?.message;
    record.fastApiRequestMs = fastApiResult.elapsedMs;
    record.fastApiStatus    = fastApiResult.status;
  }

  return record;
}

// ── Endpoint: POST /api/drug-risk/check  (patient self-inquiry) ────────

exports.checkForSelf = async (req, res) => {
  try {
    const { text } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'يرجى كتابة اسم الدواء أو جملة عنه',
      });
    }
    const inputText = text.trim().slice(0, MAX_INPUT_TEXT_LENGTH);

    const resolved = await resolvePatientForSelf(req.user);
    if (!resolved?.patient) {
      return res.status(404).json({
        success: false,
        message: 'لم نتمكن من العثور على ملفك الطبي',
      });
    }
    const { patient, ref } = resolved;

    // Build pipeline-ready profile
    const profile = buildPatientProfile(patient);

    // Decide: out-of-scope short-circuit or FastAPI call?
    const inScope = mentionsSupportedDrug(inputText);

    let fastApiResult = null;
    if (inScope) {
      fastApiResult = await fastApi.checkDrug({
        patient_id: String(patient._id),
        text: inputText,
        patient_profile: profile,
      });

      // FastAPI itself unreachable → fall back gracefully
      if (!fastApiResult.ok && fastApiResult.error?.code !== 'FASTAPI_ERROR') {
        // Network failure (down/timeout). Don't save a misleading record.
        return res.status(503).json({
          success: false,
          message: fastApiResult.error.message,
        });
      }
    }

    const record = buildCheckRecord({
      ref,
      initiatedBy: 'patient',
      inputText,
      profile,
      fastApiResult,
      isOutOfScope: !inScope,
    });

    const saved = await DrugRiskCheck.create(record);

    return res.json({
      success: true,
      check: {
        _id:           saved._id,
        result:        saved.result,
        isOutOfScope:  saved.isOutOfScope,
        isHighRisk:    saved.isHighRisk,
        createdAt:     saved.createdAt,
      },
    });
  } catch (err) {
    console.error('[drugRisk.checkForSelf]', err);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء فحص الدواء',
    });
  }
};

// ── Endpoint: POST /api/drug-risk/check-for-patient  (prescriber screening) ─
// Used by both doctors and dentists from the shared DoctorDashboard.

exports.checkForPatient = async (req, res) => {
  try {
    const { identifier, text } = req.body || {};

    if (typeof identifier !== 'string' || !identifier.trim()) {
      return res.status(400).json({
        success: false,
        message: 'معرّف المريض مطلوب',
      });
    }
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'اسم الدواء أو نص الفحص مطلوب',
      });
    }
    const inputText = text.trim().slice(0, MAX_INPUT_TEXT_LENGTH);

    // Locate the prescriber's profile (Doctor or Dentist)
    const practitioner = await resolvePractitioner(req.user);
    if (!practitioner) {
      return res.status(403).json({
        success: false,
        message: 'لم نعثر على حسابك الطبي',
      });
    }

    // Locate the patient
    const resolved = await resolvePatientByIdentifier(identifier.trim());
    if (!resolved?.patient) {
      return res.status(404).json({
        success: false,
        message: 'لم نعثر على المريض',
      });
    }
    const { patient, ref } = resolved;
    const profile = buildPatientProfile(patient);

    const inScope = mentionsSupportedDrug(inputText);

    let fastApiResult = null;
    if (inScope) {
      fastApiResult = await fastApi.checkDrug({
        patient_id: String(patient._id),
        text: inputText,
        patient_profile: profile,
      });

      if (!fastApiResult.ok && fastApiResult.error?.code !== 'FASTAPI_ERROR') {
        return res.status(503).json({
          success: false,
          message: fastApiResult.error.message,
        });
      }
    }

    const record = buildCheckRecord({
      ref,
      initiatedBy: 'doctor', // we keep this enum value for both prescribers
                             // (doctor + dentist) to avoid breaking the
                             // DrugRiskCheck.initiatedBy enum.
      doctorId: practitioner.profile._id,  // stores Doctor._id OR Dentist._id
      inputText,
      profile,
      fastApiResult,
      isOutOfScope: !inScope,
    });

    const saved = await DrugRiskCheck.create(record);

    return res.json({
      success: true,
      check: {
        _id:           saved._id,
        result:        saved.result,
        isOutOfScope:  saved.isOutOfScope,
        isHighRisk:    saved.isHighRisk,
        createdAt:     saved.createdAt,
      },
    });
  } catch (err) {
    console.error('[drugRisk.checkForPatient]', err);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء فحص الدواء',
    });
  }
};

// ── Endpoint: GET /api/drug-risk/my-history  (patient's history) ───────

exports.myHistory = async (req, res) => {
  try {
    const resolved = await resolvePatientForSelf(req.user);
    if (!resolved) {
      return res.status(404).json({ success: false, message: 'الملف غير موجود' });
    }
    const { ref } = resolved;

    const page  = Math.max(parseInt(req.query.page,  10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);

    const [items, total] = await Promise.all([
      DrugRiskCheck.find(ref)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DrugRiskCheck.countDocuments(ref),
    ]);

    return res.json({
      success: true,
      page,
      limit,
      total,
      checks: items,
    });
  } catch (err) {
    console.error('[drugRisk.myHistory]', err);
    return res.status(500).json({
      success: false,
      message: 'تعذر تحميل سجل الفحوصات',
    });
  }
};

// ── Endpoint: POST /api/drug-risk/:id/acknowledge  (prescriber override) ───
// Used by both doctors and dentists.

exports.acknowledgeOverride = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'معرّف غير صالح' });
    }

    const { justification } = req.body || {};
    const trimmed = typeof justification === 'string' ? justification.trim().slice(0, 500) : '';

    // Only the originating prescriber can acknowledge their own check.
    // Resolve their profile (Doctor or Dentist).
    const practitioner = await resolvePractitioner(req.user);
    if (!practitioner) {
      return res.status(403).json({ success: false, message: 'لم نعثر على حسابك الطبي' });
    }

    const updated = await DrugRiskCheck.findOneAndUpdate(
      { _id: id, doctorId: practitioner.profile._id },
      {
        $set: {
          'doctorOverride.acknowledged':   true,
          'doctorOverride.acknowledgedAt': new Date(),
          'doctorOverride.justification':  trimmed,
        },
      },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ success: false, message: 'الفحص غير موجود' });
    }

    return res.json({ success: true, check: updated });
  } catch (err) {
    console.error('[drugRisk.acknowledgeOverride]', err);
    return res.status(500).json({ success: false, message: 'تعذر تسجيل التأكيد' });
  }
};

// ── Endpoint: GET /api/drug-risk/health  (FastAPI reachability) ────────

exports.health = async (req, res) => {
  const r = await fastApi.checkHealth();
  return res.status(r.ok ? 200 : 503).json({
    success: r.ok,
    fastApi: r,
  });
};