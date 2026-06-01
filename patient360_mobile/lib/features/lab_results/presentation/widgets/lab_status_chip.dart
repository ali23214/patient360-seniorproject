// ════════════════════════════════════════════════════════════════════════════
//  LabStatusChip
//  ──────────────────────────────────────────────────────────────────────────
//  Pill-shaped status badge for a lab test. Mirrors the web's
//  `.pdmr-status.pdmr-status--<variant>` rules and the matching
//  `LAB_STATUS_LABELS` + `LAB_STATUS_VARIANTS` maps in PatientDashboard.jsx.
//
//  Status → variant mapping (identical to the web):
//    ordered / scheduled / sample_collected → info    (teal)
//    in_progress                            → warning (amber)
//    completed                              → success (green)
//    cancelled / rejected                   → danger  (red)
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';

class LabStatusChip extends StatelessWidget {
  const LabStatusChip({super.key, required this.status, this.compact = false});

  /// Raw backend status string.
  final String status;

  /// Smaller variant for use inside card headers.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final _ChipStyle style = _resolveStyle(status);
    final double horizontal = compact ? 8 : 10;
    final double vertical = compact ? 3 : 4;
    final double fontSize = compact ? 11 : 12;

    return Semantics(
      label: 'حالة التحليل: ${style.label}',
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: horizontal, vertical: vertical),
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
    case 'completed':
      return const _ChipStyle(
        label: 'مكتملة',
        bg: Color(0xFFE8F5E9),
        fg: Color(0xFF2E7D32),
        borderColor: Color(0xFFC8E6C9),
      );
    case 'in_progress':
      return const _ChipStyle(
        label: 'قيد التنفيذ',
        bg: Color(0xFFFFF8E1),
        fg: Color(0xFFF57C00),
        borderColor: Color(0xFFFFE082),
      );
    case 'ordered':
      return const _ChipStyle(
        label: 'معلّقة',
        bg: AppColors.surface,
        fg: AppColors.action,
        borderColor: AppColors.border,
      );
    case 'scheduled':
      return const _ChipStyle(
        label: 'مجدولة',
        bg: AppColors.surface,
        fg: AppColors.action,
        borderColor: AppColors.border,
      );
    case 'sample_collected':
      return const _ChipStyle(
        label: 'تم سحب العينة',
        bg: AppColors.surface,
        fg: AppColors.action,
        borderColor: AppColors.border,
      );
    case 'cancelled':
      return const _ChipStyle(
        label: 'ملغاة',
        bg: Color(0xFFFFEBEE),
        fg: Color(0xFFD32F2F),
        borderColor: Color(0xFFFFCDD2),
      );
    case 'rejected':
      return const _ChipStyle(
        label: 'مرفوضة',
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
