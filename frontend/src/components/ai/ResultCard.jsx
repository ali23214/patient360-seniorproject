/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ResultCard — Patient 360° AI Atom (Triage / Specialist result display)
 *  ─────────────────────────────────────────────────────────────────────────
 *  Path: frontend/src/components/ai/ResultCard.jsx
 *
 *  Variant-driven card that displays AI analysis results in one of three
 *  modes:
 *    • 'specialist' — specialist recommender output (doctor type, disease,
 *      body system). Three stacked rows with thematic Lucide icons.
 *    • 'triage'     — emergency triage output. Comprehensive display
 *      tailored to the rich response shape returned by the FastAPI
 *      service (see RadwanSenior/app.py `clean_result` and the
 *      multi-shape ambiguity_level branches).
 *    • 'empty'      — no result yet. Shows an EmptyState inviting the
 *      user to start analysis.
 *
 *  Triage payload — supports every ambiguity_level shape produced by
 *  the FastAPI service:
 *
 *    confident | uncertain | very_ambiguous (single result):
 *      Severity badge → Disease name (Arabic + English class) → Domain
 *      pill → Voice transcription (if voice mode) → AI assessment line
 *      → Emergency banner (if recommendAmbulance) → First aid steps →
 *      Confidence bar → Top-5 predictions accordion → Secondary
 *      diagnosis card (if uncertain/very_ambiguous) → Clarifying
 *      questions list (if uncertain/very_ambiguous).
 *
 *    multi (multiple symptoms detected in a single text):
 *      Worst-severity badge → Multi banner ("X conditions detected") →
 *      Stacked condition cards, each with its own severity badge,
 *      Arabic name, confidence, first aid steps, and top-5 accordion.
 *
 *    out_of_scope:
 *      Info pill → message_ar from the AI service → suggestion to
 *      consult the appropriate specialist.
 *
 *    low_confidence_image:
 *      Info pill → "image quality too low" message → retry suggestion.
 *
 *  Loading and error states take precedence over variant content:
 *    • loading=true → skeleton shimmer (CSS disables animation when
 *      prefers-reduced-motion is set)
 *    • error (truthy) → AlertCircle + Arabic message (falls back through
 *      error.message → hardcoded fallback)
 *
 *  Backend response contract — the controller returns an enriched
 *  `report` object that mirrors most of the FastAPI fields plus the
 *  Mongoose-persisted bookkeeping. We accept both the modern enriched
 *  shape and the legacy minimal shape (only the original 7 fields) so
 *  historic reports loaded from the database keep rendering.
 *
 *  Composes four sibling atoms: SeverityBadge, FirstAidSteps,
 *  ConfidenceBar, EmptyState. See InputModeToggle.jsx for the AI-atom
 *  styling convention.
 *
 *  Accessibility:
 *    • Loading state: aria-busy + aria-label="جاري التحليل"
 *    • Error state: role="alert" so AT announces new errors automatically
 *    • Emergency banner: role="alert" (urgent, should interrupt)
 *    • Top-5 accordions: native <details>/<summary> — built-in keyboard
 *      and screen-reader disclosure semantics
 *    • Per-prediction bars: role="progressbar" with aria-valuenow/min/max
 *    • Confidence bar inherits a11y from ConfidenceBar atom
 *
 *  @param {object} props
 *  @param {'specialist'|'triage'|'empty'} props.variant
 *  @param {object} [props.result] - variant-specific payload, see above
 *  @param {boolean} [props.loading=false]
 *  @param {string|{message:string}|null} [props.error]
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import {
  Stethoscope,
  Activity,
  HeartPulse,
  AlertCircle,
  AlertOctagon,
  Sparkles,
  MessageSquareText,
  Tag,
  Layers,
  HelpCircle,
  ShieldAlert,
  Mic2,
  ChevronsRight,
} from 'lucide-react';

import SeverityBadge from './SeverityBadge';
import FirstAidSteps from './FirstAidSteps';
import ConfidenceBar from './ConfidenceBar';
import EmptyState from './EmptyState';

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Coerce a probability that might arrive as "85.3%" (FastAPI response),
 * 0.853 (normalized float), or 85.3 (percentage number) into a 0..1 range.
 */
