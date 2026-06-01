// ════════════════════════════════════════════════════════════════════════════
//  VisitDetailHero — large icon bubble + chief complaint + meta + chips.
//  Sits at the very top of the visit detail page.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import 'visit_status_chip.dart';

class VisitDetailHero extends StatelessWidget {
  const VisitDetailHero({
    super.key,
    required this.chiefComplaint,
    required this.visitDate,
    required this.status,
    required this.visitType,
    this.doctorName,
  });

  final String chiefComplaint;
  final DateTime visitDate;
  final String status;
  final String visitType;
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
              LucideIcons.stethoscope,
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
                  chiefComplaint.isNotEmpty
                      ? chiefComplaint
                      : 'زيارة طبية',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary,
                    fontFamily: 'Cairo',
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 10),
                _MetaItem(
                  icon: LucideIcons.calendar,
                  text: _formatLongDate(visitDate),
                  ltr: true,
                ),
                if (doctorName != null && doctorName!.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 4),
                  _MetaItem(
                    icon: LucideIcons.user,
                    text: doctorName!,
                  ),
                ],
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: <Widget>[
                    VisitStatusChip(status: status),
                    VisitTypeChip(visitType: visitType),
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

class _MetaItem extends StatelessWidget {
  const _MetaItem({required this.icon, required this.text, this.ltr = false});
  final IconData icon;
  final String text;
  final bool ltr;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Icon(icon, size: 14, color: AppColors.textSecondary),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            textDirection: ltr ? TextDirection.ltr : null,
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
