import 'package:flutter/foundation.dart';

import '../../prescriptions/domain/reminders/adherence_record.dart';
import '../../prescriptions/domain/reminders/reminder_schedule.dart';

/// Aggregate adherence numbers for a half-open date range.
///
/// `expectedDoses` counts every dose every active schedule should produce
/// in `[from, to)`; `takenDoses` counts the distinct adherence records
/// inside that same range. `byDay` is keyed by date-only midnight so the
/// calendar marker builder can look it up cheaply.
@immutable
class AdherenceStats {
  const AdherenceStats({
    required this.expectedDoses,
    required this.takenDoses,
    required this.rate,
    required this.byDay,
  });

  final int expectedDoses;
  final int takenDoses;

  /// `takenDoses / expectedDoses`, clamped to 0 when nothing was expected
  /// so widgets that show a progress bar never receive NaN.
  final double rate;

  /// `dateOnly(midnight) → 0..1 rate for that day`.
  final Map<DateTime, double> byDay;
}

/// Computes adherence statistics over `[from, to)` (exclusive end). Both
/// dates are normalized to midnight before iterating so passing a
/// time-of-day component is harmless.
///
/// Algorithm:
/// 1. Walk every day in the range; for each schedule that is active on
///    that day (via the same `[startDate, endDate)` rule the scheduler
///    uses), increment `expected` by `times.length` and seed
///    `expectedByDay[day]`.
/// 2. Walk the adherence records once; bucket each into its day if the
///    day is inside the range and a matching schedule exists.
/// 3. Derive `byDay` rates by dividing `takenByDay[d] / expectedByDay[d]`.
AdherenceStats statsForRange({
  required DateTime from,
  required DateTime to,
  required List<ReminderSchedule> schedules,
  required List<AdherenceRecord> adherence,
}) {
  final DateTime fromDay = _dateOnly(from);
  final DateTime toDay = _dateOnly(to);

  int expected = 0;
  final Map<DateTime, int> expectedByDay = <DateTime, int>{};

  if (!toDay.isAfter(fromDay)) {
    return const AdherenceStats(
      expectedDoses: 0,
      takenDoses: 0,
      rate: 0,
      byDay: <DateTime, double>{},
    );
  }

  for (DateTime day = fromDay;
      day.isBefore(toDay);
      day = day.add(const Duration(days: 1))) {
    int dayExpected = 0;
    for (final ReminderSchedule s in schedules) {
      if (!s.isEnabled) continue;
      if (day.isBefore(_dateOnly(s.startDate))) continue;
      if (!day.isBefore(_dateOnly(s.endDate))) continue;
      dayExpected += s.times.length;
    }
    expectedByDay[day] = dayExpected;
    expected += dayExpected;
  }

  int taken = 0;
  final Map<DateTime, int> takenByDay = <DateTime, int>{};

  for (final AdherenceRecord r in adherence) {
    if (r.scheduledAt.isBefore(fromDay)) continue;
    if (!r.scheduledAt.isBefore(toDay)) continue;
    final DateTime day = _dateOnly(r.scheduledAt);
    takenByDay[day] = (takenByDay[day] ?? 0) + 1;
    taken++;
  }

  final Map<DateTime, double> byDay = <DateTime, double>{};
  // Only emit days with expected > 0. The calendar marker treats a missing
  // entry as "no schedule" (grey) so we don't want to lie with 0.0 here.
  for (final MapEntry<DateTime, int> entry in expectedByDay.entries) {
    final int e = entry.value;
    if (e == 0) continue;
    final int t = takenByDay[entry.key] ?? 0;
    byDay[entry.key] = t / e;
  }

  return AdherenceStats(
    expectedDoses: expected,
    takenDoses: taken,
    rate: expected == 0 ? 0 : taken / expected,
    byDay: byDay,
  );
}

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);
