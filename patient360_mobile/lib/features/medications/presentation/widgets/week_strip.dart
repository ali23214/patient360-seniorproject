import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/adherence_stats.dart';
import '../providers/medications_providers.dart';

/// Horizontally scrollable 7-cell week view with adherence dots.
///
/// Always shows 7 days centered on today by default. Dragging horizontally
/// pans the window. Tapping a cell calls [onDateSelected].
class WeekStrip extends ConsumerStatefulWidget {
  const WeekStrip({
    required this.selectedDate,
    required this.onDateSelected,
    super.key,
  });

  final DateTime selectedDate;
  final ValueChanged<DateTime> onDateSelected;

  @override
  ConsumerState<WeekStrip> createState() => _WeekStripState();
}

class _WeekStripState extends ConsumerState<WeekStrip> {
  /// Anchor day for the visible 7-day window. Updated on horizontal drag.
  late DateTime _anchor;

  static const List<String> _arabicDayAbbreviations = <String>[
    'إث', 'ث', 'أر', 'خ', 'ج', 'س', 'أح',
  ];

  @override
  void initState() {
    super.initState();
    _anchor = _dateOnly(widget.selectedDate);
  }

  @override
  void didUpdateWidget(covariant WeekStrip oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_isSameDay(widget.selectedDate, oldWidget.selectedDate)) {
      // External selection (e.g. from TableCalendar) — re-center the strip
      // so the highlighted day stays visible.
      setState(() => _anchor = _dateOnly(widget.selectedDate));
    }
  }

  @override
  Widget build(BuildContext context) {
    final List<DateTime> days = <DateTime>[
      for (int i = -3; i <= 3; i++) _anchor.add(Duration(days: i)),
    ];
    final DateTime windowFrom = days.first;
    final DateTime windowTo = days.last.add(const Duration(days: 1));

    final AdherenceStats stats = ref.watch(
      adherenceStatsProvider((from: windowFrom, to: windowTo)),
    );

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onHorizontalDragEnd: (DragEndDetails d) {
        final double vx = d.velocity.pixelsPerSecond.dx;
        if (vx.abs() < 200) return;
        // RTL: swiping right (positive vx) moves to *earlier* days.
        final int direction = vx > 0 ? -1 : 1;
        setState(
          () => _anchor = _anchor.add(Duration(days: direction * 7)),
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            for (final DateTime d in days)
              Expanded(
                child: _DayCell(
                  date: d,
                  isToday: _isSameDay(d, DateTime.now()),
                  isSelected: _isSameDay(d, widget.selectedDate),
                  rate: stats.byDay[_dateOnly(d)],
                  arabicDayAbbreviation:
                      _arabicDayAbbreviations[(d.weekday - 1) % 7],
                  onTap: () => widget.onDateSelected(d),
                ),
              ),
          ],
        ),
      ),
    );
  }

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);
  static bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.date,
    required this.isToday,
    required this.isSelected,
    required this.rate,
    required this.arabicDayAbbreviation,
    required this.onTap,
  });

  final DateTime date;
  final bool isToday;
  final bool isSelected;
  final double? rate;
  final String arabicDayAbbreviation;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final bool inFuture = date.isAfter(DateTime.now()) && !isToday;
    final Color bg = isSelected
        ? AppColors.action
        : (isToday ? AppColors.action.withValues(alpha: 0.12) : Colors.transparent);
    final Color fg = isSelected
        ? Colors.white
        : (isToday ? AppColors.action : scheme.onSurface);

    return InkWell(
      borderRadius: AppRadii.radiusMd,
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 2),
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: AppRadii.radiusMd,
          border: isToday && !isSelected
              ? Border.all(color: AppColors.action, width: 1)
              : null,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text(
              arabicDayAbbreviation,
              style: TextStyle(
                color: fg,
                fontSize: 11,
                fontWeight: FontWeight.w600,
                height: 1.0,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              date.day.toString(),
              textDirection: TextDirection.ltr,
              style: TextStyle(
                color: fg,
                fontSize: 16,
                fontWeight: FontWeight.w800,
                height: 1.0,
              ),
            ),
            const SizedBox(height: 6),
            _AdherenceDot(rate: rate, isFuture: inFuture, onAction: isSelected),
          ],
        ),
      ),
    );
  }
}

class _AdherenceDot extends StatelessWidget {
  const _AdherenceDot({
    required this.rate,
    required this.isFuture,
    required this.onAction,
  });

  final double? rate;
  final bool isFuture;
  final bool onAction;

  @override
  Widget build(BuildContext context) {
    final Color color = _colorFor(rate, isFuture, onAction);
    return Container(
      width: 6,
      height: 6,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
      ),
    );
  }

  static Color _colorFor(double? rate, bool isFuture, bool onAction) {
    if (isFuture || rate == null) {
      return onAction
          ? Colors.white.withValues(alpha: 0.50)
          : const Color(0xFFBDBDBD);
    }
    if (rate >= 1.0) return AppColors.success;
    if (rate >= 0.5) return AppColors.warning;
    return AppColors.error;
  }
}
