import 'package:flutter/material.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/localization/arabic_labels.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../shared/widgets/ghost_button.dart';
import '../../domain/appointment.dart';

class AppointmentCard extends StatelessWidget {
  const AppointmentCard({
    required this.appointment,
    this.onCancel,
    super.key,
  });

  final Appointment appointment;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;

    final IconData typeIcon = switch (appointment.appointmentType) {
      'dentist' => LucideIcons.user,
      'lab_test' => LucideIcons.flaskConical,
      _ => LucideIcons.stethoscope,
    };
    final String statusLabel = ArabicLabels.lookup(
      ArabicLabels.appointmentStatus,
      appointment.status,
    );
    final Color statusColor = _statusColor(appointment.status);
    final String dateStr =
        intl.DateFormat('yyyy-MM-dd', 'en').format(appointment.appointmentDate);
    final bool showPriority = appointment.priority != 'routine';

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.action.withValues(alpha: 0.15),
                    borderRadius: AppRadii.radiusMd,
                  ),
                  alignment: Alignment.center,
                  child: Icon(
                    typeIcon,
                    size: 20,
                    color: AppColors.action,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        appointment.reasonForVisit.isEmpty
                            ? 'موعد طبي'
                            : appointment.reasonForVisit,
                        style: text.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                        textDirection: TextDirection.rtl,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: <Widget>[
                          Icon(
                            LucideIcons.stethoscope,
                            size: 14,
                            color: scheme.onSurfaceVariant,
                          ),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              appointment.doctor?.displayName ?? 'طبيب',
                              style: text.bodySmall?.copyWith(
                                color: scheme.onSurfaceVariant,
                              ),
                              textDirection: TextDirection.rtl,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Wrap(
                        spacing: 10,
                        runSpacing: 4,
                        children: <Widget>[
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: <Widget>[
                              Icon(
                                LucideIcons.calendar,
                                size: 14,
                                color: scheme.onSurfaceVariant,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                dateStr,
                                textDirection: TextDirection.ltr,
                                style: text.bodySmall?.copyWith(
                                  color: scheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: <Widget>[
                              Icon(
                                LucideIcons.clock,
                                size: 14,
                                color: scheme.onSurfaceVariant,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                appointment.appointmentTime,
                                textDirection: TextDirection.ltr,
                                style: text.bodySmall?.copyWith(
                                  color: scheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: <Widget>[
                    _Chip(
                      label: statusLabel,
                      background: statusColor.withValues(alpha: 0.15),
                      foreground: statusColor,
                    ),
                    if (showPriority) ...<Widget>[
                      const SizedBox(height: 6),
                      _Chip(
                        label: ArabicLabels.lookup(
                          ArabicLabels.priority,
                          appointment.priority,
                        ),
                        background: _priorityBg(appointment.priority),
                        foreground: _priorityFg(appointment.priority),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          if (onCancel != null) ...<Widget>[
            Divider(height: 1, color: scheme.outline),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
              child: GhostButton(
                label: 'إلغاء الموعد',
                icon: LucideIcons.circleX,
                onPressed: onCancel,
              ),
            ),
          ],
        ],
      ),
    );
  }

  static Color _statusColor(String status) {
    return switch (status) {
      'scheduled' || 'confirmed' => AppColors.action,
      'checked_in' || 'in_progress' => AppColors.accent,
      'completed' => AppColors.success,
      'cancelled' || 'no_show' => AppColors.error,
      'rescheduled' => AppColors.warning,
      _ => AppColors.action,
    };
  }

  static Color _priorityBg(String p) {
    return switch (p) {
      'urgent' => AppColors.warning.withValues(alpha: 0.15),
      'emergency' => AppColors.error.withValues(alpha: 0.15),
      _ => AppColors.success.withValues(alpha: 0.15),
    };
  }

  static Color _priorityFg(String p) {
    return switch (p) {
      'urgent' => AppColors.warning,
      'emergency' => AppColors.error,
      _ => AppColors.success,
    };
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.background,
    required this.foreground,
  });

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: background,
        borderRadius: AppRadii.radiusSm,
      ),
      child: Text(
        label,
        style: TextStyle(
          color: foreground,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
