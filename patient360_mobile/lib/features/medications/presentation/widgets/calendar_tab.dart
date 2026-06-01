import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:table_calendar/table_calendar.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/adherence_stats.dart';
import '../../domain/scheduled_dose.dart';
import '../providers/medications_providers.dart';
import 'dose_row.dart';
import 'week_strip.dart';

/// Calendar sub-tab. Top: scrollable [WeekStrip]. Middle: month/week
/// [TableCalendar] from `package:table_calendar` with adherence dot markers.
/// Bottom: per-day dose detail card.
class CalendarTab extends ConsumerStatefulWidget {
  const CalendarTab({super.key});

  @override
  ConsumerState<CalendarTab> createState() => _CalendarTabState();
}

class _CalendarTabState extends ConsumerState<CalendarTab> {
  late DateTime _selectedDay;
  DateTime _focusedMonth = DateTime.now();
  CalendarFormat _format = CalendarFormat.month;

  @override
  void initState() {
    super.initState();
    final DateTime now = DateTime.now();
    _selectedDay = DateTime(now.year, now.month, now.day);
    _focusedMonth = _selectedDay;
  }

  void _onDateSelected(DateTime day) {
    final DateTime normalized = DateTime(day.year, day.month, day.day);
    setState(() {
      _selectedDay = normalized;
      _focusedMonth = normalized;
    });
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    // Marker stats for the visible month — single provider read per build
    // because TableCalendar's markerBuilder fires per-cell.
    final DateTime monthStart =
        DateTime(_focusedMonth.year, _focusedMonth.month, 1);
    final DateTime monthEnd =
        DateTime(_focusedMonth.year, _focusedMonth.month + 1, 1);
    final AdherenceStats monthStats = ref.watch(
      adherenceStatsProvider((from: monthStart, to: monthEnd)),
    );

    return ListView(
      padding: const EdgeInsets.fromLTRB(0, 12, 0, 32),
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Container(
            decoration: BoxDecoration(
              color: scheme.surfaceContainer,
              borderRadius: AppRadii.radiusLg,
              border: Border.all(color: scheme.outline),
            ),
            child: WeekStrip(
              selectedDate: _selectedDay,
              onDateSelected: _onDateSelected,
            ),
          ),
        ),
        const SizedBox(height: 16),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Container(
            decoration: BoxDecoration(
              color: scheme.surfaceContainer,
              borderRadius: AppRadii.radiusLg,
              border: Border.all(color: scheme.outline),
            ),
            child: Column(
              children: <Widget>[
                _FormatToggle(
                  format: _format,
                  onChanged: (CalendarFormat f) =>
                      setState(() => _format = f),
                ),
                _buildTableCalendar(monthStats),
                const SizedBox(height: 8),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: DayDetailCard(date: _selectedDay),
        ),
      ],
    );
  }

