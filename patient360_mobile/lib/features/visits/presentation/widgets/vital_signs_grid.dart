import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/vital_signs.dart';

/// Severity of a single vital reading. Drives both the cell tint and the
/// (optional) warning icon. Levels are intentionally coarse — clinical
/// triage happens server-side; this is just visual signalling.
enum VitalSeverity { normal, warning, critical }

/// 3-column grid of vital readings. Renders only the cells whose value is
/// non-null, then color-codes them per WHO/AHA-derived thresholds.
class VitalSignsGrid extends StatelessWidget {
  const VitalSignsGrid({required this.vitals, super.key});

  final VitalSigns vitals;

  @override
  Widget build(BuildContext context) {
    final List<_Cell> cells = _buildCells(vitals);
    if (cells.isEmpty) return const SizedBox.shrink();

    return LayoutBuilder(
      builder: (BuildContext ctx, BoxConstraints c) {
        final double cellWidth = (c.maxWidth - 16) / 3;
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: <Widget>[
            for (final _Cell cell in cells)
              SizedBox(width: cellWidth, child: _VitalCell(cell: cell)),
          ],
        );
      },
    );
  }

  static List<_Cell> _buildCells(VitalSigns v) {
    final VitalSeverity bpSev = _bpSeverity(
      v.bloodPressureSystolic,
      v.bloodPressureDiastolic,
    );
    final List<_Cell> out = <_Cell>[];

    if (v.bloodPressureSystolic != null) {
      out.add(_Cell(
        icon: LucideIcons.activity,
        label: 'الضغط الانقباضي',
        value: _fmt(v.bloodPressureSystolic),
        unit: VitalSigns.units['bloodPressureSystolic']!,
        severity: bpSev,
      ));
    }
    if (v.bloodPressureDiastolic != null) {
      out.add(_Cell(
        icon: LucideIcons.activity,
        label: 'الضغط الانبساطي',
        value: _fmt(v.bloodPressureDiastolic),
        unit: VitalSigns.units['bloodPressureDiastolic']!,
        severity: bpSev,
      ));
    }
    if (v.heartRate != null) {
      out.add(_Cell(
        icon: LucideIcons.heart,
        label: 'النبض',
        value: _fmt(v.heartRate),
        unit: VitalSigns.units['heartRate']!,
        severity: _hrSeverity(v.heartRate!),
      ));
    }
    if (v.oxygenSaturation != null) {
      out.add(_Cell(
        icon: LucideIcons.droplets,
        label: 'الأكسجين',
        value: _fmt(v.oxygenSaturation),
        unit: VitalSigns.units['oxygenSaturation']!,
        severity: _spo2Severity(v.oxygenSaturation!),
      ));
    }
    if (v.bloodGlucose != null) {
      out.add(_Cell(
        icon: LucideIcons.droplet,
        label: 'سكر الدم',
        value: _fmt(v.bloodGlucose),
        unit: VitalSigns.units['bloodGlucose']!,
        severity: _glucoseSeverity(v.bloodGlucose!),
      ));
    }
    if (v.temperature != null) {
      out.add(_Cell(
        icon: LucideIcons.thermometer,
        label: 'الحرارة',
        value: _fmt(v.temperature),
        unit: VitalSigns.units['temperature']!,
        severity: _tempSeverity(v.temperature!),
      ));
    }
    if (v.weight != null) {
      out.add(_Cell(
        icon: LucideIcons.scale,
        label: 'الوزن',
        value: _fmt(v.weight),
        unit: VitalSigns.units['weight']!,
        severity: VitalSeverity.normal,
      ));
    }
    if (v.height != null) {
      out.add(_Cell(
        icon: LucideIcons.ruler,
        label: 'الطول',
        value: _fmt(v.height),
        unit: VitalSigns.units['height']!,
        severity: VitalSeverity.normal,
      ));
    }
    if (v.respiratoryRate != null) {
      out.add(_Cell(
        icon: LucideIcons.wind,
        label: 'التنفس',
        value: _fmt(v.respiratoryRate),
        unit: VitalSigns.units['respiratoryRate']!,
        severity: VitalSeverity.normal,
      ));
    }
    return out;
  }

  // ───────── threshold helpers — exposed for tests ─────────

  /// Hypertension stage 2 (≥180/120) is critical; stage 1 (≥140/90) is
  /// warning; everything else is normal. Lower bounds (hypotension) are
  /// intentionally not flagged here — the doctor's UI handles that.
  static VitalSeverity _bpSeverity(num? sys, num? dia) {
    final num s = sys ?? 0;
    final num d = dia ?? 0;
    if (s >= 180 || d >= 120) return VitalSeverity.critical;
    if (s >= 140 || d >= 90) return VitalSeverity.warning;
    return VitalSeverity.normal;
  }

  static VitalSeverity _hrSeverity(num hr) {
    if (hr < 60 || hr > 100) return VitalSeverity.warning;
    return VitalSeverity.normal;
  }

  static VitalSeverity _spo2Severity(num spo2) {
    if (spo2 < 90) return VitalSeverity.critical;
    if (spo2 < 95) return VitalSeverity.warning;
    return VitalSeverity.normal;
  }

  static VitalSeverity _tempSeverity(num t) {
    if (t > 39.5) return VitalSeverity.critical;
    if (t > 38) return VitalSeverity.warning;
    return VitalSeverity.normal;
  }

  static VitalSeverity _glucoseSeverity(num g) {
    if (g > 180) return VitalSeverity.warning;
    return VitalSeverity.normal;
  }

  /// Public accessor used by tests to verify threshold logic without
  /// rendering the widget tree.
  @visibleForTesting
  static VitalSeverity bpSeverityFor(num? sys, num? dia) =>
      _bpSeverity(sys, dia);

  static String _fmt(num? v) {
    if (v == null) return '—';
    if (v % 1 == 0) return v.toInt().toString();
    return v.toStringAsFixed(1);
  }
}

class _Cell {
  const _Cell({
    required this.icon,
    required this.label,
    required this.value,
    required this.unit,
    required this.severity,
  });
  final IconData icon;
  final String label;
  final String value;
  final String unit;
  final VitalSeverity severity;
}

class _VitalCell extends StatelessWidget {
  const _VitalCell({required this.cell});
  final _Cell cell;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final (Color bg, Color fg, Color border) = switch (cell.severity) {
      VitalSeverity.critical => (
          AppColors.error.withValues(alpha: 0.12),
          AppColors.error,
          AppColors.error.withValues(alpha: 0.45),
        ),
      VitalSeverity.warning => (
          AppColors.warning.withValues(alpha: 0.12),
          AppColors.warning,
          AppColors.warning.withValues(alpha: 0.45),
        ),
      VitalSeverity.normal => (
          scheme.surface,
          scheme.onSurface,
          scheme.outline,
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: AppRadii.radiusMd,
        border: Border.all(color: border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(cell.icon, size: 14, color: fg),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  cell.label,
                  style: TextStyle(
                    fontSize: 11,
                    color: scheme.onSurfaceVariant,
                    fontWeight: FontWeight.w500,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text.rich(
            TextSpan(
              children: <InlineSpan>[
                TextSpan(
                  text: cell.value,
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: fg,
                  ),
                ),
                const TextSpan(text: ' '),
                TextSpan(
                  text: cell.unit,
                  style: TextStyle(
                    fontSize: 10,
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
            textDirection: TextDirection.ltr,
          ),
        ],
      ),
    );
  }
}
