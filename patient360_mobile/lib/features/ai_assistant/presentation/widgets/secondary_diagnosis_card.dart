// ════════════════════════════════════════════════════════════════════════════
//  SecondaryDiagnosisCard
//  ──────────────────────────────────────────────────────────────────────────
//  Renders the alternate (2nd-place) diagnosis the AI considered.
//  Used only for the `uncertain` / `very_ambiguous` branches when the
//  primary confidence is low enough that the runner-up is worth showing.
//  Mirrors the web's `SecondaryDiagnosisCard` sub-render in
//  ResultCard.jsx and the matching `.pd-ai-result-secondary*` CSS rules.
//
//  Visual:
//    • Section header with ChevronsRight icon: "تشخيص بديل محتمل"
//    • Body row: diagnosis name (RTL) + optional confidence percentage
//
//  Auto-hides when the input has neither name nor class.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/ai_prediction.dart' show humanizeClass, formatPercentage;

class SecondaryDiagnosisCard extends StatelessWidget {
  const SecondaryDiagnosisCard({
    super.key,
    this.secondaryNameAr,
    this.secondaryClass,
    this.secondaryConfidence,
  });

  /// Arabic localized name of the alternate diagnosis.
  final String? secondaryNameAr;

  /// Backend class label of the alternate (e.g. `"Pneumonia"`). Used as
  /// the display fallback when no Arabic name is available.
  final String? secondaryClass;

  /// Normalized 0..1 confidence of the alternate. Displayed as a
  /// percentage chip when present.
  final double? secondaryConfidence;

  @override
  Widget build(BuildContext context) {
    // Decide the visible display name; bail out entirely if we have
    // nothing useful to show.
    final String display = secondaryNameAr?.trim().isNotEmpty == true
        ? secondaryNameAr!.trim()
        : humanizeClass(secondaryClass);
    if (display.isEmpty) return const SizedBox.shrink();

    final ColorScheme scheme = Theme.of(context).colorScheme;
    final bool isDark = Theme.of(context).brightness == Brightness.dark;
    final String? pct =
        secondaryConfidence != null ? formatPercentage(secondaryConfidence) : null;

    return Semantics(
      label: 'تشخيص بديل محتمل: $display',
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isDark ? AppColors.backgroundDark : AppColors.background,
          borderRadius: AppRadii.radiusMd,
          border: Border.all(color: scheme.outline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            // ── Section header ──────────────────────────────────────
            Row(
              children: <Widget>[
                Icon(
                  LucideIcons.chevronsLeft,
                  size: 16,
                  color: scheme.secondary,
                ),
                const SizedBox(width: 8),
                Text(
                  'تشخيص بديل محتمل',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: scheme.primary,
                    letterSpacing: 0.3,
                    fontFamily: 'Cairo',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            // ── Name + optional confidence chip ────────────────────
            Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    display,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: scheme.onSurface,
                      fontFamily: 'Cairo',
                    ),
                  ),
                ),
                if (pct != null) ...<Widget>[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Text(
                      pct,
                      textDirection: TextDirection.ltr,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.action,
                        fontFamily: 'Inter',
                        height: 1.0,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