  Widget _buildTableCalendar(AdherenceStats monthStats) {
    return TableCalendar<void>(
      locale: 'ar_SA',
      firstDay: DateTime.utc(2020, 1, 1),
      lastDay: DateTime.utc(2035, 12, 31),
      focusedDay: _focusedMonth,
      currentDay: DateTime.now(),
      calendarFormat: _format,
      availableCalendarFormats: const <CalendarFormat, String>{
        CalendarFormat.month: 'شهر',
        CalendarFormat.week: 'أسبوع',
      },
      headerStyle: const HeaderStyle(
        titleCentered: true,
        formatButtonVisible: false,
        titleTextStyle: TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 15,
        ),
      ),
      daysOfWeekStyle: const DaysOfWeekStyle(
        weekdayStyle: TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
        weekendStyle: TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
      ),
      calendarStyle: CalendarStyle(
        outsideDaysVisible: false,
        todayDecoration: BoxDecoration(
          color: AppColors.accent.withValues(alpha: 0.40),
          shape: BoxShape.circle,
        ),
        selectedDecoration: const BoxDecoration(
          color: AppColors.primary,
          shape: BoxShape.circle,
        ),
        selectedTextStyle: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
        ),
      ),
      selectedDayPredicate: (DateTime d) =>
          d.year == _selectedDay.year &&
          d.month == _selectedDay.month &&
          d.day == _selectedDay.day,
      onDaySelected: (DateTime selected, DateTime focused) {
        _onDateSelected(selected);
      },
      onPageChanged: (DateTime focused) {
        setState(() => _focusedMonth = focused);
      },
      onFormatChanged: (CalendarFormat f) {
        setState(() => _format = f);
      },
      calendarBuilders: CalendarBuilders<void>(
        markerBuilder: (BuildContext _, DateTime day, __) {
          final DateTime keyDay = DateTime(day.year, day.month, day.day);
          final double? rate = monthStats.byDay[keyDay];
          if (rate == null) return const SizedBox.shrink();
          final Color color = _markerColor(rate, day);
          return Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Align(
              alignment: Alignment.bottomCenter,
              child: Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  static Color _markerColor(double rate, DateTime day) {
    final DateTime today = DateTime.now();
    final DateTime dayOnly = DateTime(day.year, day.month, day.day);
    final DateTime todayOnly = DateTime(today.year, today.month, today.day);
    final bool isFuture = dayOnly.isAfter(todayOnly);
    if (isFuture) return const Color(0xFFBDBDBD);
    if (rate >= 1.0) return AppColors.success;
    if (rate >= 0.5) return AppColors.warning;
    return AppColors.error;
  }
}

class _FormatToggle extends StatelessWidget {
  const _FormatToggle({required this.format, required this.onChanged});
  final CalendarFormat format;
  final ValueChanged<CalendarFormat> onChanged;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: <Widget>[
          for (final CalendarFormat f in <CalendarFormat>[
            CalendarFormat.month,
            CalendarFormat.week,
          ])
            Padding(
              padding: const EdgeInsetsDirectional.only(start: 4),
              child: Material(
                color: format == f
                    ? AppColors.action
                    : Colors.transparent,
                borderRadius: AppRadii.radiusSm,
                child: InkWell(
                  borderRadius: AppRadii.radiusSm,
                  onTap: () => onChanged(f),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    child: Text(
                      f == CalendarFormat.month ? 'شهر' : 'أسبوع',
                      style: TextStyle(
                        color: format == f
                            ? Colors.white
                            : scheme.onSurfaceVariant,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Per-day list of doses. Past dates are rendered read-only — the patient
/// can no longer mark them taken (medical-integrity guardrail). Future
/// dates render the doses but the checkbox is disabled.
class DayDetailCard extends ConsumerWidget {
  const DayDetailCard({required this.date, super.key});

  final DateTime date;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final List<ScheduledDose> doses =
        ref.watch(dosesForDateProvider(_dateOnly(date)));

    final DateTime now = DateTime.now();
    final DateTime today = DateTime(now.year, now.month, now.day);
    final DateTime selected = _dateOnly(date);
    final bool isPast = selected.isBefore(today);
    final bool isFuture = selected.isAfter(today);

    final String formatted = _formatArabicDate(date);

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(
                LucideIcons.calendarDays,
                size: 18,
                color: scheme.onSurfaceVariant,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'جرعات $formatted',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (doses.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: Text(
                  'لا توجد جرعات في هذا اليوم',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                ),
              ),
            )
          else
            for (final ScheduledDose d in doses)
              DoseRow(
                dose: d,
                readOnly: isPast,
                disabled: isFuture,
              ),
        ],
      ),
    );
  }

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  /// Arabic-localized "EEEE، d MMMM y" — relies on flutter_localizations
  /// already loaded by the root MaterialApp.
  static String _formatArabicDate(DateTime d) {
    return intl.DateFormat('EEEE، d MMMM y', 'ar').format(d);
  }
}