function parseProb(prob) {
  if (typeof prob === 'number' && Number.isFinite(prob)) {
    return prob > 1 ? prob / 100 : prob;
  }
  if (typeof prob === 'string') {
    const cleaned = prob.replace('%', '').trim();
    const n = parseFloat(cleaned);
    if (Number.isNaN(n)) return 0;
    return n > 1 ? n / 100 : n;
  }
  return 0;
}

/**
 * Format a probability/confidence value for display: always a percentage
 * with one decimal place, regardless of input shape.
 */
function formatPct(prob) {
  return `${(parseProb(prob) * 100).toFixed(1)}%`;
}

function formatError(error) {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && typeof error.message === 'string') {
    return error.message;
  }
  return 'حدث خطأ أثناء التحليل';
}

/**
 * Map a raw class string ("Heart_Attack", "skin_abrasion") to a clean
 * display form ("Heart Attack", "Skin abrasion"). Used as a visual
 * fallback when the API didn't include an Arabic name.
 */
function humanizeClass(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Translate a domain string into an Arabic label + a CSS modifier so the
 * pill can be color-themed (emergency = red-tinted, medical = teal-tinted).
 */
function domainBadgeProps(domain) {
  const norm = (domain || '').toLowerCase();
  if (norm === 'emergency') {
    return { label: 'طوارئ', modifier: 'is-emergency' };
  }
  if (norm === 'wound') {
    return { label: 'إصابة جلدية', modifier: 'is-medical' };
  }
  if (norm === 'eye') {
    return { label: 'عيون', modifier: 'is-medical' };
  }
  if (norm === 'medical') {
    return { label: 'استشارة طبية', modifier: 'is-medical' };
  }
  if (!norm) return null;
  return { label: humanizeClass(domain), modifier: 'is-medical' };
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-renders
// ──────────────────────────────────────────────────────────────────────────

function ResultCardSkeleton() {
  return (
    <div
      className="pd-ai-result-card pd-ai-result-card--loading"
      aria-busy="true"
      aria-label="جاري التحليل"
    >
      <div className="pd-ai-result-skeleton-row" />
      <div className="pd-ai-result-skeleton-row" />
      <div className="pd-ai-result-skeleton-row" />
    </div>
  );
}

function ResultCardError({ message }) {
  return (
    <div className="pd-ai-result-card pd-ai-result-card--error" role="alert">
      <AlertCircle className="pd-ai-result-error-icon" size={28} aria-hidden="true" />
      <p className="pd-ai-result-error-message">{message}</p>
    </div>
  );
}

function ResultCardSpecialist({ result }) {
  const rows = [
    { icon: Stethoscope, label: 'الطبيب المختص',   value: result?.specialist  },
    { icon: Activity,    label: 'التشخيص المحتمل', value: result?.disease     },
    { icon: HeartPulse,  label: 'الجهاز',           value: result?.organ_system },
  ];

  return (
    <div className="pd-ai-result-card pd-ai-result-card--specialist">
      <h3 className="pd-ai-result-title">نتيجة التحليل</h3>
      <ul className="pd-ai-result-rows">
        {rows.map(({ icon: Icon, label, value }) => (
          <li key={label} className="pd-ai-result-row">
            <div className="pd-ai-result-row-icon">
              <Icon size={20} aria-hidden="true" />
            </div>
            <div className="pd-ai-result-row-text">
              <span className="pd-ai-result-row-label">{label}</span>
              <span className="pd-ai-result-row-value" dir="auto">
                {value || '—'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultCardEmpty() {
  return (
    <div className="pd-ai-result-card pd-ai-result-card--empty">
      <EmptyState
        icon={Sparkles}
        title="ابدأ التحليل"
        subtitle="أدخل أعراضك أو ارفع صورة طبية لبدء الاستشارة الذكية."
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Triage building blocks (shared between single & multi rendering)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Top-N predictions accordion. Defaults to 5 to match the FastAPI top5
 * payload but accepts arrays of any length (1 to N). The bars are pure
 * CSS — no JS animation library — so they animate cheaply via the
 * existing .pd-ai-result-top5-bar-fill keyframe.
 */
function TopPredictionsAccordion({ predictions, defaultOpen = false, summaryLabel = 'عرض التفاصيل' }) {
  if (!Array.isArray(predictions) || predictions.length === 0) return null;
  return (
    <details className="pd-ai-result-top5" open={defaultOpen}>
      <summary className="pd-ai-result-top5-summary">{summaryLabel}</summary>
      <ul className="pd-ai-result-top5-list">
        {predictions.map((p, idx) => {
          const probValue = parseProb(p?.prob ?? p?.confidence);
          const percentage = (probValue * 100).toFixed(1);
          const className = humanizeClass(p?.class) || '—';
          const arabic    = p?.name_ar ? ` (${p.name_ar})` : '';
          return (
            <li key={`${p?.class ?? 'cls'}-${idx}`} className="pd-ai-result-top5-item">
              <span className="pd-ai-result-top5-class" dir="auto">
                {className}{arabic}
              </span>
              <div
                className="pd-ai-result-top5-bar"
                role="progressbar"
                aria-valuenow={Number(percentage)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${className}: ${percentage}%`}
              >
                <div
                  className="pd-ai-result-top5-bar-fill"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="pd-ai-result-top5-pct">{percentage}%</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function ClarifyingQuestions({ questions }) {
  if (!Array.isArray(questions) || questions.length === 0) return null;
  return (
    <section className="pd-ai-result-clarify" aria-label="أسئلة توضيحية">
      <header className="pd-ai-result-clarify-header">
        <HelpCircle size={16} aria-hidden="true" />
        <h4 className="pd-ai-result-subtitle pd-ai-result-subtitle--inline">
          أسئلة لتأكيد التشخيص
        </h4>
      </header>
      <ul className="pd-ai-result-clarify-list">
        {questions.map((q, idx) => {
          // The FastAPI service may return questions as plain strings or
          // as objects with `{ question, options, ... }`. Render both.
          if (typeof q === 'string') {
            return (
              <li key={idx} className="pd-ai-result-clarify-item" dir="auto">
                {q}
              </li>
            );
          }
          if (q && typeof q === 'object') {
            return (
              <li key={idx} className="pd-ai-result-clarify-item" dir="auto">
                {q.question || q.q || q.text || JSON.stringify(q)}
              </li>
            );
          }
          return null;
        })}
      </ul>
    </section>
  );
}

function SecondaryDiagnosisCard({ secondaryNameAr, secondaryClass, secondaryConfidence }) {
  if (!secondaryNameAr && !secondaryClass) return null;
  const display = secondaryNameAr || humanizeClass(secondaryClass);
  return (
    <section className="pd-ai-result-secondary" aria-label="تشخيص بديل محتمل">
      <header className="pd-ai-result-secondary-header">
        <ChevronsRight size={16} aria-hidden="true" />
        <h4 className="pd-ai-result-subtitle pd-ai-result-subtitle--inline">
          تشخيص بديل محتمل
        </h4>
      </header>
      <div className="pd-ai-result-secondary-body">
        <span className="pd-ai-result-secondary-name" dir="auto">{display}</span>
        {secondaryConfidence && (
          <span className="pd-ai-result-secondary-conf">
            {formatPct(secondaryConfidence)}
          </span>
        )}
      </div>
    </section>
  );
}

function VoiceTranscriptionBlock({ transcript }) {
  const trimmed = (transcript || '').trim();
  if (!trimmed) return null;
  return (
    <section className="pd-ai-result-transcript" aria-label="نص التسجيل الصوتي">
      <header className="pd-ai-result-transcript-header">
        <Mic2 size={16} aria-hidden="true" />
        <h4 className="pd-ai-result-subtitle pd-ai-result-subtitle--inline">
          ما تم تحويله من الصوت
        </h4>
      </header>
      <p className="pd-ai-result-transcript-text" dir="auto">
        “{trimmed}”
      </p>
    </section>
  );
}

function DiagnosisHeader({
  diseaseNameAr,
  diseaseClass,
  domain,
  confidence,
}) {
  const displayName = diseaseNameAr || humanizeClass(diseaseClass) || '';
  const englishHint = diseaseClass && diseaseNameAr
    ? humanizeClass(diseaseClass)
    : '';
  const domainBadge = domainBadgeProps(domain);

  if (!displayName && !domainBadge) return null;

  return (
    <div className="pd-ai-result-diagnosis">
      <div className="pd-ai-result-diagnosis-main">
        {displayName && (
          <h4 className="pd-ai-result-diagnosis-name" dir="auto">
            {displayName}
          </h4>
        )}
        {englishHint && (
          <span className="pd-ai-result-diagnosis-en" dir="ltr">
            {englishHint}
          </span>
        )}
      </div>
      <div className="pd-ai-result-diagnosis-meta">
        {domainBadge && (
          <span className={`pd-ai-result-domain-badge ${domainBadge.modifier}`}>
            <Tag size={12} aria-hidden="true" />
            <span>{domainBadge.label}</span>
          </span>
        )}
        {confidence != null && Number.isFinite(parseProb(confidence)) && (
          <span className="pd-ai-result-diagnosis-conf">
            دقة {formatPct(confidence)}
          </span>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Multi-condition card (one card per detected condition)
// ──────────────────────────────────────────────────────────────────────────

function MultiConditionCard({ condition, index }) {
  const severity = mapSeverityFromCondition(condition);
  const steps    = Array.isArray(condition?.steps_ar) ? condition.steps_ar : [];
  const top5     = Array.isArray(condition?.top5)     ? condition.top5     : [];
  const callAmb  = !!condition?.call_ambulance;
  const conf     = condition?.confidence ?? condition?.conf_str;

  return (
    <article
      className={`pd-ai-result-multi-card${callAmb ? ' is-emergency' : ''}`}
      aria-label={`الحالة رقم ${index + 1}`}
    >
      <header className="pd-ai-result-multi-card-header">
        <span className="pd-ai-result-multi-card-index" aria-hidden="true">
          {index + 1}
        </span>
        <DiagnosisHeader
          diseaseNameAr={condition?.name_ar}
          diseaseClass={condition?.class}
          domain={condition?.domain}
          confidence={conf}
        />
        <SeverityBadge severity={severity} />
      </header>

      {callAmb && (
        <div className="pd-ai-result-emergency-banner pd-ai-result-emergency-banner--inline" role="alert">
          <AlertOctagon size={18} aria-hidden="true" />
          <p>
            <strong>حالة طارئة</strong>
            <span> — اتصل بالإسعاف فوراً</span>
          </p>
        </div>
      )}

      {steps.length > 0 && (
        <div className="pd-ai-result-first-aid">
          <h5 className="pd-ai-result-subtitle">خطوات الإسعاف الأولي</h5>
          <FirstAidSteps steps={steps} />
        </div>
      )}

      <TopPredictionsAccordion
        predictions={top5}
        summaryLabel="أهم الاحتمالات"
      />
    </article>
  );
}

/**
 * Extract a frontend severity ('low' | 'moderate' | 'high' | 'critical')
 * from a condition object. Mirrors the backend `mapSeverity()` helper so
 * we stay consistent across the boundary.
 */
function mapSeverityFromCondition(condition) {
  if (!condition) return 'low';
  if (condition.is_emergency || condition.call_ambulance) return 'critical';
  const sev = (condition.severity || '').toLowerCase();
  if (sev.includes('critical') || sev.includes('حرج'))    return 'critical';
  if (sev.includes('high')     || sev.includes('شديد'))   return 'high';
  if (sev.includes('moderate') || sev.includes('متوسط'))  return 'moderate';
  return 'low';
}

// ──────────────────────────────────────────────────────────────────────────
// Main triage variant
// ──────────────────────────────────────────────────────────────────────────

function ResultCardTriage({ result }) {
  // ── Defensive readouts: support both the modern enriched shape AND the
  // legacy minimal shape (aiRiskLevel / aiAssessment / aiFirstAid /
  // aiConfidence / recommendAmbulance only). ────────────────────────────
  const riskLevel    = result?.aiRiskLevel || 'low';
  const isEmergency  = !!(result?.recommendAmbulance ?? result?.is_emergency);
  const assessment   = result?.aiAssessment || '';
  const steps        = Array.isArray(result?.aiFirstAid) ? result.aiFirstAid : [];

  const confRaw =
    typeof result?.aiConfidence === 'number'
      ? result.aiConfidence
      : (typeof result?.aiConfidenceScore === 'number'
          ? result.aiConfidenceScore
          : null);
  const confidence = confRaw == null ? 0 : (confRaw > 1 ? confRaw / 100 : confRaw);

  // Enriched (preferred) fields
  const ambiguityLevel    = result?.ambiguityLevel || result?.ambiguity_level || '';
  const inputType         = result?.inputType || '';
  const voiceTranscript   = result?.voiceTranscript || result?.transcription || '';
  const diseaseClass      = result?.diseaseClass || result?.class || '';
  const diseaseNameAr     = result?.diseaseNameAr || result?.name_ar || '';
  const domain            = result?.domain || '';
  const secondaryClass    = result?.secondaryClass || result?.class_2nd || '';
  const secondaryNameAr   = result?.secondaryNameAr || result?.name_ar_2nd || '';
  const secondaryConf     = result?.secondaryConfidence || result?.conf_2nd || '';
  const clarifyingQs      = result?.clarifyingQuestions || result?.clarifying_questions || [];
  const topPredictions    = Array.isArray(result?.topPredictions)
    ? result.topPredictions
    : (Array.isArray(result?.top5) ? result.top5 : []);
  const multiConditions   = Array.isArray(result?.conditions) ? result.conditions : null;
  const oosMessage        = result?.outOfScopeMessage || result?.message_ar || '';

  // ── Branch 1: Out of scope ────────────────────────────────────────────
  if (ambiguityLevel === 'out_of_scope') {
    return (
      <div className="pd-ai-result-card pd-ai-result-card--triage">
        <div className="pd-ai-result-triage-header">
          <h3 className="pd-ai-result-title">نتيجة التحليل</h3>
          <SeverityBadge severity="low" />
        </div>

        <div className="pd-ai-result-info-banner" role="status">
          <ShieldAlert size={20} aria-hidden="true" />
          <div className="pd-ai-result-info-banner-text">
            <strong>خارج نطاق التحليل الطبي</strong>
            <p dir="auto">
              {oosMessage || assessment || 'هذا الموضوع خارج نطاق النظام الطبي.'}
            </p>
          </div>
        </div>

        {steps.length > 0 && (
          <div className="pd-ai-result-first-aid">
            <h4 className="pd-ai-result-subtitle">إرشادات</h4>
            <FirstAidSteps steps={steps} />
          </div>
        )}
      </div>
    );
  }

  // ── Branch 2: Low confidence image ────────────────────────────────────
  if (ambiguityLevel === 'low_confidence_image') {
    return (
      <div className="pd-ai-result-card pd-ai-result-card--triage">
        <div className="pd-ai-result-triage-header">
          <h3 className="pd-ai-result-title">نتيجة التحليل</h3>
          <SeverityBadge severity="low" />
        </div>

        <div className="pd-ai-result-info-banner" role="status">
          <ShieldAlert size={20} aria-hidden="true" />
          <div className="pd-ai-result-info-banner-text">
            <strong>جودة الصورة غير كافية</strong>
            <p dir="auto">
              {oosMessage || assessment || 'يرجى التقاط صورة أوضح وإعادة المحاولة.'}
            </p>
          </div>
        </div>

        {confidence > 0 && (
          <div className="pd-ai-result-confidence">
            <ConfidenceBar confidence={confidence} />
          </div>
        )}
      </div>
    );
  }

  // ── Branch 3: Multi-condition (multiple symptoms in text) ─────────────
  if (multiConditions && multiConditions.length > 0) {
    return (
      <div className="pd-ai-result-card pd-ai-result-card--triage">
        <div className="pd-ai-result-triage-header">
          <h3 className="pd-ai-result-title">نتيجة التحليل</h3>
          <SeverityBadge severity={riskLevel} />
        </div>

        <div className="pd-ai-result-multi-banner" role="status">
          <Layers size={20} aria-hidden="true" />
          <p>
            <strong>{multiConditions.length} حالات تم اكتشافها</strong>
            <span> — مرتبة حسب الأولوية</span>
          </p>
        </div>

        {assessment && (
          <p className="pd-ai-result-assessment" dir="auto">
            {assessment}
          </p>
        )}

        {isEmergency && (
          <div className="pd-ai-result-emergency-banner" role="alert">
            <AlertOctagon size={20} aria-hidden="true" />
            <p>
              <strong>حالة طارئة</strong>
              <span> — اتصل بالإسعاف فوراً</span>
            </p>
          </div>
        )}

        {voiceTranscript && (inputType === 'voice' || !inputType) && (
          <VoiceTranscriptionBlock transcript={voiceTranscript} />
        )}

        <div className="pd-ai-result-multi-list">
          {multiConditions.map((c, idx) => (
            <MultiConditionCard key={idx} condition={c} index={idx} />
          ))}
        </div>
      </div>
    );
  }

  // ── Branch 4: Single result (confident | uncertain | very_ambiguous) ──
  return (
    <div className="pd-ai-result-card pd-ai-result-card--triage">
      <div className="pd-ai-result-triage-header">
        <h3 className="pd-ai-result-title">نتيجة التحليل</h3>
        <SeverityBadge severity={riskLevel} />
      </div>

      <DiagnosisHeader
        diseaseNameAr={diseaseNameAr}
        diseaseClass={diseaseClass}
        domain={domain}
        confidence={confidence}
      />

      {voiceTranscript && (
        <VoiceTranscriptionBlock transcript={voiceTranscript} />
      )}

      {assessment && (
        <p className="pd-ai-result-assessment" dir="auto">
          <MessageSquareText
            size={14}
            aria-hidden="true"
            className="pd-ai-result-assessment-icon"
          />
          <span>{assessment}</span>
        </p>
      )}

      {isEmergency && (
        <div className="pd-ai-result-emergency-banner" role="alert">
          <AlertOctagon size={20} aria-hidden="true" />
          <p>
            <strong>حالة طارئة</strong>
            <span> — اتصل بالإسعاف فوراً</span>
          </p>
        </div>
      )}

      {steps.length > 0 && (
        <div className="pd-ai-result-first-aid">
          <h4 className="pd-ai-result-subtitle">خطوات الإسعاف الأولي</h4>
          <FirstAidSteps steps={steps} />
        </div>
      )}

      {confidence > 0 && (
        <div className="pd-ai-result-confidence">
          <ConfidenceBar confidence={confidence} />
        </div>
      )}

      <SecondaryDiagnosisCard
        secondaryNameAr={secondaryNameAr}
        secondaryClass={secondaryClass}
        secondaryConfidence={secondaryConf}
      />

      <ClarifyingQuestions questions={clarifyingQs} />

      <TopPredictionsAccordion
        predictions={topPredictions}
        summaryLabel="عرض الاحتمالات الأخرى"
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Public component
// ──────────────────────────────────────────────────────────────────────────

export default function ResultCard({
  variant,
  result,
  loading = false,
  error = null,
}) {
  if (loading) return <ResultCardSkeleton />;

  const errMessage = formatError(error);
  if (errMessage) return <ResultCardError message={errMessage} />;

  if (variant === 'empty' || !result) return <ResultCardEmpty />;
  if (variant === 'specialist')        return <ResultCardSpecialist result={result} />;
  if (variant === 'triage')            return <ResultCardTriage     result={result} />;

  // Unknown variant: degrade gracefully to empty.
  return <ResultCardEmpty />;
}