import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/scheduled_dose.dart';

/// Tiny color-dot + label chip describing a [DoseWindow]. Used as the
/// leading visual on every [DoseRow] in both the schedule list and the
/// day-detail card.
class DoseWindowBadge extends StatelessWidget {
  const DoseWindowBadge({required this.window, super.key});

  final DoseWindow window;

  @override
  Widget build(BuildContext context) {
    final _Style style = _styleFor(window, Theme.of(context).brightness);
    return Container(
      padding: const EdgeInsetsDirectional.only(
        start: 8,
        end: 10,
        top: 4,
        bottom: 4,
      ),
      decoration: BoxDecoration(
        color: style.background,
        borderRadius: AppRadii.radiusSm,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: style.dot,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            style.label,
            style: TextStyle(
              color: style.foreground,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              height: 1.0,
            ),
          ),
        ],
      ),
    );
  }

  static _Style _styleFor(DoseWindow w, Brightness brightness) {
    switch (w) {
      case DoseWindow.upcoming:
        return _Style(
          dot: AppColors.action,
          background: AppColors.action.withValues(alpha: 0.14),
          foreground: AppColors.action,
          label: 'قادم',
        );
      case DoseWindow.current:
        return _Style(
          dot: AppColors.accent,
          background: AppColors.accent.withValues(alpha: 0.20),
          foreground: brightness == Brightness.dark
              ? AppColors.accentDark
              : AppColors.primary,
          label: 'الآن',
        );
      case DoseWindow.overdue:
        return _Style(
          dot: AppColors.warning,
          background: AppColors.warning.withValues(alpha: 0.18),
          foreground: AppColors.warning,
          label: 'متأخر',
        );
      case DoseWindow.taken:
        return _Style(
          dot: AppColors.success,
          background: AppColors.success.withValues(alpha: 0.16),
          foreground: AppColors.success,
          label: 'مكتمل',
        );
      case DoseWindow.missed:
        return const _Style(
          dot: Color(0xFF9E9E9E),
          background: Color(0x269E9E9E),
          foreground: Color(0xFF757575),
          label: 'فائت',
        );
    }
  }
}

class _Style {
  const _Style({
    required this.dot,
    required this.background,
    required this.foreground,
    required this.label,
  });
  final Color dot;
  final Color background;
  final Color foreground;
  final String label;
}
