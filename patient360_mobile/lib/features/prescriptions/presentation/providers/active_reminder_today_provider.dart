import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/reminders/reminder_schedule.dart';
import '../../domain/reminders/time_of_day_dto.dart';
import 'reminders_provider.dart';

/// One dose due in the near future (or just past — see [delta]).
@immutable
class UpcomingDose {
  const UpcomingDose({
    required this.schedule,
    required this.scheduledAt,
    required this.delta,
  });

  final ReminderSchedule schedule;
  final DateTime scheduledAt;

  /// Positive when the dose is in the future (e.g. `+15min`), negative when
  /// already past (`-5min` = "5 minutes late"). Recomputed on every emit so
  /// the UI never shows stale text.
  final Duration delta;

  bool get isLate => delta.isNegative;
  int get minutesUntil => delta.inMinutes;
  int get minutesLate => -delta.inMinutes;
}

/// Stream-style provider that re-emits the list of doses due within the
/// next 60 minutes (or up to 30 minutes late) every wall-clock minute. The
/// home hero card uses the head of the list as the single "next dose"
/// chip.
final StreamProvider<List<UpcomingDose>> activeReminderTodayProvider =
    StreamProvider<List<UpcomingDose>>(
  (Ref ref) {
    final StreamController<List<UpcomingDose>> controller =
        StreamController<List<UpcomingDose>>();

    void emit() {
      final List<ReminderSchedule> schedules =
          ref.read(remindersProvider).value ?? <ReminderSchedule>[];
      controller.add(_computeUpcoming(schedules, DateTime.now()));
    }

    // Re-emit whenever the underlying schedule list changes.
    ref.listen<AsyncValue<List<ReminderSchedule>>>(
      remindersProvider,
      (_, __) => emit(),
    );

    emit();
    final Timer timer =
        Timer.periodic(const Duration(minutes: 1), (Timer _) => emit());

    ref.onDispose(() {
      timer.cancel();
      controller.close();
    });

    return controller.stream;
  },
);

/// Pure helper, exported for unit tests. Returns the doses whose
/// scheduledAt falls within `[now - 30min, now + 60min]` and whose schedule
/// is enabled. Sorted ascending by [UpcomingDose.scheduledAt].
@visibleForTesting
List<UpcomingDose> computeUpcomingDoses(
  List<ReminderSchedule> schedules,
  DateTime now,
) =>
    _computeUpcoming(schedules, now);

List<UpcomingDose> _computeUpcoming(
  List<ReminderSchedule> schedules,
  DateTime now,
) {
  final DateTime windowStart = now.subtract(const Duration(minutes: 30));
  final DateTime windowEnd = now.add(const Duration(minutes: 60));
  final DateTime today = DateTime(now.year, now.month, now.day);
  final DateTime tomorrow = today.add(const Duration(days: 1));

  final List<UpcomingDose> out = <UpcomingDose>[];

  for (final ReminderSchedule s in schedules) {
    if (!s.isEnabled) continue;
    for (final TimeOfDayDto t in s.times) {
      // Check today and tomorrow (handles a 23:50 dose seen at 00:30).
      for (final DateTime day in <DateTime>[today, tomorrow]) {
        final DateTime when = DateTime(
          day.year,
          day.month,
          day.day,
          t.hour,
          t.minute,
        );
        if (when.isBefore(_dateOnly(s.startDate))) continue;
        if (!when.isBefore(_dateOnly(s.endDate))) continue;
        if (when.isBefore(windowStart) || when.isAfter(windowEnd)) {
          continue;
        }
        out.add(
          UpcomingDose(
            schedule: s,
            scheduledAt: when,
            delta: when.difference(now),
          ),
        );
      }
    }
  }

  out.sort(
    (UpcomingDose a, UpcomingDose b) =>
        a.scheduledAt.compareTo(b.scheduledAt),
  );
  return out;
}

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);
