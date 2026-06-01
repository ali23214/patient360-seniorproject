// ════════════════════════════════════════════════════════════════════════════
//  VisitMedicationsSection
//  ──────────────────────────────────────────────────────────────────────────
//  Renders the inline `prescribedMedications[]` array on a Visit document.
//  These are the meds the doctor wrote on this specific encounter — distinct
//  from the formal Prescription documents that drive dispensing.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/prescribed_medication.dart';
import 'visit_info_section.dart' show VisitSectionHeader;

class VisitMedicationsSection extends StatelessWidget {
  const VisitMedicationsSection({super.key, required this.medications});

  final List<PrescribedMedication> medications;

  @override
  Widget build(BuildContext context) {
    if (medications.isEmpty) return const SizedBox.shrink();

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
          VisitSectionHeader(
            icon: LucideIcons.pill,
            title: 'الأدوية الموصوفة',
            count: medications.length,
          ),
          const SizedBox(height: 12),
          for (int i = 0; i < medications.length; i++) ...<Widget>[
            _MedItem(med: medications[i], index: i + 1),
            if (i < medications.length - 1) const SizedBox(height: 10),
          ],
        ],
      ),
    );
  }
}

class _MedItem extends StatelessWidget {
  const _MedItem({required this.med, required this.index});
  final PrescribedMedication med;
  final int index;

  @override
  Widget build(BuildContext context) {
    final String name = med.medicationName.trim().isEmpty
        ? 'دواء'
        : med.medicationName.trim();

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: const BorderRadius.all(Radius.circular(10)),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // ── Name row with index badge ─────────────────────────
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Container(
                width: 24,
                height: 24,
                decoration: const BoxDecoration(
                  color: AppColors.surface,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(
                  '$index',
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
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  name,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textPrimary,
                    fontFamily: 'Cairo',
                    height: 1.3,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // ── Fields grid ───────────────────────────────────────
          Wrap(
            spacing: 24,
            runSpacing: 10,
            children: <Widget>[
              _Field(
                label: 'الجرعة',
                value: med.dosage,
                icon: LucideIcons.beaker,
              ),
              _Field(
                label: 'التكرار',
                value: med.frequency,
                icon: LucideIcons.repeat2,
              ),
              _Field(
                label: 'المدة',
                value: med.duration,
                icon: LucideIcons.calendar,
              ),
              if (med.route.isNotEmpty)
                _Field(
                  label: 'طريقة الاستخدام',
                  value: _routeLabel(med.route),
                  icon: LucideIcons.navigation,
                ),
              if (med.quantity != null)
                _Field(
                  label: 'الكمية',
                  value: '${med.quantity}',
                  icon: LucideIcons.hash,
                  ltr: true,
                ),
            ],
          ),
          // ── Instructions ──────────────────────────────────────
          if ((med.instructions ?? '').trim().isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: const BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.all(Radius.circular(8)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Icon(LucideIcons.lightbulb,
                      size: 14, color: AppColors.action),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      med.instructions!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textPrimary,
                        fontFamily: 'Cairo',
                        height: 1.5,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  static String _routeLabel(String route) {
    return switch (route) {
      'oral' => 'عن طريق الفم',
      'topical' => 'موضعي',
      'injection' => 'حقن',
      'inhalation' => 'استنشاق',
      'sublingual' => 'تحت اللسان',
      'rectal' => 'شرجي',
      'other' => 'أخرى',
      _ => route,
    };
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.label,
    required this.value,
    required this.icon,
    this.ltr = false,
  });
  final String label;
  final String value;
  final IconData icon;
  final bool ltr;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 12, color: AppColors.textSecondary),
            const SizedBox(width: 4),
            Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary,
                fontFamily: 'Cairo',
              ),
            ),
          ],
        ),
        const SizedBox(height: 3),
        Text(
          value.trim().isEmpty ? '—' : value,
          textDirection: ltr ? TextDirection.ltr : null,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: AppColors.textPrimary,
            fontFamily: 'Cairo',
            height: 1.2,
          ),
        ),
      ],
    );
  }
}
