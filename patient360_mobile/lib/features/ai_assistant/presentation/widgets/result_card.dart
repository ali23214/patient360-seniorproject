// ════════════════════════════════════════════════════════════════════════════
//  ResultCard
//  ──────────────────────────────────────────────────────────────────────────
//  Variant-driven card displaying AI emergency triage output. Mirrors the
//  web's `frontend/src/components/ai/ResultCard.jsx` 1:1, including the
//  full set of FastAPI `ambiguity_level` branches.
//
//  Constructors:
//    .loading()                              → 3 shimmer rows
//    .error({required Object error})         → red banner + message
//    .empty({String? title, String? sub})    → sparkles icon + invitation
//    .triage({required EmergencyReport})     → 4-branch rich display
//
//  ─── 4-BRANCH ROUTING (matches the web) ──────────────────────────────
//
//  When the .triage variant is used, the card picks ONE of four layouts
//  based on the report's `ambiguityLevel` and `conditions` array:
//
//    1. out_of_scope         → InfoBanner with shield icon + first-aid
//       Trigger: report.isOutOfScope
//       Use case: AI says the symptom is outside the medical scope
//
//    2. low_confidence_image → InfoBanner + retry suggestion + confidence
//       Trigger: report.isLowConfidenceImage
//       Use case: uploaded image is too blurry / dark / non-medical
//
//    3. multi                → MultiBanner + stacked MultiConditionCard
//       Trigger: report.isMulti  (conditions[] is non-empty)
//       Use case: AI detected multiple symptoms in one text submission
//
//    4. single result        → Full diagnostic layout (default)
//       Trigger: anything else (confident, uncertain, very_ambiguous,
//                or no ambiguityLevel at all — legacy reports)
//       Use case: One primary diagnosis with optional secondary + clarifying
//
//  Backward compatibility: every new field on EmergencyReport is nullable
//  or empty-defaulted, so legacy reports loaded from the database (with
//  only the original 7 fields) still render the single-result branch.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/ai_condition.dart';
import '../../domain/emergency_report.dart';
import 'clarifying_questions_list.dart';
import 'confidence_bar.dart';
import 'diagnosis_header.dart';
import 'empty_state.dart';
import 'first_aid_steps.dart';
import 'info_banner.dart';
import 'multi_banner.dart';
import 'multi_condition_card.dart';
import 'secondary_diagnosis_card.dart';
import 'severity_badge.dart';
import 'top_predictions_accordion.dart';
import 'voice_transcript_block.dart';

enum _CardVariant { loading, error, empty, triage }

class ResultCard extends StatelessWidget {
  // ── Public constructors ────────────────────────────────────────────────

  const ResultCard.loading({super.key})
    : _variant = _CardVariant.loading,
      _error = null,
      _emptyTitle = null,
      _emptySubtitle = null,
      _report = null;

  const ResultCard.error({super.key, required Object error})
    : _variant = _CardVariant.error,
      _error = error,
      _emptyTitle = null,
      _emptySubtitle = null,
      _report = null;

  const ResultCard.empty({super.key, String? emptyTitle, String? emptySubtitle})
    : _variant = _CardVariant.empty,
      _error = null,
      _emptyTitle = emptyTitle,
      _emptySubtitle = emptySubtitle,
      _report = null;

  const ResultCard.triage({super.key, required EmergencyReport report})
    : _variant = _CardVariant.triage,
      _error = null,
      _emptyTitle = null,
      _emptySubtitle = null,
      _report = report;

  final _CardVariant _variant;
  final Object? _error;
  final String? _emptyTitle;
  final String? _emptySubtitle;
  final EmergencyReport? _report;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    // The error variant has its own background; everything else renders
    // inside the standard card chrome.
    final bool selfStyled = _variant == _CardVariant.error;

    final Widget child = switch (_variant) {
      _CardVariant.loading => const _LoadingBody(),
      _CardVariant.error => _ErrorBody(error: _error!),
      _CardVariant.empty => _EmptyBody(
        title: _emptyTitle ?? 'ابدأ التحليل',
        subtitle:
            _emptySubtitle ??
            'أدخل أعراضك أو ارفع صورة طبية لبدء الاستشارة الذكية.',
      ),
      _CardVariant.triage => _TriageBody(report: _report!),
    };

    if (selfStyled) return child;

