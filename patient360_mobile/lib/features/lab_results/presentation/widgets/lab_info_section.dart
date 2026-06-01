// ════════════════════════════════════════════════════════════════════════════
//  LabInfoSection
//  ──────────────────────────────────────────────────────────────────────────
//  Definition-list style card showing every metadata field of the lab test:
//    • testNumber, orderDate, scheduledDate
//    • sampleCollectedAt, completedAt
//    • doctor, laboratory
//    • testCategory, sampleType, sampleId
//    • priority, status
//
//  Mirrors `.dpg-card` + `.dpg-fields` from the web. Each row stacks
//  vertically on narrow phones: label (with icon) above value.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/lab_test.dart';

class LabInfoSection extends StatelessWidget {
  const LabInfoSection({
    super.key,
    required this.test,
    this.doctorName,
    this.laboratoryName,
  });

  final LabTest test;
  final String? doctorName;
  final String? laboratoryName;

  @override
  Widget build(BuildContext context) {
    final List<_InfoRow> rows = _buildRows();

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
          const _SectionHeader(
            icon: LucideIcons.info,
            title: 'معلومات التحليل',
          ),
          const SizedBox(height: 12),
          for (int i = 0; i < rows.length; i++) ...<Widget>[
            _Row(row: rows[i]),
            if (i < rows.length - 1)
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

  List<_InfoRow> _buildRows() {
    final List<_InfoRow> rows = <_InfoRow>[
      _InfoRow(
        icon: LucideIcons.hash,
        label: 'رقم التحليل',
        value: test.testNumber,
        ltrValue: true,
      ),
      _InfoRow(
        icon: LucideIcons.calendar,
        label: 'تاريخ الطلب',
        value: _formatLongDate(test.orderDate),
        ltrValue: true,
      ),
    ];

    if (test.scheduledDate != null) {
      rows.add(_InfoRow(
        icon: LucideIcons.calendar,
        label: 'التاريخ المقرر',
        value: _formatLongDate(test.scheduledDate!),
        ltrValue: true,
      ));
    }

    if (test.sampleCollectedAt != null) {
      rows.add(_InfoRow(
        icon: LucideIcons.beaker,
        label: 'تاريخ سحب العينة',
        value: _formatDateTime(test.sampleCollectedAt!),
        ltrValue: true,
      ));
    }

    if (test.completedAt != null) {
      rows.add(_InfoRow(
        icon: LucideIcons.circleCheckBig,
        label: 'تاريخ النتائج',
        value: _formatDateTime(test.completedAt!),
        ltrValue: true,
      ));
    }

    if (doctorName != null && doctorName!.isNotEmpty) {
      rows.add(_InfoRow(
        icon: LucideIcons.stethoscope,
        label: 'الطبيب الطالب',
        value: doctorName!,
      ));
    }

    if (laboratoryName != null && laboratoryName!.isNotEmpty) {
      rows.add(_InfoRow(
        icon: LucideIcons.hospital,
        label: 'المختبر',
        value: laboratoryName!,
      ));
    }

    if (test.testCategory.isNotEmpty) {
      rows.add(_InfoRow(
        icon: LucideIcons.flaskConical,
        label: 'الفئة',
        value: _categoryLabel(test.testCategory),
      ));
    }

    if (test.sampleType != null && test.sampleType!.isNotEmpty) {
      rows.add(_InfoRow(
        icon: LucideIcons.beaker,
        label: 'نوع العينة',
        value: _sampleTypeLabel(test.sampleType!),
      ));
    }

    if (test.sampleId != null && test.sampleId!.isNotEmpty) {
      rows.add(_InfoRow(
        icon: LucideIcons.hash,
        label: 'معرف العينة',
        value: test.sampleId!,
        ltrValue: true,
      ));
    }

    rows.add(_InfoRow(
      icon: LucideIcons.clock,
      label: 'الأولوية',
      value: _priorityLabel(test.priority),
    ));

    rows.add(_InfoRow(
      icon: LucideIcons.tag,
      label: 'الحالة',
      value: _statusLabel(test.status),
    ));

    return rows;
  }

  // ── Format helpers ────────────────────────────────────────────────

  static String _formatLongDate(DateTime d) {
    try {
      return intl.DateFormat('EEEE، d MMMM yyyy', 'ar').format(d);
    } catch (_) {
      return '${d.day}/${d.month}/${d.year}';
    }
  }

  static String _formatDateTime(DateTime d) {
    try {
      final String date = intl.DateFormat('d MMMM yyyy', 'ar').format(d);
      final String time = intl.DateFormat('hh:mm a', 'ar').format(d);
      return '$date — $time';
    } catch (_) {
      return '${d.day}/${d.month}/${d.year} '
          '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    }
  }

  static String _categoryLabel(String category) {
    return switch (category) {
      'blood' => 'دم',
      'urine' => 'بول',
      'stool' => 'براز',
      'imaging' => 'تصوير',
      'biopsy' => 'خزعة',
      'microbiology' => 'أحياء دقيقة',
      'molecular' => 'بيولوجيا جزيئية',
      'other' => 'أخرى',
      _ => category,
    };
  }

  static String _sampleTypeLabel(String sampleType) {
    return switch (sampleType) {
      'blood' => 'دم',
      'urine' => 'بول',
      'stool' => 'براز',
      'tissue' => 'نسيج',
      'swab' => 'مسحة',
      'saliva' => 'لعاب',
      'other' => 'أخرى',
      _ => sampleType,
    };
  }

  static String _priorityLabel(String priority) {
    return switch (priority) {
      'routine' => 'اعتيادية',
      'urgent' => 'عاجلة',
      'stat' => 'فورية',
      _ => priority,
    };
  }

  static String _statusLabel(String status) {
    return switch (status) {
      'ordered' => 'معلّقة',
      'scheduled' => 'مجدولة',
      'sample_collected' => 'تم سحب العينة',
      'in_progress' => 'قيد التنفيذ',
      'completed' => 'مكتملة',
      'cancelled' => 'ملغاة',
      'rejected' => 'مرفوضة',
      _ => status,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Section header (icon + title) — reused inside all detail cards
// ────────────────────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.icon, required this.title, this.count});

  final IconData icon;
  final String title;
  final int? count;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Icon(icon, size: 18, color: AppColors.action),
        const SizedBox(width: 8),
        Text(
          title,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            color: AppColors.primary,
            fontFamily: 'Cairo',
            height: 1.2,
          ),
        ),
        if (count != null) ...<Widget>[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: const BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.all(Radius.circular(999)),
            ),
            child: Text(
              '$count',
              textDirection: TextDirection.ltr,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: AppColors.action,
                fontFamily: 'Inter',
                height: 1.0,
              ),
            ),
          ),
        ],
      ],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Info row models + rendering
// ────────────────────────────────────────────────────────────────────────────

class _InfoRow {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    this.ltrValue = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool ltrValue;
}

class _Row extends StatelessWidget {
  const _Row({required this.row});

  final _InfoRow row;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Icon(row.icon, size: 15, color: AppColors.textSecondary),
        const SizedBox(width: 8),
        Expanded(
          flex: 4,
          child: Text(
            row.label,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.textSecondary,
              fontFamily: 'Cairo',
              height: 1.4,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          flex: 5,
          child: Text(
            row.value.isEmpty ? '—' : row.value,
            textAlign: TextAlign.left,
            textDirection: row.ltrValue ? TextDirection.ltr : null,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
              fontFamily: 'Cairo',
              height: 1.4,
            ),
          ),
        ),
      ],
    );
  }
}

// Re-exportable for use in other detail sections that need the same look
// (e.g. tests-ordered card, results card).
class LabSectionHeader extends StatelessWidget {
  const LabSectionHeader({
    super.key,
    required this.icon,
    required this.title,
    this.count,
  });

  final IconData icon;
  final String title;
  final int? count;

  @override
  Widget build(BuildContext context) {
    return _SectionHeader(icon: icon, title: title, count: count);
  }
}
