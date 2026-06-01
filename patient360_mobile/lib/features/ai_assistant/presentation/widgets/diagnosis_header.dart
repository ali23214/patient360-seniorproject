// ════════════════════════════════════════════════════════════════════════════
//  DiagnosisHeader
//  ──────────────────────────────────────────────────────────────────────────
//  Compact header showing the AI's primary diagnosis: Arabic name + the
//  English class hint + a domain badge + an optional confidence chip.
//  Used at the top of the single-result triage branch and inside each
//  MultiConditionCard. Mirrors the web's `DiagnosisHeader` sub-render
//  in ResultCard.jsx and the matching `.pd-ai-result-diagnosis*` CSS
//  rules.
//
//  Visual layout:
//
//    ┌──────────────────────────────────────────────────────────┐
//    │ <Arabic disease name, h4>                                │
//    │ <English class hint, secondary, small>                   │
//    │                                                          │
//    │ [Domain Badge]   ◯ دقة 85.3%                            │
//    └──────────────────────────────────────────────────────────┘
//
//  Auto-hides when neither name nor domain is available so callers can
//  drop it directly into layouts.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/ai_prediction.dart' show humanizeClass, formatPercentage;
import 'domain_badge.dart';

class DiagnosisHeader extends StatelessWidget {
  const DiagnosisHeader({
    super.key,
    this.diseaseNameAr,
    this.diseaseClass,
    this.domain,
    this.confidence,
  });

  /// Arabic localized name, e.g. `"نوبة قلبية"`. Takes display priority.
  final String? diseaseNameAr;

  /// Backend class label, e.g. `"Heart_Attack"`. Used as fallback when
  /// no Arabic name is available, or as a small English hint underneath
  /// the Arabic name.
  final String? diseaseClass;

  /// Domain string (`emergency` / `wound` / `eye` / `medical`) passed
  /// through to [DomainBadge].
  final String? domain;

  /// Normalized 0..1 confidence. When present, surfaces as a small
  /// chip "دقة 85.3%".
  final double? confidence;

  @override
  Widget build(BuildContext context) {
    final String trimmedAr = diseaseNameAr?.trim() ?? '';
    final String classHumanized = humanizeClass(diseaseClass);

    final String displayName =
        trimmedAr.isNotEmpty ? trimmedAr : classHumanized;
    // English hint only makes sense when we ALSO have an Arabic name
    // (otherwise the humanized class is already the main display).
    final String englishHint =
        trimmedAr.isNotEmpty && classHumanized.isNotEmpty ? classHumanized : '';

    final bool hasDomain = (domain ?? '').trim().isNotEmpty;
    if (displayName.isEmpty && !hasDomain) {
      return const SizedBox.shrink();
    }

    final ColorScheme scheme = Theme.of(context).colorScheme;
    final String? pct =
        confidence != null && confidence! > 0
            ? formatPercentage(confidence)
            : null;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (displayName.isNotEmpty)
            Text(
              displayName,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: scheme.primary,
                fontFamily: 'Cairo',
                height: 1.3,
              ),
            ),
          if (englishHint.isNotEmpty) ...<Widget>[
            const SizedBox(height: 2),
            Text(
              englishHint,
              textDirection: TextDirection.ltr,
              style: TextStyle(
                fontSize: 12,
                color: scheme.onSurfaceVariant,
                fontFamily: 'Inter',
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
          if (hasDomain || pct != null) ...<Widget>[
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: <Widget>[
                if (hasDomain) DomainBadge(domain: domain),
                if (pct != null) _ConfidenceChip(percentage: pct),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Small chip rendering "دقة <pct>%"
// ────────────────────────────────────────────────────────────────────────────

class _ConfidenceChip extends StatelessWidget {
  const _ConfidenceChip({required this.percentage});

  final String percentage;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFE0F7F4),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Text(
            'دقة',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppColors.action,
              fontFamily: 'Cairo',
              height: 1.0,
            ),
          ),
          const SizedBox(width: 5),
          Text(
            percentage,
            textDirection: TextDirection.ltr,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: AppColors.primary,
              fontFamily: 'Inter',
              height: 1.0,
            ),
          ),
        ],
      ),
    );
  }
}
