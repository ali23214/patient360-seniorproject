// ════════════════════════════════════════════════════════════════════════════
//  LabDetailHero
//  ──────────────────────────────────────────────────────────────────────────
//  Top "hero" card on the lab detail page. Mirrors the web's `.dpg-hero`
//  layout — large icon bubble + title (testNumber) + meta row + badges.
//
//  Layout:
//    ┌──────────────────────────────────────────────────────┐
//    │ [🧪 28x28]   LAB-20260516-00001                       │
//    │              📅 16 أيار 2026  🏥 مختبر دمشق           │
//    │              👨‍⚕️ د. محسن مصري                          │
//    │              [مكتملة] [⚠ 1 نتيجة حرجة]                │
//    └──────────────────────────────────────────────────────┘
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../widgets/lab_status_chip.dart';

class LabDetailHero extends StatelessWidget {
  const LabDetailHero({
    super.key,
    required this.testNumber,
    required this.orderDate,
    required this.status,
    this.laboratoryName,
    this.doctorName,
    this.criticalCount = 0,
    this.abnormalCount = 0,
  });

  final String testNumber;
  final DateTime orderDate;
  final String status;
  final String? laboratoryName;
  final String? doctorName;
  final int criticalCount;
  final int abnormalCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // ── Icon bubble ──────────────────────────────────────────
          Container(
            width: 56,
            height: 56,
            decoration: const BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.all(Radius.circular(14)),
            ),
            alignment: Alignment.center,
            child: const Icon(
              LucideIcons.flaskConical,
              size: 28,
              color: AppColors.action,
            ),
          ),
          const SizedBox(width: 14),

          // ── Body ─────────────────────────────────────────────────
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                // Title
                Text(
                  testNumber.isNotEmpty ? testNumber : 'تحليل مخبري',
                  textDirection: TextDirection.ltr,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary,
                    fontFamily: 'Inter',
                    height: 1.2,
                  ),
                ),
                const SizedBox(height: 10),

                // Meta items
                _MetaItem(
                  icon: LucideIcons.calendar,
                  text: _formatLongDate(orderDate),
                  direction: TextDirection.ltr,
                ),
                if (laboratoryName != null &&
                    laboratoryName!.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 4),
                  _MetaItem(
                    icon: LucideIcons.hospital,
                    text: laboratoryName!,
                  ),
                ],
                if (doctorName != null && doctorName!.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 4),
                  _MetaItem(
                    icon: LucideIcons.stethoscope,
                    text: doctorName!,
                  ),
                ],

                const SizedBox(height: 10),

                // Badges
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: <Widget>[
                    LabStatusChip(status: status),
                    if (criticalCount > 0)
                      _BadgePill(
                        icon: LucideIcons.octagonAlert,
                        text: '$criticalCount نتيجة حرجة',
                        bg: const Color(0xFFFFEBEE),
                        fg: AppColors.error,
                        borderColor: const Color(0xFFFFCDD2),
                      )
                    else if (abnormalCount > 0)
                      _BadgePill(
                        icon: LucideIcons.triangleAlert,
                        text: '$abnormalCount غير طبيعية',
                        bg: const Color(0xFFFFF8E1),
                        fg: const Color(0xFFF57C00),
                        borderColor: const Color(0xFFFFE082),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _formatLongDate(DateTime d) {
    try {
      return intl.DateFormat('EEEE، d MMMM yyyy', 'ar').format(d);
    } catch (_) {
      return '${d.day}/${d.month}/${d.year}';
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Meta item: icon + text row
// ────────────────────────────────────────────────────────────────────────────

class _MetaItem extends StatelessWidget {
  const _MetaItem({required this.icon, required this.text, this.direction});

  final IconData icon;
  final String text;
  final TextDirection? direction;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Icon(icon, size: 14, color: AppColors.textSecondary),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            textDirection: direction,
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.textSecondary,
              fontFamily: 'Cairo',
              height: 1.4,
            ),
          ),
        ),
      ],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Badge pill (used for critical/abnormal counts in the hero)
// ────────────────────────────────────────────────────────────────────────────

class _BadgePill extends StatelessWidget {
  const _BadgePill({
    required this.icon,
    required this.text,
    required this.bg,
    required this.fg,
    required this.borderColor,
  });

  final IconData icon;
  final String text;
  final Color bg;
  final Color fg;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 11, color: fg),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: fg,
              fontFamily: 'Cairo',
              height: 1.0,
            ),
          ),
        ],
      ),
    );
  }
}
