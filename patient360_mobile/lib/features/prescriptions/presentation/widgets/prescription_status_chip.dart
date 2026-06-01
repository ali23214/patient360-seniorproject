// ════════════════════════════════════════════════════════════════════════════
//  PrescriptionStatusChip
//  ──────────────────────────────────────────────────────────────────────────
//  Pill-shaped status badge for a prescription. Mirrors the web's
//  `.pdmr-status.pdmr-status--<variant>` rules.
//
//  Status → variant mapping (identical to PatientDashboard.jsx):
//    active                 → info     (teal)
//    partially_dispensed    → warning  (amber)
//    dispensed              → success  (green)
//    expired / cancelled    → danger   (red)
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';

class PrescriptionStatusChip extends StatelessWidget {
  const PrescriptionStatusChip({
    super.key,
    required this.status,
    this.compact = false,
  });

  final String status;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final _ChipStyle style = _resolveStyle(status);
    final double horizontal = compact ? 8 : 10;
    final double vertical = compact ? 3 : 4;
    final double fontSize = compact ? 11 : 12;

    return Semantics(
      label: 'حالة الوصفة: ${style.label}',
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: horizontal,
          vertical: vertical,
        ),
        decoration: BoxDecoration(
          color: style.bg,
          borderRadius: const BorderRadius.all(Radius.circular(999)),
          border: Border.all(color: style.borderColor),
        ),
        child: Text(
          style.label,
          style: TextStyle(
            fontSize: fontSize,
            fontWeight: FontWeight.w700,
            color: style.fg,
            fontFamily: 'Cairo',
            height: 1.0,
          ),
        ),
      ),
    );
  }
}

class _ChipStyle {
  const _ChipStyle({
    required this.label,
    required this.bg,
    required this.fg,
    required this.borderColor,
  });

  final String label;
  final Color bg;
  final Color fg;
  final Color borderColor;
}

_ChipStyle _resolveStyle(String status) {
  switch (status) {
    case 'active':
      return const _ChipStyle(
        label: 'نشطة',
        bg: AppColors.surface,
        fg: AppColors.action,
        borderColor: AppColors.border,
      );
    case 'partially_dispensed':
      return const _ChipStyle(
        label: 'صرف جزئي',
        bg: Color(0xFFFFF8E1),
        fg: Color(0xFFF57C00),
        borderColor: Color(0xFFFFE082),
      );
    case 'dispensed':
      return const _ChipStyle(
        label: 'تم الصرف',
        bg: Color(0xFFE8F5E9),
        fg: Color(0xFF2E7D32),
        borderColor: Color(0xFFC8E6C9),
      );
    case 'expired':
      return const _ChipStyle(
        label: 'منتهية',
        bg: Color(0xFFFFEBEE),
        fg: Color(0xFFD32F2F),
        borderColor: Color(0xFFFFCDD2),
      );
    case 'cancelled':
      return const _ChipStyle(
        label: 'ملغاة',
        bg: Color(0xFFFFEBEE),
        fg: Color(0xFFD32F2F),
        borderColor: Color(0xFFFFCDD2),
      );
    default:
      return _ChipStyle(
        label: status,
        bg: AppColors.surface,
        fg: AppColors.textSecondary,
        borderColor: AppColors.border,
      );
  }
}
