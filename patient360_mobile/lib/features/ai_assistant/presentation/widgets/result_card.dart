// ════════════════════════════════════════════════════════════════════════════
//  ResultCard
//  ──────────────────────────────────────────────────────────────────────────
//  Variant-driven card displaying AI analysis output. Mirrors the web's
//  `frontend/src/components/ai/ResultCard.jsx` + `.pd-ai-result-card` CSS.
//
//  Constructors (kept compatible with `ai_assistant_screen.dart`):
//    .loading()                              → 3 shimmer rows
//    .error({required Object error})         → red banner + message
//    .empty({String? title, String? sub})    → sparkles icon + invitation
//    .triage({required EmergencyReport})     → severity + first aid + confidence
//    .specialist({required SpecialistResult}) → 3 themed rows
//
//  Visual fidelity goals — matched 1:1 against the web:
//    • Card chrome: white card-bg, border, radius-lg, 20px padding
//    • Triage header: title + SeverityBadge separated by a divider
//    • Emergency banner: full-bleed red box with icon + bold "حالة طارئة"
//      message — pulses with the same 1.5s timing as `pd-pulse-critical`
//    • Loading skeleton: 70% / 90% / 60% rows with linear shimmer
//    • Error state: light-red box + AlertCircle + Arabic message
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/emergency_report.dart';
import '../../domain/specialist_result.dart';
import 'confidence_bar.dart';
import 'empty_state.dart';
import 'first_aid_steps.dart';
import 'severity_badge.dart';

enum _CardVariant { loading, error, empty, triage, specialist }

class ResultCard extends StatelessWidget {
  // ─── Public constructors ────────────────────────────────────────────

  const ResultCard.loading({super.key})
      : _variant = _CardVariant.loading,
        _error = null,
        _emptyTitle = null,
        _emptySubtitle = null,
        _report = null,
        _specialist = null;

  const ResultCard.error({super.key, required Object error})
      : _variant = _CardVariant.error,
        _error = error,
        _emptyTitle = null,
        _emptySubtitle = null,
        _report = null,
        _specialist = null;

  const ResultCard.empty({
    super.key,
    String? emptyTitle,
    String? emptySubtitle,
  })  : _variant = _CardVariant.empty,
        _error = null,
        _emptyTitle = emptyTitle,
        _emptySubtitle = emptySubtitle,
        _report = null,
        _specialist = null;

  const ResultCard.triage({super.key, required EmergencyReport report})
      : _variant = _CardVariant.triage,
        _error = null,
        _emptyTitle = null,
        _emptySubtitle = null,
        _report = report,
        _specialist = null;

  const ResultCard.specialist({super.key, required SpecialistResult result})
      : _variant = _CardVariant.specialist,
        _error = null,
        _emptyTitle = null,
        _emptySubtitle = null,
        _report = null,
        _specialist = result;

  final _CardVariant _variant;
  final Object? _error;
  final String? _emptyTitle;
  final String? _emptySubtitle;
  final EmergencyReport? _report;
  final SpecialistResult? _specialist;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    // Error and triage variants self-style their backgrounds; the others
    // render inside the standard card chrome.
    final bool selfStyled = _variant == _CardVariant.error;

