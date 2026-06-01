// ════════════════════════════════════════════════════════════════════════════
//  PrescriptionDetailHero
//  ──────────────────────────────────────────────────────────────────────────
//  Top hero card on the prescription detail page. Mirrors the web's
//  `.dpg-hero` — large icon bubble + RX number + meta + status badge.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../widgets/prescription_status_chip.dart';

class PrescriptionDetailHero extends StatelessWidget {
  const PrescriptionDetailHero({
    super.key,
    required this.prescriptionNumber,
    required this.prescriptionDate,
    required this.status,
    required this.medicationsCount,
    this.doctorName,
  });

  final String prescriptionNumber;
  final DateTime prescriptionDate;
  final String status;
  final int medicationsCount;
  final String? doctorName;

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
          Container(
            width: 56,
            height: 56,
            decoration: const BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.all(Radius.circular(14)),
            ),
            alignment: Alignment.center,
            child: const Icon(
              LucideIcons.pill,
              size: 28,
              color: AppColors.action,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  prescriptionNumber.isNotEmpty
                      ? prescriptionNumber
                      : 'وصفة طبية',
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
                _MetaItem(
                  icon: LucideIcons.calendar,
                  text: _formatLongDate(prescriptionDate),
                  direction: TextDirection.ltr,
                ),
                if (doctorName != null && doctorName!.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 4),
                  _MetaItem(
                    icon: LucideIcons.stethoscope,
                    text: doctorName!,
                  ),
                ],
                const SizedBox(height: 4),
                _MetaItem(
                  icon: LucideIcons.pill,
                  text: medicationsCount == 1
                      ? 'دواء واحد'
                      : '$medicationsCount أدوية',
                ),
                const SizedBox(height: 10),
                PrescriptionStatusChip(status: status),
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
