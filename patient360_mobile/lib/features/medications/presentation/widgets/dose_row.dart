import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../prescriptions/presentation/providers/adherence_provider.dart';
import '../../domain/scheduled_dose.dart';
import 'dose_window_badge.dart';

/// One actionable row representing a [ScheduledDose].
///
/// Behavior depends on [readOnly] and [DoseWindow]:
///   - upcoming/current/overdue + interactive → 60×60 checkbox tap target
///     that calls [adherenceProvider.markTaken] optimistically.
///   - taken → green check + "تم في <hh:mm>".
///   - missed → muted X + "فات وقتها".
///   - readOnly (past dates on calendar tab) → muted indicator only.
///   - future dates with [readOnly] true → disabled checkbox icon.
class DoseRow extends ConsumerWidget {
  const DoseRow({
    required this.dose,
    this.readOnly = false,
    this.disabled = false,
    this.highlighted = false,
    this.rowKey,
    super.key,
  });

  final ScheduledDose dose;

  /// True when the row should never be tappable (past dates on calendar).
  final bool readOnly;

  /// True when the dose is in the future on a calendar day other than
  /// today — shows the row but disables the checkbox.
  final bool disabled;

  /// Visual pulse applied during deep-link focus. The schedule tab clears
  /// this after the animation completes.
  final bool highlighted;

  /// Forwarded to the outer [Container] so [TodayScheduleTab] can attach a
  /// [GlobalKey] for scroll-to.
  final Key? rowKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final Color tint = _tintFor(dose.window);
    final Color baseBg = scheme.surfaceContainer;
    final Color rowBg = highlighted
        ? AppColors.action.withValues(alpha: 0.18)
        : (tint == Colors.transparent ? baseBg : tint);

    final String timeLabel = _formatTime(dose.scheduledAt);

    return AnimatedContainer(
      key: rowKey,
      duration: const Duration(milliseconds: 280),
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsetsDirectional.fromSTEB(12, 10, 8, 10),
      decoration: BoxDecoration(
        color: rowBg,
        borderRadius: AppRadii.radiusMd,
        border: Border.all(
          color: highlighted ? AppColors.action : scheme.outline,
          width: highlighted ? 2 : 1,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          // ═════ leading: window badge + time ═════
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              DoseWindowBadge(window: dose.window),
              const SizedBox(height: 6),
              Text(
                timeLabel,
                textDirection: TextDirection.ltr,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  height: 1.0,
                ),
              ),
            ],
          ),
          const SizedBox(width: 14),
          // ═════ center: medication info ═════
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  dose.medicationName,
                  textDirection: TextDirection.rtl,
                  style: Theme.of(context)
                      .textTheme
                      .bodyLarge
                      ?.copyWith(fontWeight: FontWeight.w700),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (dose.dosage.isNotEmpty)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(top: 2),
                    child: Text(
                      dose.dosage,
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ),
                if (dose.prescriptionNumber != null &&
                    dose.prescriptionNumber!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(top: 2),
                    child: Text(
                      '#${dose.prescriptionNumber}',
                      textDirection: TextDirection.ltr,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                            fontWeight: FontWeight.w500,
                          ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // ═════ trailing: action / status ═════
          _Trailing(
            dose: dose,
            readOnly: readOnly,
            disabled: disabled,
            onMark: () =>
                ref.read(adherenceProvider.notifier).markTaken(
                      prescriptionId: dose.prescriptionId,
                      medicationIndex: dose.medicationIndex,
                      scheduledAt: dose.scheduledAt,
                    ),
          ),
        ],
      ),
    );
  }

  static Color _tintFor(DoseWindow w) {
    switch (w) {
      case DoseWindow.current:
        return AppColors.accent.withValues(alpha: 0.10);
      case DoseWindow.overdue:
        return AppColors.warning.withValues(alpha: 0.10);
      case DoseWindow.upcoming:
      case DoseWindow.taken:
      case DoseWindow.missed:
        return Colors.transparent;
    }
  }

  static String _formatTime(DateTime when) =>
      intl.DateFormat('HH:mm').format(when);
}

class _Trailing extends StatelessWidget {
  const _Trailing({
    required this.dose,
    required this.readOnly,
    required this.disabled,
    required this.onMark,
  });

  final ScheduledDose dose;
  final bool readOnly;
  final bool disabled;
  final VoidCallback onMark;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    if (dose.window == DoseWindow.taken) {
      return _StatusIndicator(
        icon: LucideIcons.circleCheck,
        color: AppColors.success,
        primaryLabel: 'تم',
        secondaryLabel: dose.takenAt == null
            ? null
            : intl.DateFormat('HH:mm').format(dose.takenAt!),
      );
    }

    if (dose.window == DoseWindow.missed) {
      return _StatusIndicator(
        icon: LucideIcons.circleX,
        color: scheme.onSurfaceVariant,
        primaryLabel: 'فات وقتها',
      );
    }

    final bool tappable = !readOnly && !disabled;
    return _MarkAsTakenButton(
      enabled: tappable,
      onTap: tappable ? onMark : null,
    );
  }
}

class _MarkAsTakenButton extends StatelessWidget {
  const _MarkAsTakenButton({required this.enabled, required this.onTap});
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final Color border = enabled ? AppColors.action : scheme.outline;
    final Color tint = enabled
        ? AppColors.action.withValues(alpha: 0.10)
        : Colors.transparent;
    final Color iconColor =
        enabled ? AppColors.action : scheme.onSurfaceVariant;

    return Semantics(
      button: true,
      enabled: enabled,
      label: enabled ? 'تسجيل أنني تناولت الجرعة' : 'لا يمكن التسجيل الآن',
      child: SizedBox(
        width: 60,
        height: 60,
        child: Material(
          color: tint,
          borderRadius: AppRadii.radiusMd,
          child: InkWell(
            borderRadius: AppRadii.radiusMd,
            onTap: onTap,
            child: Container(
              decoration: BoxDecoration(
                borderRadius: AppRadii.radiusMd,
                border: Border.all(color: border, width: 1.5),
              ),
              alignment: Alignment.center,
              child: Icon(LucideIcons.check, size: 28, color: iconColor),
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusIndicator extends StatelessWidget {
  const _StatusIndicator({
    required this.icon,
    required this.color,
    required this.primaryLabel,
    this.secondaryLabel,
  });

  final IconData icon;
  final Color color;
  final String primaryLabel;
  final String? secondaryLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 22, color: color),
          const SizedBox(width: 6),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                primaryLabel,
                style: TextStyle(
                  color: color,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (secondaryLabel != null)
                Text(
                  secondaryLabel!,
                  textDirection: TextDirection.ltr,
                  style: TextStyle(
                    color: color.withValues(alpha: 0.85),
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
