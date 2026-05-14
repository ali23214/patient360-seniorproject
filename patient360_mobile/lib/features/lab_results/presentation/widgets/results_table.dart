import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/test_result_row.dart';

/// 3-column result table: name / value+unit / reference range. Critical
/// rows tint the whole row red and lead with [LucideIcons.octagonAlert];
/// abnormal rows tint amber and lead with [LucideIcons.triangleAlert];
/// normal rows have no tint.
///
/// Designed to render inside an expanded card so it sets `shrinkWrap`
/// behavior implicitly via fixed [Column] children rather than a
/// scrollable [DataTable].
class ResultsTable extends StatelessWidget {
  const ResultsTable({required this.results, super.key});

  final List<TestResultRow> results;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    if (results.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Text(
          'لم تصدر النتائج بعد.',
          style: Theme.of(context)
              .textTheme
              .bodyMedium
              ?.copyWith(color: scheme.onSurfaceVariant),
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: AppRadii.radiusMd,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        children: <Widget>[
          _HeaderRow(scheme: scheme),
          for (int i = 0; i < results.length; i++)
            _ResultRow(
              row: results[i],
              isLast: i == results.length - 1,
            ),
        ],
      ),
    );
  }
}

class _HeaderRow extends StatelessWidget {
  const _HeaderRow({required this.scheme});
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    final TextStyle? base = Theme.of(context).textTheme.labelMedium?.copyWith(
          color: scheme.onSurfaceVariant,
          fontWeight: FontWeight.w700,
        );
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: scheme.surface.withValues(alpha: 0.40),
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(8),
          topRight: Radius.circular(8),
        ),
      ),
      child: Row(
        children: <Widget>[
          Expanded(flex: 5, child: Text('الفحص', style: base)),
          Expanded(flex: 4, child: Text('القيمة', style: base)),
          Expanded(
            flex: 4,
            child: Text('المعدل الطبيعي', style: base, maxLines: 1),
          ),
        ],
      ),
    );
  }
}

class _ResultRow extends StatelessWidget {
  const _ResultRow({required this.row, required this.isLast});
  final TestResultRow row;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final _RowStyle style = _styleFor(row);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: style.background,
        border: Border(
          bottom: BorderSide(
            color: isLast ? Colors.transparent : scheme.outline,
            width: 0.5,
          ),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Expanded(
            flex: 5,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                if (style.leadingIcon != null) ...<Widget>[
                  Icon(
                    style.leadingIcon,
                    size: 16,
                    color: style.foreground,
                  ),
                  const SizedBox(width: 6),
                ],
                Expanded(
                  child: Text(
                    row.testName,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: style.foreground,
                          fontWeight: FontWeight.w600,
                        ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 4,
            child: _ValueCell(row: row, foreground: style.foreground),
          ),
          Expanded(
            flex: 4,
            child: Text(
              (row.referenceRange ?? '').isEmpty ? '—' : row.referenceRange!,
              textDirection: TextDirection.ltr,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  static _RowStyle _styleFor(TestResultRow row) {
    if (row.isCritical) {
      return const _RowStyle(
        background: Color(0x22D32F2F),
        foreground: AppColors.error,
        leadingIcon: LucideIcons.octagonAlert,
      );
    }
    if (row.isAbnormal) {
      return const _RowStyle(
        background: Color(0x22F57C00),
        foreground: AppColors.warning,
        leadingIcon: LucideIcons.triangleAlert,
      );
    }
    return const _RowStyle(
      background: Colors.transparent,
      foreground: AppColors.textPrimary,
      leadingIcon: null,
    );
  }
}

class _ValueCell extends StatelessWidget {
  const _ValueCell({required this.row, required this.foreground});
  final TestResultRow row;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    // Numeric values render LTR (latin digits + unit) so 5.4 mg/dL stays
    // visually grouped. String values like "POSITIVE" remain auto-direction.
    final bool numeric = row.numericValue != null;
    final String displayValue = row.value;
    final String unit = row.unit ?? '';
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        Flexible(
          child: Text(
            unit.isEmpty ? displayValue : '$displayValue $unit',
            textDirection: numeric ? TextDirection.ltr : null,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: foreground,
                  fontWeight: FontWeight.w700,
                  fontFamily: numeric ? 'Inter' : null,
                ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

class _RowStyle {
  const _RowStyle({
    required this.background,
    required this.foreground,
    required this.leadingIcon,
  });
  final Color background;
  final Color foreground;
  final IconData? leadingIcon;
}
