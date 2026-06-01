// ════════════════════════════════════════════════════════════════════════════
//  LabResultsSection
//  ──────────────────────────────────────────────────────────────────────────
//  Renders the structured `testResults` array as a card-list (mobile-
//  friendly equivalent of the web's `<table>`). Each result row shows:
//    • test name + (optional) code
//    • measured value + unit
//    • reference range (when present)
//    • status pill (طبيعية / غير طبيعية / حرجة)
//
//  Above the list, a stats summary row shows totals by severity.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/test_result_row.dart';
import 'lab_info_section.dart' show LabSectionHeader;

class LabResultsSection extends StatelessWidget {
  const LabResultsSection({super.key, required this.results, required this.status});

  final List<TestResultRow> results;

  /// Used to decide the empty-state message: completed with no results
  /// vs. test not yet finalized.
  final String status;

  @override
  Widget build(BuildContext context) {
    if (results.isEmpty) {
      return _EmptyCard(status: status);
    }

    final _Stats stats = _computeStats(results);

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          LabSectionHeader(
            icon: LucideIcons.flaskConical,
            title: 'النتائج',
            count: results.length,
          ),
          const SizedBox(height: 12),

          // ── Stats summary ─────────────────────────────────────────
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: <Widget>[
              if (stats.normal > 0)
                _StatPill(
                  icon: LucideIcons.circleCheckBig,
                  text: '${stats.normal} طبيعية',
                  bg: const Color(0xFFE8F5E9),
                  fg: const Color(0xFF2E7D32),
                  borderColor: const Color(0xFFC8E6C9),
                ),
              if (stats.abnormal > 0)
                _StatPill(
                  icon: LucideIcons.triangleAlert,
                  text: '${stats.abnormal} غير طبيعية',
                  bg: const Color(0xFFFFF8E1),
                  fg: const Color(0xFFF57C00),
                  borderColor: const Color(0xFFFFE082),
                ),
              if (stats.critical > 0)
                _StatPill(
                  icon: LucideIcons.octagonAlert,
                  text: '${stats.critical} حرجة',
                  bg: const Color(0xFFFFEBEE),
                  fg: AppColors.error,
                  borderColor: const Color(0xFFFFCDD2),
                ),
            ],
          ),
          const SizedBox(height: 14),

          // ── Result rows ───────────────────────────────────────────
          for (int i = 0; i < results.length; i++) ...<Widget>[
            _ResultRowCard(row: results[i]),
            if (i < results.length - 1) const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }

  static _Stats _computeStats(List<TestResultRow> rows) {
    int normal = 0, abnormal = 0, critical = 0;
    for (final TestResultRow r in rows) {
      if (r.isCritical) {
        critical++;
      } else if (r.isAbnormal) {
        abnormal++;
      } else {
        normal++;
      }
    }
    return _Stats(normal: normal, abnormal: abnormal, critical: critical);
  }
}

class _Stats {
  const _Stats({
    required this.normal,
    required this.abnormal,
    required this.critical,
  });
  final int normal;
  final int abnormal;
  final int critical;
}

// ────────────────────────────────────────────────────────────────────────────
// Stat pill (above the list)
// ────────────────────────────────────────────────────────────────────────────

