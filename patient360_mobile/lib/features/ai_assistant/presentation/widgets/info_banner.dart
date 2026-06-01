// ════════════════════════════════════════════════════════════════════════════
//  InfoBanner
//  ──────────────────────────────────────────────────────────────────────────
//  Blue-toned informational banner used by the `out_of_scope` and
//  `low_confidence_image` branches of the emergency triage ResultCard.
//
//  Flutter does not allow `borderRadius` together with a `Border` whose
//  sides have different colors, so we render the accent stripe as a thin
//  Container child instead of through `Border.left`.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';

class InfoBanner extends StatelessWidget {
  const InfoBanner({
    super.key,
    required this.title,
    required this.body,
    this.icon = LucideIcons.shieldAlert,
  });

  /// Bold heading (e.g. "خارج نطاق التحليل الطبي").
  final String title;

  /// Paragraph body explaining the situation.
  final String body;

  /// Lucide icon shown to the left of the title.
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: title,
      hint: body,
      liveRegion: true,
      child: ClipRRect(
        borderRadius: AppRadii.radiusMd,
        child: Container(
          decoration: const BoxDecoration(
            color: AppColors.surface,
            border: Border.fromBorderSide(BorderSide(color: AppColors.border)),
          ),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                // ── Accent stripe rendered as a sibling, NOT a border side ─
                Container(width: 4, color: AppColors.action),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Icon(icon, size: 20, color: AppColors.action),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Text(
                                title,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.primary,
                                  fontFamily: 'Cairo',
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                body,
                                style: const TextStyle(
                                  fontSize: 13,
                                  height: 1.6,
                                  color: AppColors.textSecondary,
                                  fontFamily: 'Cairo',
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