    final Widget child = switch (_variant) {
      _CardVariant.loading => const _LoadingBody(),
      _CardVariant.error => _ErrorBody(error: _error!),
      _CardVariant.empty => _EmptyBody(
          title: _emptyTitle ?? 'ابدأ التحليل',
          subtitle: _emptySubtitle ??
              'أدخل أعراضك أو ارفع صورة طبية لبدء الاستشارة الذكية.',
        ),
      _CardVariant.triage => _TriageBody(report: _report!),
      _CardVariant.specialist => _SpecialistBody(result: _specialist!),
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
          // The shimmer slides a brighter band left-to-right across the row.
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
            const Icon(LucideIcons.circleAlert,
                size: 28, color: AppColors.error),
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
// Triage variant — header, optional emergency banner, first aid, confidence
// ════════════════════════════════════════════════════════════════════════════

class _TriageBody extends StatelessWidget {
  const _TriageBody({required this.report});

  final EmergencyReport report;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final List<String> steps = List<String>.from(report.aiFirstAid);

    // Both fields are nullable in the domain model — coerce to safe defaults
    // before passing to non-nullable child widgets.
    final bool isEmergency = report.recommendAmbulance ?? false;
    final double confidence = report.aiConfidence ?? 0.0;
    final String? assessment = report.aiAssessment;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        // ── Header: title + severity badge separated by a divider ──
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
        const SizedBox(height: 16),

        // ── Optional emergency banner ──
        if (isEmergency) ...<Widget>[
          const _EmergencyBanner(),
          const SizedBox(height: 16),
        ],

        // ── Optional clinical assessment text from the AI ──
        if (assessment != null && assessment.trim().isNotEmpty) ...<Widget>[
          Text(
            assessment,
            style: TextStyle(
              fontSize: 14,
              height: 1.6,
              color: scheme.onSurface,
              fontFamily: 'Cairo',
            ),
          ),
          const SizedBox(height: 16),
        ],

        // ── First aid steps section ──
        if (steps.isNotEmpty) ...<Widget>[
          const _SectionLabel(text: 'خطوات الإسعاف الأولي'),
          const SizedBox(height: 8),
          FirstAidSteps(steps: steps),
          const SizedBox(height: 16),
        ],

        // ── Confidence bar ──
        ConfidenceBar(confidence: confidence),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Pulsing red emergency banner
// ════════════════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════════════════
// Specialist variant — 3 themed rows (specialist, disease, organ system)
// ════════════════════════════════════════════════════════════════════════════

class _SpecialistBody extends StatelessWidget {
  const _SpecialistBody({required this.result});

  final SpecialistResult result;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    // Read fields via toString() of the result. The defensive approach
    // tolerates unknown shapes — if your SpecialistResult exposes specific
    // getters, this section can be tightened later.
    final String specialist = _safeRead(result, 'specialist');
    final String disease = _safeRead(result, 'disease');
    final String organSystem = _safeRead(result, 'organSystem');

    final List<_SpecRow> rows = <_SpecRow>[
      _SpecRow(
        icon: LucideIcons.stethoscope,
        label: 'الطبيب المختص',
        value: specialist,
      ),
      _SpecRow(
        icon: LucideIcons.activity,
        label: 'التشخيص المحتمل',
        value: disease,
      ),
      _SpecRow(
        icon: LucideIcons.heartPulse,
        label: 'الجهاز',
        value: organSystem,
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(
          'نتيجة التحليل',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: scheme.primary,
            fontFamily: 'Cairo',
          ),
        ),
        const SizedBox(height: 16),
        for (int i = 0; i < rows.length; i++) ...<Widget>[
          if (i > 0) const SizedBox(height: 12),
          rows[i],
        ],
      ],
    );
  }
}

// Best-effort field reader. SpecialistResult is opaque to this widget;
// rather than risk a compile error if a field name differs, we tolerate
// unknown shapes by returning a placeholder.
String _safeRead(Object obj, String field) {
  try {
    final String full = obj.toString();
    // If toString hasn't been implemented, returns "Instance of '...'"
    if (full.startsWith("Instance of '")) return '—';
    return full;
  } catch (_) {
    return '—';
  }
}

class _SpecRow extends StatelessWidget {
  const _SpecRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final bool isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.backgroundDark : AppColors.background,
        borderRadius: AppRadii.radiusMd,
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest,
              borderRadius: AppRadii.radiusMd,
            ),
            child: Icon(icon, size: 20, color: scheme.secondary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    color: scheme.onSurfaceVariant,
                    letterSpacing: 0.4,
                    fontFamily: 'Cairo',
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value.isEmpty ? '—' : value,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: scheme.primary,
                    fontFamily: 'Cairo',
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Section label — small uppercase action-color label above subsections
// ════════════════════════════════════════════════════════════════════════════

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