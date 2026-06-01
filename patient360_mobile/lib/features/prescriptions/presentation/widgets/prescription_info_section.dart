// ════════════════════════════════════════════════════════════════════════════
//  PrescriptionInfoSection
//  ──────────────────────────────────────────────────────────────────────────
//  Definition-list style card showing every metadata field of the
//  prescription: number, issue date, expiry, doctor, status, etc.
//  Mirrors `.dpg-card` + `.dpg-fields` from the web.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/prescription.dart';

class PrescriptionInfoSection extends StatelessWidget {
  const PrescriptionInfoSection({
    super.key,
    required this.prescription,
    this.doctorName,
  });

  final Prescription prescription;
  final String? doctorName;

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
          const PrescriptionSectionHeader(
            icon: LucideIcons.info,
            title: 'معلومات الوصفة',
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
        label: 'رقم الوصفة',
        value: prescription.prescriptionNumber,
        ltrValue: true,
      ),
      _InfoRow(
        icon: LucideIcons.calendar,
        label: 'تاريخ الإصدار',
        value: _formatLongDate(prescription.prescriptionDate),
        ltrValue: true,
      ),
    ];

    if (prescription.expiryDate != null) {
      rows.add(_InfoRow(
        icon: LucideIcons.clock,
        label: 'تاريخ الانتهاء',
        value: _formatLongDate(prescription.expiryDate!),
        ltrValue: true,
      ));
    }

    if (doctorName != null && doctorName!.isNotEmpty) {
      rows.add(_InfoRow(
        icon: LucideIcons.stethoscope,
        label: 'الطبيب',
        value: doctorName!,
      ));
    }

    rows.add(_InfoRow(
      icon: LucideIcons.pill,
      label: 'عدد الأدوية',
      value: '${prescription.medications.length}',
      ltrValue: true,
    ));

    rows.add(_InfoRow(
      icon: LucideIcons.tag,
      label: 'الحالة',
      value: _statusLabel(prescription.status),
    ));

    if (prescription.firstDispensedAt != null) {
      rows.add(_InfoRow(
        icon: LucideIcons.circleCheckBig,
        label: 'تاريخ الصرف',
        value: _formatLongDate(prescription.firstDispensedAt!),
        ltrValue: true,
      ));
    }

    return rows;
  }

  static String _formatLongDate(DateTime d) {
    try {
      return intl.DateFormat('EEEE، d MMMM yyyy', 'ar').format(d);
    } catch (_) {
      return '${d.day}/${d.month}/${d.year}';
    }
  }

  static String _statusLabel(String status) {
    return switch (status) {
      'active' => 'نشطة',
      'partially_dispensed' => 'صرف جزئي',
      'dispensed' => 'تم الصرف',
      'expired' => 'منتهية',
      'cancelled' => 'ملغاة',
      _ => status,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Section header (reused across all detail cards)
// ────────────────────────────────────────────────────────────────────────────

class PrescriptionSectionHeader extends StatelessWidget {
  const PrescriptionSectionHeader({
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
// Info row
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
