// ════════════════════════════════════════════════════════════════════════════
//  VisitVitalsSection
//  ──────────────────────────────────────────────────────────────────────────
//  Renders the 9 vital signs measured during the visit. Blood pressure
//  collapses systolic+diastolic into a single "120/80 mmHg" tile (matching
//  the web). Each tile shows a labeled value with its unit; we only emit
//  tiles for fields the doctor actually filled in.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/vital_signs.dart';
import 'visit_info_section.dart' show VisitSectionHeader;

class VisitVitalsSection extends StatelessWidget {
  const VisitVitalsSection({super.key, required this.vitals});

  final VitalSigns vitals;

  @override
  Widget build(BuildContext context) {
    final List<_Vital> tiles = _buildTiles();
    if (tiles.isEmpty) return const SizedBox.shrink();

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
          const VisitSectionHeader(
            icon: LucideIcons.activity,
            title: 'العلامات الحيوية',
          ),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (BuildContext context, BoxConstraints c) {
              // Two columns on phones, three on wider tablets/landscape.
              final int columns = c.maxWidth >= 520 ? 3 : 2;
              const double gap = 8;
              final double itemWidth =
                  (c.maxWidth - (gap * (columns - 1))) / columns;
              return Wrap(
                spacing: gap,
                runSpacing: gap,
                children: <Widget>[
                  for (final _Vital t in tiles)
                    SizedBox(
                      width: itemWidth,
                      child: _VitalTile(vital: t),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  List<_Vital> _buildTiles() {
    final List<_Vital> out = <_Vital>[];

    // Blood pressure — combined tile when at least one is present.
    final num? sys = vitals.bloodPressureSystolic;
    final num? dia = vitals.bloodPressureDiastolic;
    if (sys != null || dia != null) {
      final String value = (sys != null && dia != null)
          ? '${_fmt(sys)}/${_fmt(dia)}'
          : (sys != null ? '${_fmt(sys)}/—' : '—/${_fmt(dia!)}');
      out.add(
        _Vital(
          icon: LucideIcons.heartPulse,
          label: 'ضغط الدم',
          value: value,
          unit: 'mmHg',
        ),
      );
    }

    if (vitals.heartRate != null) {
      out.add(
        _Vital(
          icon: LucideIcons.heart,
          label: 'النبض',
          value: _fmt(vitals.heartRate!),
          unit: 'نبضة/د',
        ),
      );
    }
    if (vitals.oxygenSaturation != null) {
      out.add(
        _Vital(
          icon: LucideIcons.activity,
          label: 'الأكسجين',
          value: _fmt(vitals.oxygenSaturation!),
          unit: '%',
        ),
      );
    }
    if (vitals.bloodGlucose != null) {
      out.add(
        _Vital(
          icon: LucideIcons.droplet,
          label: 'سكر الدم',
          value: _fmt(vitals.bloodGlucose!),
          unit: 'mg/dL',
        ),
      );
    }
    if (vitals.temperature != null) {
      out.add(
        _Vital(
          icon: LucideIcons.thermometer,
          label: 'الحرارة',
          value: _fmt(vitals.temperature!),
          unit: '°C',
        ),
      );
    }
    if (vitals.respiratoryRate != null) {
      out.add(
        _Vital(
          icon: LucideIcons.wind,
          label: 'التنفس',
          value: _fmt(vitals.respiratoryRate!),
          unit: 'نفس/د',
        ),
      );
    }
    if (vitals.weight != null) {
      out.add(
        _Vital(
          icon: LucideIcons.scale,
          label: 'الوزن',
          value: _fmt(vitals.weight!),
          unit: 'كغ',
        ),
      );
    }
    if (vitals.height != null) {
      out.add(
        _Vital(
          icon: LucideIcons.ruler,
          label: 'الطول',
          value: _fmt(vitals.height!),
          unit: 'سم',
        ),
      );
    }

    return out;
  }

  static String _fmt(num n) {
    // Avoid showing "37.0" — drop the trailing .0 for integers.
    if (n is int || n == n.truncateToDouble()) {
      return n.toInt().toString();
    }
    return n.toStringAsFixed(1);
  }
}

class _Vital {
  const _Vital({
    required this.icon,
    required this.label,
    required this.value,
    required this.unit,
  });
  final IconData icon;
  final String label;
  final String value;
  final String unit;
}

class _VitalTile extends StatelessWidget {
  const _VitalTile({required this.vital});
  final _Vital vital;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: const BorderRadius.all(Radius.circular(10)),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(vital.icon, size: 14, color: AppColors.action),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  vital.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textSecondary,
                    fontFamily: 'Cairo',
                    height: 1.2,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: <Widget>[
              Text(
                vital.value,
                textDirection: TextDirection.ltr,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primary,
                  fontFamily: 'Inter',
                  height: 1.0,
                ),
              ),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  vital.unit,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textDirection: TextDirection.ltr,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textSecondary,
                    fontFamily: 'Inter',
                    height: 1.0,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
