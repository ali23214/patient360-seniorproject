// ════════════════════════════════════════════════════════════════════════════
//  MultiBanner
//  ──────────────────────────────────────────────────────────────────────────
//  Informational banner shown above the stack of MultiConditionCard items
//  when the AI detects multiple symptoms in a single patient text.
//  Mirrors the web's `.pd-ai-result-multi-banner` rule.
//
//  Visual:
//    • Teal-tinted background with action-color icon
//    • "<N> حالات تم اكتشافها — مرتبة حسب الأولوية"
//    • Bold count, dimmer suffix
//
//  Arabic plural handling — kept identical to the web's `${count} حالات`
//  rendering. Strict Arabic plural rules would require special-casing 1,
//  2, 3-10, 11+, but the web has decided to use the simple plural
//  everywhere for predictability. We follow suit.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';

class MultiBanner extends StatelessWidget {
  const MultiBanner({super.key, required this.count});

  /// Number of detected conditions. Drives the bold portion of the
  /// banner copy.
  final int count;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$count حالات تم اكتشافها، مرتبة حسب الأولوية',
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: AppRadii.radiusMd,
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: <Widget>[
            const Icon(LucideIcons.layers, size: 20, color: AppColors.action),
            const SizedBox(width: 12),
            Expanded(
              child: Text.rich(
                TextSpan(
                  children: <InlineSpan>[
                    TextSpan(
                      text: '$count حالات تم اكتشافها',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: AppColors.primary,
                      ),
                    ),
                    const TextSpan(text: ' — مرتبة حسب الأولوية'),
                  ],
                ),
                style: const TextStyle(
                  fontSize: 14,
                  height: 1.4,
                  color: AppColors.textSecondary,
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
