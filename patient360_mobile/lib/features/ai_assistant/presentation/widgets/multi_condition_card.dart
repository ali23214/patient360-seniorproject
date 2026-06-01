// ════════════════════════════════════════════════════════════════════════════
//  MultiConditionCard
//  ──────────────────────────────────────────────────────────────────────────
//  One card in the multi-condition triage response. Used when the AI
//  detects multiple symptoms in a single patient text and returns a
//  `conditions[]` array. Mirrors the web's `MultiConditionCard` sub-render
//  in ResultCard.jsx and the matching `.pd-ai-result-multi-card*` CSS
//  rules.
//
//  Visual layout (top to bottom):
//
//    ┌────────────────────────────────────────────────────────────┐
//    │ [N]  <DiagnosisHeader>           <SeverityBadge>           │
//    │                                                            │
//    │ [Optional inline emergency banner]                         │
//    │                                                            │
//    │ خطوات الإسعاف الأولي                                       │
//    │ <FirstAidSteps>                                            │
//    │                                                            │
//    │ <TopPredictionsAccordion (label = "أهم الاحتمالات")>       │
//    └────────────────────────────────────────────────────────────┘
//
//  When `condition.callAmbulance` is true the card gets a red-tinted
//  background + inline pulsing emergency banner. Otherwise it uses the
//  default neutral chrome.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/ai_condition.dart';
import 'diagnosis_header.dart';
import 'first_aid_steps.dart';
import 'severity_badge.dart';
import 'top_predictions_accordion.dart';

class MultiConditionCard extends StatelessWidget {
  const MultiConditionCard({
    super.key,
    required this.condition,
    required this.index,
  });

  /// The detected condition to render.
  final AiCondition condition;

  /// Zero-based position in the parent list; used to render the "N"
  /// circle badge in the header. Display value is `index + 1`.
  final int index;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final bool isDark = Theme.of(context).brightness == Brightness.dark;
    final bool isEmergency = condition.callAmbulance;

    // Card chrome — emergency variant gets a red-tinted background
    // and a darker red border to draw the eye.
    final Color bg = isEmergency
        ? const Color(0xFFFFEBEE)
        : (isDark ? AppColors.cardDark : AppColors.card);
    final Color borderColor =
        isEmergency ? const Color(0xFFFFCDD2) : scheme.outline;

    return Semantics(
      label: 'الحالة رقم ${index + 1}: ${condition.displayName}',
      container: true,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: AppRadii.radiusLg,
          border: Border.all(color: borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            // ── Header row: index + diagnosis + severity ────────────
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _IndexBadge(number: index + 1, isEmergency: isEmergency),
                const SizedBox(width: 12),
                Expanded(
                  child: DiagnosisHeader(
                    diseaseNameAr: condition.nameAr,
                    diseaseClass: condition.className,
                    domain: condition.domain,
                    confidence: condition.confidence,
                  ),
                ),
                const SizedBox(width: 8),
                SeverityBadge(level: condition.severity),
              ],
            ),

            // ── Optional inline emergency banner ─────────────────────
            if (isEmergency) ...<Widget>[
              const SizedBox(height: 12),
              const _InlineEmergencyBanner(),
            ],

            // ── First aid steps ─────────────────────────────────────
            if (condition.firstAidSteps.isNotEmpty) ...<Widget>[
              const SizedBox(height: 14),
              const _SectionLabel(text: 'خطوات الإسعاف الأولي'),
              const SizedBox(height: 8),
              FirstAidSteps(steps: condition.firstAidSteps),
            ],

            // ── Top-N predictions accordion ─────────────────────────
            if (condition.topPredictions.isNotEmpty) ...<Widget>[
              const SizedBox(height: 14),
              TopPredictionsAccordion(
                predictions: condition.topPredictions,
                summaryLabel: 'أهم الاحتمالات',
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Circular "N" badge shown at the start of each card's header
// ────────────────────────────────────────────────────────────────────────────

class _IndexBadge extends StatelessWidget {
  const _IndexBadge({required this.number, required this.isEmergency});

  final int number;
  final bool isEmergency;

  @override
  Widget build(BuildContext context) {
    final Color bg = isEmergency ? AppColors.error : AppColors.action;
    return Container(
      width: 32,
      height: 32,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
      child: Text(
        '$number',
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w800,
          color: Colors.white,
          fontFamily: 'Inter',
          height: 1.0,
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Inline emergency banner shown inside a condition card (not the same as
// the full-width pulsing banner in ResultCard's main triage variant).
// ────────────────────────────────────────────────────────────────────────────

class _InlineEmergencyBanner extends StatelessWidget {
  const _InlineEmergencyBanner();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'حالة طارئة، اتصل بالإسعاف فوراً',
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: const BoxDecoration(
          color: AppColors.error,
          borderRadius: AppRadii.radiusMd,
        ),
        child: const Row(
          children: <Widget>[
            Icon(LucideIcons.octagonAlert, size: 18, color: Colors.white),
            SizedBox(width: 10),
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
                  fontSize: 13,
                  color: Colors.white,
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

// ────────────────────────────────────────────────────────────────────────────
// Small uppercase action-color label above subsections
// ────────────────────────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w700,
        color: AppColors.action,
        letterSpacing: 0.4,
        fontFamily: 'Cairo',
      ),
    );
  }
}
