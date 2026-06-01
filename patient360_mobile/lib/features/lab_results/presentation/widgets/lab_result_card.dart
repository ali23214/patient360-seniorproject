// ════════════════════════════════════════════════════════════════════════════
//  LabResultCard
//  ──────────────────────────────────────────────────────────────────────────
//  One card in the lab results list. Mirrors the web's `.pdmr-card` layout
//  from PatientDashboard.jsx (renderLabCard).
//
//  Visual layout:
//
//    ┌────────────────────────────────────────────────────────────┐
//    │ 🧪  LAB-20260516-00001 [• unread]      [LabStatusChip]    │
//    │     [📅 16 أيار 2026] [🧪 3 فحوصات] [⚠ 1 حرجة]            │
//    │                                                       [〉]│
//    └────────────────────────────────────────────────────────────┘
//
//  Tappable — fires [onTap] with the lab id so the parent can navigate
//  to the detail page and mark-as-viewed in parallel.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
// Prefixed because `package:intl` exports its own `TextDirection` enum
// that shadows Flutter's `dart:ui` one — see issue #103. Using a prefix
// keeps the package usable for `DateFormat` while letting us continue
// to refer to `TextDirection.ltr` from Flutter unambiguously.
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/lab_test.dart';
import 'lab_status_chip.dart';

class LabResultCard extends StatelessWidget {
  const LabResultCard({super.key, required this.test, required this.onTap});

  final LabTest test;
  final ValueChanged<LabTest> onTap;

  @override
  Widget build(BuildContext context) {
    final bool isUnread = test.status == 'completed' && !test.isViewedByPatient;
    final int abnormalCount = test.abnormalCount;
    final int criticalCount = test.criticalCount;
    final int resultsCount = test.testResults.length;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: AppColors.card,
        borderRadius: AppRadii.radiusLg,
        elevation: isUnread ? 2 : 0,
        shadowColor: isUnread
            ? AppColors.action.withValues(alpha: 0.2)
            : Colors.transparent,
        child: InkWell(
          borderRadius: AppRadii.radiusLg,
          onTap: () => onTap(test),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: AppRadii.radiusLg,
              border: Border.all(
                color: isUnread ? AppColors.action : AppColors.border,
                width: isUnread ? 1.5 : 1.0,
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                // ── Leading icon bubble ─────────────────────────────
                Container(
                  width: 44,
                  height: 44,
                  decoration: const BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: AppRadii.radiusMd,
                  ),
                  alignment: Alignment.center,
                  child: const Icon(
                    LucideIcons.flaskConical,
                    size: 22,
                    color: AppColors.action,
                  ),
                ),
                const SizedBox(width: 12),

                // ── Body ────────────────────────────────────────────
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      // Title row: testNumber + status chip
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Expanded(
                            child: Row(
                              children: <Widget>[
                                Flexible(
                                  child: Text(
                                    test.testNumber.isNotEmpty
                                        ? test.testNumber
                                        : 'تحليل مخبري',
                                    textDirection: TextDirection.ltr,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.primary,
                                      fontFamily: 'Inter',
                                      height: 1.2,
                                    ),
                                  ),
                                ),
                                if (isUnread) ...<Widget>[
                                  const SizedBox(width: 6),
                                  Container(
                                    width: 7,
                                    height: 7,
                                    decoration: const BoxDecoration(
                                      color: AppColors.action,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          LabStatusChip(status: test.status, compact: true),
                        ],
                      ),
                      const SizedBox(height: 8),

                      // Meta chips row (date + count + critical/abnormal)
                      Wrap(
                        spacing: 12,
                        runSpacing: 6,
                        children: <Widget>[
                          _MetaItem(
                            icon: LucideIcons.calendar,
                            text: _formatDate(test.orderDate),
                            direction: TextDirection.ltr,
                          ),
                          if (resultsCount > 0)
                            _MetaItem(
                              icon: LucideIcons.flaskConical,
                              text: '$resultsCount فحص',
                            ),
                          if (criticalCount > 0)
                            _BadgeItem(
                              icon: LucideIcons.octagonAlert,
                              text: '$criticalCount حرجة',
                              bg: const Color(0xFFFFEBEE),
                              fg: AppColors.error,
                              borderColor: const Color(0xFFFFCDD2),
                            )
                          else if (abnormalCount > 0)
                            _BadgeItem(
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

                const SizedBox(width: 8),
                const Padding(
                  padding: EdgeInsets.only(top: 14),
                  child: Icon(
                    LucideIcons.chevronLeft,
                    size: 18,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _formatDate(DateTime date) {
    try {
      return intl.DateFormat('d MMM yyyy', 'ar').format(date);
    } catch (_) {
      // Fallback when intl Arabic locale data isn't initialized.
      return '${date.day}/${date.month}/${date.year}';
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Small icon + text pair
// ────────────────────────────────────────────────────────────────────────────

class _MetaItem extends StatelessWidget {
  const _MetaItem({required this.icon, required this.text, this.direction});

  final IconData icon;
  final String text;
  final TextDirection? direction;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Icon(icon, size: 13, color: AppColors.textSecondary),
        const SizedBox(width: 4),
        Text(
          text,
          textDirection: direction,
          style: const TextStyle(
            fontSize: 12,
            color: AppColors.textSecondary,
            fontFamily: 'Cairo',
            height: 1.2,
          ),
        ),
      ],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Colored badge item (used for critical / abnormal warnings)
// ────────────────────────────────────────────────────────────────────────────

class _BadgeItem extends StatelessWidget {
  const _BadgeItem({
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
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
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
              fontWeight: FontWeight.w700,
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
