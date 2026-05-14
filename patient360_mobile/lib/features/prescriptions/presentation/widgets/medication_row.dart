import 'package:flutter/material.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/localization/arabic_labels.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/medication_item.dart';

/// One line in the medications list inside an expanded prescription card.
/// Renders a circle/check leading icon, the drug name, the
/// "dosage • frequency • duration" line, an optional instructions box,
/// and (when dispensed) the dispensedAt timestamp.
class MedicationRow extends StatelessWidget {
  const MedicationRow({required this.med, super.key});

  final MedicationItem med;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;
    final String routeLabel = ArabicLabels.lookup(
      ArabicLabels.medicationRoute,
      med.route,
    );
    final List<String> meta = <String>[
      med.dosage,
      med.frequency,
      med.duration,
    ].where((String s) => s.isNotEmpty).toList();

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: med.isDispensed
            ? AppColors.success.withValues(alpha: 0.08)
            : scheme.surface,
        borderRadius: AppRadii.radiusMd,
        border: Border.all(
          color: med.isDispensed
              ? AppColors.success.withValues(alpha: 0.30)
              : scheme.outline,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Icon(
                med.isDispensed
                    ? LucideIcons.circleCheck
                    : LucideIcons.circle,
                size: 18,
                color: med.isDispensed
                    ? AppColors.success
                    : scheme.onSurfaceVariant,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Text(
                      med.displayName,
                      style: text.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                      textDirection: TextDirection.rtl,
                    ),
                    if (meta.isNotEmpty) ...<Widget>[
                      const SizedBox(height: 2),
                      Text(
                        meta.join(' • '),
                        style: text.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                        textDirection: TextDirection.rtl,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 6),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                alignment: WrapAlignment.end,
                children: <Widget>[
                  _Pill(
                    label: routeLabel,
                    fg: AppColors.action,
                    bg: AppColors.action.withValues(alpha: 0.12),
                  ),
                  if (med.quantity != null)
                    _Pill(
                      label: '× ${med.quantity}',
                      fg: scheme.onSurfaceVariant,
                      bg: scheme.surfaceContainerHighest,
                    ),
                ],
              ),
            ],
          ),
          if (med.instructions != null &&
              med.instructions!.isNotEmpty) ...<Widget>[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.warning.withValues(alpha: 0.08),
                borderRadius: AppRadii.radiusSm,
                border: Border.all(
                  color: AppColors.warning.withValues(alpha: 0.30),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Icon(
                    LucideIcons.info,
                    size: 14,
                    color: AppColors.warning,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      med.instructions!,
                      style: text.bodySmall,
                      textDirection: TextDirection.rtl,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (med.isDispensed && med.dispensedAt != null) ...<Widget>[
            const SizedBox(height: 6),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: Text(
                'صُرف في ${intl.DateFormat('yyyy-MM-dd HH:mm', 'en').format(med.dispensedAt!.toLocal())}',
                textDirection: TextDirection.ltr,
                style: text.bodySmall?.copyWith(
                  color: AppColors.success,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.fg, required this.bg});
  final String label;
  final Color fg;
  final Color bg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: AppRadii.radiusSm,
      ),
      child: Text(
        label,
        style: TextStyle(
          color: fg,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