class _StatPill extends StatelessWidget {
  const _StatPill({
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
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 12, color: fg),
          const SizedBox(width: 5),
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

// ────────────────────────────────────────────────────────────────────────────
// Individual result row (one measured value)
// ────────────────────────────────────────────────────────────────────────────

class _ResultRowCard extends StatelessWidget {
  const _ResultRowCard({required this.row});

  final TestResultRow row;

  @override
  Widget build(BuildContext context) {
    final _RowSeverity sev = _severityFor(row);
    final String unit = (row.unit ?? '').trim();
    final String value = (row.value).trim();
    final String range = (row.referenceRange ?? '').trim();
    final String testName = (row.testName).trim();
    final String testCode = (row.testCode ?? '').trim();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: sev.rowBg,
        borderRadius: const BorderRadius.all(Radius.circular(10)),
        border: Border.all(color: sev.rowBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // ── Top row: test name + status pill ──────────────────────
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Expanded(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: <Widget>[
                    Flexible(
                      child: Text(
                        testName.isEmpty ? '—' : testName,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: AppColors.textPrimary,
                          fontFamily: 'Cairo',
                          height: 1.3,
                        ),
                      ),
                    ),
                    if (testCode.isNotEmpty) ...<Widget>[
                      const SizedBox(width: 6),
                      Text(
                        testCode,
                        textDirection: TextDirection.ltr,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textSecondary,
                          fontFamily: 'Inter',
                          height: 1.0,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: sev.pillBg,
                  borderRadius: const BorderRadius.all(Radius.circular(999)),
                  border: Border.all(color: sev.pillBorder),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Icon(sev.icon, size: 10, color: sev.fg),
                    const SizedBox(width: 4),
                    Text(
                      sev.label,
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: sev.fg,
                        fontFamily: 'Cairo',
                        height: 1.0,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 10),

          // ── Bottom row: value + reference range ───────────────────
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // Value
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    const Text(
                      'القيمة',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textSecondary,
                        fontFamily: 'Cairo',
                      ),
                    ),
                    const SizedBox(height: 3),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: <Widget>[
                        Text(
                          value.isEmpty ? '—' : value,
                          textDirection: TextDirection.ltr,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: sev.fg,
                            fontFamily: 'Inter',
                            height: 1.0,
                          ),
                        ),
                        if (unit.isNotEmpty) ...<Widget>[
                          const SizedBox(width: 4),
                          Text(
                            unit,
                            textDirection: TextDirection.ltr,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textSecondary,
                              fontFamily: 'Inter',
                              height: 1.0,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),

              // Reference range
              if (range.isNotEmpty)
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const Text(
                        'المعدل الطبيعي',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textSecondary,
                          fontFamily: 'Cairo',
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        range,
                        textDirection: TextDirection.ltr,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                          fontFamily: 'Inter',
                          height: 1.2,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  static _RowSeverity _severityFor(TestResultRow r) {
    if (r.isCritical) {
      return const _RowSeverity(
        label: 'حرجة',
        icon: LucideIcons.octagonAlert,
        rowBg: Color(0xFFFFF5F5),
        rowBorder: Color(0xFFFFCDD2),
        pillBg: Color(0xFFFFEBEE),
        pillBorder: Color(0xFFEF9A9A),
        fg: AppColors.error,
      );
    }
    if (r.isAbnormal) {
      return const _RowSeverity(
        label: 'غير طبيعية',
        icon: LucideIcons.triangleAlert,
        rowBg: Color(0xFFFFFBF0),
        rowBorder: Color(0xFFFFE082),
        pillBg: Color(0xFFFFF8E1),
        pillBorder: Color(0xFFFFD54F),
        fg: Color(0xFFF57C00),
      );
    }
    return const _RowSeverity(
      label: 'طبيعية',
      icon: LucideIcons.circleCheckBig,
      rowBg: Color(0xFFF8FBF8),
      rowBorder: Color(0xFFC8E6C9),
      pillBg: Color(0xFFE8F5E9),
      pillBorder: Color(0xFFA5D6A7),
      fg: Color(0xFF2E7D32),
    );
  }
}

class _RowSeverity {
  const _RowSeverity({
    required this.label,
    required this.icon,
    required this.rowBg,
    required this.rowBorder,
    required this.pillBg,
    required this.pillBorder,
    required this.fg,
  });

  final String label;
  final IconData icon;
  final Color rowBg;
  final Color rowBorder;
  final Color pillBg;
  final Color pillBorder;
  final Color fg;
}

// ────────────────────────────────────────────────────────────────────────────
// Empty card (no structured results)
// ────────────────────────────────────────────────────────────────────────────

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final String text = status == 'completed'
        ? 'لم تُسجّل نتائج تفصيلية لهذا التحليل، لكن قد يتوفر تقرير PDF للتنزيل أدناه.'
        : 'لم تصدر النتائج بعد. ستظهر هنا فور توفرها من المختبر.';

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
          const Icon(LucideIcons.info,
              size: 18, color: AppColors.textSecondary),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textSecondary,
                fontFamily: 'Cairo',
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
