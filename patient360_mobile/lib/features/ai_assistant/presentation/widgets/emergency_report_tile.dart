import 'package:flutter/material.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/emergency_report.dart';
import 'severity_badge.dart';

/// Compact list row in the triage history. Tapping opens
/// [ReportDetailSheet] with the full content.
class EmergencyReportTile extends StatelessWidget {
  const EmergencyReportTile({
    required this.report,
    required this.onTap,
    super.key,
  });

  final EmergencyReport report;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final IconData typeIcon = _typeIcon(report.inputType);
    final List<String> previewSteps = report.aiFirstAid.take(2).toList();

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: InkWell(
        borderRadius: AppRadii.radiusLg,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: AppColors.action.withValues(alpha: 0.16),
                      borderRadius: AppRadii.radiusMd,
                    ),
                    alignment: Alignment.center,
                    child: Icon(typeIcon, size: 16, color: AppColors.action),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      intl.DateFormat('yyyy-MM-dd HH:mm')
                          .format(report.reportedAt),
                      textDirection: TextDirection.ltr,
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ),
                  SeverityBadge(level: report.aiRiskLevel),
                ],
              ),
              if (previewSteps.isNotEmpty) ...<Widget>[
                const SizedBox(height: 8),
                for (int i = 0; i < previewSteps.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          '${i + 1}. ',
                          textDirection: TextDirection.ltr,
                          style: TextStyle(
                            color: scheme.onSurfaceVariant,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                        Expanded(
                          child: Text(
                            previewSteps[i],
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: scheme.onSurface,
                              fontSize: 12,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  static IconData _typeIcon(String inputType) => switch (inputType) {
        'image' => LucideIcons.image,
        'voice' => LucideIcons.mic,
        'combined' => LucideIcons.sparkles,
        _ => LucideIcons.messageSquare,
      };
}
