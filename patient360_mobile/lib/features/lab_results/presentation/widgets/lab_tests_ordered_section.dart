// ════════════════════════════════════════════════════════════════════════════
//  LabTestsOrderedSection
//  ──────────────────────────────────────────────────────────────────────────
//  Displays the list of tests the DOCTOR requested (`testsOrdered`), not
//  what the lab measured (`testResults`). The two are distinct and
//  both shown on the detail page.
//
//  Each item shows:
//    • test name (Arabic-friendly)
//    • test code (LTR, secondary color)
//    • doctor's per-test notes (if any)
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/test_ordered.dart';
import 'lab_info_section.dart' show LabSectionHeader;

class LabTestsOrderedSection extends StatelessWidget {
  const LabTestsOrderedSection({super.key, required this.tests});

  final List<TestOrdered> tests;

  @override
  Widget build(BuildContext context) {
    if (tests.isEmpty) return const SizedBox.shrink();

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
            icon: LucideIcons.listChecks,
            title: 'الفحوصات المطلوبة',
            count: tests.length,
          ),
          const SizedBox(height: 12),
          for (int i = 0; i < tests.length; i++) ...<Widget>[
            _OrderedItem(test: tests[i]),
            if (i < tests.length - 1)
              const Divider(
                height: 16,
                thickness: 1,
                color: AppColors.border,
              ),
          ],
        ],
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Single ordered test row
// ────────────────────────────────────────────────────────────────────────────

class _OrderedItem extends StatelessWidget {
  const _OrderedItem({required this.test});

  final TestOrdered test;

  @override
  Widget build(BuildContext context) {
    final String name = _safe(test.testName);
    final String code = _safe(test.testCode);
    final String notes = _safe(test.notes);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Container(
          width: 6,
          height: 6,
          margin: const EdgeInsets.only(top: 8),
          decoration: const BoxDecoration(
            color: AppColors.action,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Expanded(
                    child: Text(
                      name.isEmpty ? '—' : name,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                        fontFamily: 'Cairo',
                        height: 1.4,
                      ),
                    ),
                  ),
                  if (code.isNotEmpty) ...<Widget>[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: const BorderRadius.all(
                            Radius.circular(6)),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Text(
                        code,
                        textDirection: TextDirection.ltr,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.action,
                          fontFamily: 'Inter',
                          height: 1.0,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              if (notes.isNotEmpty) ...<Widget>[
                const SizedBox(height: 4),
                Text(
                  notes,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                    fontFamily: 'Cairo',
                    height: 1.4,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  static String _safe(String? v) => (v ?? '').trim();
}