    return Container(
      constraints: const BoxConstraints(minHeight: 200),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: child,
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Loading skeleton — 3 shimmer rows at 70% / 90% / 60% width
// ════════════════════════════════════════════════════════════════════════════

class _LoadingBody extends StatefulWidget {
  const _LoadingBody();

  @override
  State<_LoadingBody> createState() => _LoadingBodyState();
}

class _LoadingBodyState extends State<_LoadingBody>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctl;

  @override
  void initState() {
    super.initState();
    _ctl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'جاري التحليل',
      liveRegion: true,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _shimmerRow(0.70),
          const SizedBox(height: 12),
          _shimmerRow(0.90),
          const SizedBox(height: 12),
          _shimmerRow(0.60),
        ],
      ),
    );
  }

  Widget _shimmerRow(double widthFactor) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return FractionallySizedBox(
      widthFactor: widthFactor,
      child: AnimatedBuilder(
        animation: _ctl,
        builder: (BuildContext _, Widget? __) {
          final double t = _ctl.value;
          return Container(
            height: 20,
            decoration: BoxDecoration(
              borderRadius: AppRadii.radiusSm,
              gradient: LinearGradient(
                begin: Alignment(-1 + 2 * t - 0.5, 0),
                end: Alignment(-1 + 2 * t + 0.5, 0),
                colors: <Color>[
                  scheme.surfaceContainerHighest,
                  scheme.surfaceContainer,
                  scheme.surfaceContainerHighest,
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Error state
// ════════════════════════════════════════════════════════════════════════════

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.error});

  final Object error;

  String _format(Object e) {
    if (e is String) return e;
    final String s = e.toString().replaceAll('Exception: ', '').trim();
    if (s.isEmpty) return 'حدث خطأ أثناء التحليل';
    return s;
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'خطأ',
      liveRegion: true,
      child: Container(
        constraints: const BoxConstraints(minHeight: 100),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xFFFFEBEE),
          borderRadius: AppRadii.radiusLg,
          border: Border.all(color: const Color(0xFFFFCDD2)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Icon(
              LucideIcons.circleAlert,
              size: 28,
              color: AppColors.error,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                _format(error),
                style: const TextStyle(
                  fontSize: 14,
                  height: 1.5,
                  color: AppColors.error,
                  fontFamily: 'Cairo',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Empty state — wraps the shared EmptyState atom with the Sparkles icon
// ════════════════════════════════════════════════════════════════════════════

class _EmptyBody extends StatelessWidget {
  const _EmptyBody({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return EmptyState(
      icon: LucideIcons.sparkles,
      title: title,
      subtitle: subtitle,
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Triage variant — 4-branch router
// ════════════════════════════════════════════════════════════════════════════

class _TriageBody extends StatelessWidget {
  const _TriageBody({required this.report});

  final EmergencyReport report;

  @override
  Widget build(BuildContext context) {
    // ── Branch 1: Out of scope ─────────────────────────────────────────
    if (report.isOutOfScope) {
      return _OutOfScopeBranch(report: report);
    }

    // ── Branch 2: Low confidence image ─────────────────────────────────
    if (report.isLowConfidenceImage) {
      return _LowConfidenceImageBranch(report: report);
    }

    // ── Branch 3: Multi-condition ──────────────────────────────────────
    if (report.isMulti) {
      return _MultiConditionBranch(report: report);
    }

    // ── Branch 4: Single result (default) ──────────────────────────────
    return _SingleResultBranch(report: report);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Branch 1: out_of_scope — symptom outside the medical scope
// ────────────────────────────────────────────────────────────────────────────

class _OutOfScopeBranch extends StatelessWidget {
  const _OutOfScopeBranch({required this.report});

  final EmergencyReport report;

  @override
  Widget build(BuildContext context) {
    final String message = (report.outOfScopeMessage?.trim().isNotEmpty == true)
        ? report.outOfScopeMessage!
        : (report.aiAssessment?.trim().isNotEmpty == true
              ? report.aiAssessment!
              : 'هذا الموضوع خارج نطاق النظام الطبي.');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _TriageHeader(report: report),
        const SizedBox(height: 16),
        InfoBanner(
          icon: LucideIcons.shieldAlert,
          title: 'خارج نطاق التحليل الطبي',
          body: message,
        ),
        if (report.aiFirstAid.isNotEmpty) ...<Widget>[
          const SizedBox(height: 16),
          const _SectionLabel(text: 'إرشادات'),
          const SizedBox(height: 8),
          FirstAidSteps(steps: report.aiFirstAid),
        ],
      ],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Branch 2: low_confidence_image — image was too blurry / non-medical
// ────────────────────────────────────────────────────────────────────────────

class _LowConfidenceImageBranch extends StatelessWidget {
  const _LowConfidenceImageBranch({required this.report});

  final EmergencyReport report;

  @override
  Widget build(BuildContext context) {
    final String message = (report.outOfScopeMessage?.trim().isNotEmpty == true)
        ? report.outOfScopeMessage!
        : (report.aiAssessment?.trim().isNotEmpty == true
              ? report.aiAssessment!
              : 'يرجى التقاط صورة أوضح وإعادة المحاولة.');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _TriageHeader(report: report),
        const SizedBox(height: 16),
        InfoBanner(
          icon: LucideIcons.imageOff,
          title: 'جودة الصورة غير كافية',
          body: message,
        ),
        if ((report.aiConfidence ?? 0) > 0) ...<Widget>[
          const SizedBox(height: 16),
          ConfidenceBar(confidence: report.aiConfidence!),
        ],
      ],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Branch 3: multi — multiple symptoms detected in a single text
// ────────────────────────────────────────────────────────────────────────────

class _MultiConditionBranch extends StatelessWidget {
  const _MultiConditionBranch({required this.report});

  final EmergencyReport report;

  @override
  Widget build(BuildContext context) {
    final List<AiCondition> conditions = report.conditions;
    final bool isEmergency = report.recommendAmbulance ?? false;
    final String? assessment = report.aiAssessment;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _TriageHeader(report: report),
        const SizedBox(height: 16),
        MultiBanner(count: conditions.length),
        if (assessment != null && assessment.trim().isNotEmpty) ...<Widget>[
          const SizedBox(height: 12),
          _AssessmentText(text: assessment),
        ],
        if (isEmergency) ...<Widget>[
          const SizedBox(height: 12),
          const _EmergencyBanner(),
        ],
        // Only surface the voice-transcript block when the patient
        // actually submitted a voice note — never echo `textDescription`
        // back as a "transcript".
        if (_isVoiceInput(report) &&
            report.voiceTranscript != null &&
            report.voiceTranscript!.trim().isNotEmpty) ...<Widget>[
          const SizedBox(height: 12),
          VoiceTranscriptBlock(transcript: report.voiceTranscript),
        ],
        const SizedBox(height: 16),
        // Stacked condition cards — one per detected condition.
        for (int i = 0; i < conditions.length; i++) ...<Widget>[
          if (i > 0) const SizedBox(height: 12),
          MultiConditionCard(condition: conditions[i], index: i),
        ],
      ],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Branch 4: single — primary diagnosis with optional supplementary blocks
// ────────────────────────────────────────────────────────────────────────────

class _SingleResultBranch extends StatelessWidget {
  const _SingleResultBranch({required this.report});

  final EmergencyReport report;

  @override
  Widget build(BuildContext context) {
    final bool isEmergency = report.recommendAmbulance ?? false;
    final double confidence = report.aiConfidence ?? 0.0;
    final String? assessment = report.aiAssessment;
    final List<String> steps = List<String>.from(report.aiFirstAid);

    // Whether any enriched field has content — drives whether we render
    // the diagnosis header at all.
    final bool hasDiagnosisInfo =
        (report.diseaseNameAr?.trim().isNotEmpty == true) ||
        (report.diseaseClass?.trim().isNotEmpty == true) ||
        (report.domain?.trim().isNotEmpty == true);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        // ── Header: title + severity badge ──────────────────────────
        _TriageHeader(report: report),

        // ── Diagnosis header (name + domain badge + confidence chip) ─
        if (hasDiagnosisInfo) ...<Widget>[
          const SizedBox(height: 16),
          DiagnosisHeader(
            diseaseNameAr: report.diseaseNameAr,
            diseaseClass: report.diseaseClass,
            domain: report.domain,
            confidence: report.aiConfidence,
          ),
        ],

        // ── Voice transcript (only when input was actually voice) ────
        // The backend sometimes echoes `textDescription` back into the
        // `voiceTranscript` field. Guard with the input mode so we only
        // ever show this block when the patient really submitted audio.
        if (_isVoiceInput(report) &&
            report.voiceTranscript != null &&
            report.voiceTranscript!.trim().isNotEmpty) ...<Widget>[
          const SizedBox(height: 12),
          VoiceTranscriptBlock(transcript: report.voiceTranscript),
        ],

        // ── Clinical assessment paragraph ────────────────────────────
        if (assessment != null && assessment.trim().isNotEmpty) ...<Widget>[
          const SizedBox(height: 16),
          _AssessmentText(text: assessment),
        ],

        // ── Emergency banner ─────────────────────────────────────────
        if (isEmergency) ...<Widget>[
          const SizedBox(height: 16),
          const _EmergencyBanner(),
        ],

        // ── First aid steps ─────────────────────────────────────────
        if (steps.isNotEmpty) ...<Widget>[
          const SizedBox(height: 16),
          const _SectionLabel(text: 'خطوات الإسعاف الأولي'),
          const SizedBox(height: 8),
          FirstAidSteps(steps: steps),
        ],

        // ── Confidence bar (only when confidence is real) ────────────
        if (confidence > 0) ...<Widget>[
          const SizedBox(height: 16),
          ConfidenceBar(confidence: confidence),
        ],

        // ── Secondary diagnosis (uncertain / very_ambiguous) ─────────
        if (_hasSecondaryDiagnosis(report)) ...<Widget>[
          const SizedBox(height: 16),
          SecondaryDiagnosisCard(
            secondaryNameAr: report.secondaryNameAr,
            secondaryClass: report.secondaryClass,
            secondaryConfidence: report.secondaryConfidence,
          ),
        ],

        // ── Clarifying questions (uncertain / very_ambiguous) ────────
        if (report.clarifyingQuestions.isNotEmpty) ...<Widget>[
          const SizedBox(height: 12),
          ClarifyingQuestionsList(questions: report.clarifyingQuestions),
        ],

        // ── Top-N predictions accordion ──────────────────────────────
        if (report.topPredictions.isNotEmpty) ...<Widget>[
          const SizedBox(height: 12),
          TopPredictionsAccordion(predictions: report.topPredictions),
        ],
      ],
    );
  }

  /// Decides whether the SecondaryDiagnosisCard has anything worth
  /// rendering — must have at least a name or class.
  static bool _hasSecondaryDiagnosis(EmergencyReport r) {
    return (r.secondaryNameAr?.trim().isNotEmpty == true) ||
        (r.secondaryClass?.trim().isNotEmpty == true);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Shared sub-widgets used by every triage branch
// ════════════════════════════════════════════════════════════════════════════

/// True iff the report was submitted as a voice note. Accepts both the
/// pure-voice mode and the `combined` mode (voice + text). Anything else
/// — including legacy reports with no `inputType` — is treated as a
/// non-voice submission so we never echo the patient's typed text back
/// as a fake "transcript".
bool _isVoiceInput(EmergencyReport report) {
  final String t = report.inputType.toLowerCase();
  return t == 'voice' || t == 'combined';
}

/// "نتيجة التحليل" title + severity badge separated by a divider.
class _TriageHeader extends StatelessWidget {
  const _TriageHeader({required this.report});

  final EmergencyReport report;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  'نتيجة التحليل',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: scheme.primary,
                    fontFamily: 'Cairo',
                  ),
                ),
              ),
              SeverityBadge(level: report.aiRiskLevel),
            ],
          ),
        ),
        Container(height: 1, color: scheme.outline),
      ],
    );
  }
}

/// Clinical assessment prose with a small accent icon.
class _AssessmentText extends StatelessWidget {
  const _AssessmentText({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Icon(
            LucideIcons.messageSquareText,
            size: 14,
            color: scheme.secondary,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 14,
              height: 1.7,
              color: scheme.onSurface,
              fontFamily: 'Cairo',
            ),
          ),
        ),
      ],
    );
  }
}

/// Pulsing red emergency banner with the same 1.5s timing as the web's
/// `pd-pulse-critical` CSS keyframe.
class _EmergencyBanner extends StatefulWidget {
  const _EmergencyBanner();

  @override
  State<_EmergencyBanner> createState() => _EmergencyBannerState();
}

class _EmergencyBannerState extends State<_EmergencyBanner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctl;

  @override
  void initState() {
    super.initState();
    _ctl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'حالة طارئة، اتصل بالإسعاف فوراً',
      liveRegion: true,
      child: AnimatedBuilder(
        animation: _ctl,
        builder: (BuildContext _, Widget? __) {
          final double t = _ctl.value;
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.error,
              borderRadius: AppRadii.radiusMd,
              boxShadow: <BoxShadow>[
                BoxShadow(
                  color: AppColors.error.withValues(alpha: (1 - t) * 0.5),
                  spreadRadius: 6 * t,
                ),
              ],
            ),
            child: const Row(
              children: <Widget>[
                Icon(LucideIcons.octagonAlert, size: 20, color: Colors.white),
                SizedBox(width: 12),
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      children: <InlineSpan>[
                        TextSpan(
                          text: 'حالة طارئة',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                        TextSpan(text: ' — اتصل بالإسعاف فوراً'),
                      ],
                    ),
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.white,
                      fontFamily: 'Cairo',
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Small uppercase action-color label above subsections.
class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w700,
        color: AppColors.action,
        letterSpacing: 0.4,
        fontFamily: 'Cairo',
      ),
    );
  }
}
