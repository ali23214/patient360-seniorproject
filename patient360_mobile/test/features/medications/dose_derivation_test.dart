import 'package:flutter_test/flutter_test.dart';
import 'package:patient360_mobile/features/medications/domain/dose_derivation.dart';
import 'package:patient360_mobile/features/medications/domain/scheduled_dose.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/adherence_record.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/reminder_schedule.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/time_of_day_dto.dart';

ReminderSchedule _schedule({
  required String id,
  required String prescriptionId,
  required List<TimeOfDayDto> times,
  bool enabled = true,
  DateTime? start,
  DateTime? end,
}) {
  final DateTime created = DateTime(2026, 4, 1);
  return ReminderSchedule(
    id: id,
    prescriptionId: prescriptionId,
    medicationIndex: 0,
    medicationName: 'Cipro',
    dosage: '500mg',
    times: times,
    startDate: start ?? DateTime(2026, 4, 1),
    endDate: end ?? DateTime(2026, 6, 1),
    isEnabled: enabled,
    createdAt: created,
    updatedAt: created,
  );
}

AdherenceRecord _adherence({
  required String prescriptionId,
  required DateTime scheduledAt,
}) {
  return AdherenceRecord(
    id: 'a-${scheduledAt.toIso8601String()}',
    prescriptionId: prescriptionId,
    medicationIndex: 0,
    scheduledAt: scheduledAt,
    takenAt: scheduledAt.add(const Duration(minutes: 4)),
    createdAt: scheduledAt.add(const Duration(minutes: 4)),
  );
}

void main() {
  group('computeDoseWindow', () {
    final DateTime now = DateTime(2026, 4, 26, 14, 0);

    test('upcoming when scheduledAt > now + 30min', () {
      expect(
        computeDoseWindow(
          scheduledAt: now.add(const Duration(minutes: 31)),
          now: now,
          isTaken: false,
        ),
        DoseWindow.upcoming,
      );
    });

    test('current at exact scheduledAt', () {
      expect(
        computeDoseWindow(
          scheduledAt: now,
          now: now,
          isTaken: false,
        ),
        DoseWindow.current,
      );
    });

    test('current at the +30min boundary', () {
      expect(
        computeDoseWindow(
          scheduledAt: now.add(const Duration(minutes: 30)),
          now: now,
          isTaken: false,
        ),
        DoseWindow.current,
      );
    });

    test('current at the -30min boundary', () {
      expect(
        computeDoseWindow(
          scheduledAt: now.subtract(const Duration(minutes: 30)),
          now: now,
          isTaken: false,
        ),
        DoseWindow.current,
      );
    });

    test('overdue between 30 minutes and 4 hours past', () {
      expect(
        computeDoseWindow(
          scheduledAt: now.subtract(const Duration(hours: 1)),
          now: now,
          isTaken: false,
        ),
        DoseWindow.overdue,
      );
    });

    test('overdue just before 4 hours past', () {
      expect(
        computeDoseWindow(
          scheduledAt:
              now.subtract(const Duration(hours: 3, minutes: 59)),
          now: now,
          isTaken: false,
        ),
        DoseWindow.overdue,
      );
    });

    test('missed at exactly 4 hours past', () {
      expect(
        computeDoseWindow(
          scheduledAt: now.subtract(const Duration(hours: 4)),
          now: now,
          isTaken: false,
        ),
        DoseWindow.missed,
      );
    });

    test('missed when more than 4 hours past', () {
      expect(
        computeDoseWindow(
          scheduledAt: now.subtract(const Duration(hours: 6)),
          now: now,
          isTaken: false,
        ),
        DoseWindow.missed,
      );
    });

    test('taken wins over every other state', () {
      // 6 hours past would be `missed` without an adherence record.
      expect(
        computeDoseWindow(
          scheduledAt: now.subtract(const Duration(hours: 6)),
          now: now,
          isTaken: true,
        ),
        DoseWindow.taken,
      );
    });
  });

  group('deriveDosesForDate', () {
    final DateTime today = DateTime(2026, 4, 26);
    final DateTime now = DateTime(2026, 4, 26, 14, 0);

    test('returns empty when no schedules', () {
      expect(
        deriveDosesForDate(
          date: today,
          schedules: const <ReminderSchedule>[],
          adherence: const <AdherenceRecord>[],
          now: now,
        ),
        isEmpty,
      );
    });

    test('skips disabled schedules', () {
      final ReminderSchedule s = _schedule(
        id: 's1',
        prescriptionId: 'rx1',
        times: <TimeOfDayDto>[const TimeOfDayDto(hour: 8, minute: 0)],
        enabled: false,
      );
      expect(
        deriveDosesForDate(
          date: today,
          schedules: <ReminderSchedule>[s],
          adherence: const <AdherenceRecord>[],
          now: now,
        ),
        isEmpty,
      );
    });

    test('skips schedules whose date range excludes the query day', () {
      final ReminderSchedule before = _schedule(
        id: 's-before',
        prescriptionId: 'rx',
        times: <TimeOfDayDto>[const TimeOfDayDto(hour: 8, minute: 0)],
        end: DateTime(2026, 4, 20),
      );
      final ReminderSchedule after = _schedule(
        id: 's-after',
        prescriptionId: 'rx',
        times: <TimeOfDayDto>[const TimeOfDayDto(hour: 8, minute: 0)],
        start: DateTime(2026, 5, 1),
      );
      expect(
        deriveDosesForDate(
          date: today,
          schedules: <ReminderSchedule>[before, after],
          adherence: const <AdherenceRecord>[],
          now: now,
        ),
        isEmpty,
      );
    });

    test('sorts the doses ascending by scheduledAt', () {
      final ReminderSchedule s = _schedule(
        id: 's1',
        prescriptionId: 'rx1',
        times: <TimeOfDayDto>[
          const TimeOfDayDto(hour: 22, minute: 0),
          const TimeOfDayDto(hour: 8, minute: 0),
          const TimeOfDayDto(hour: 14, minute: 0),
        ],
      );
      final List<ScheduledDose> doses = deriveDosesForDate(
        date: today,
        schedules: <ReminderSchedule>[s],
        adherence: const <AdherenceRecord>[],
        now: now,
      );
      expect(doses.map((ScheduledDose d) => d.scheduledAt.hour),
          <int>[8, 14, 22]);
    });

    test('classifies the 5 lifecycle states correctly on one day', () {
      final ReminderSchedule s = _schedule(
        id: 's1',
        prescriptionId: 'rx1',
        times: <TimeOfDayDto>[
          const TimeOfDayDto(hour: 8, minute: 0), // -6h missed
          const TimeOfDayDto(hour: 12, minute: 0), // -2h overdue
          const TimeOfDayDto(hour: 14, minute: 0), // 0 current
          const TimeOfDayDto(hour: 16, minute: 0), // +2h upcoming
          const TimeOfDayDto(hour: 20, minute: 0), // +6h upcoming, marked taken
        ],
      );
      final List<AdherenceRecord> records = <AdherenceRecord>[
        _adherence(
          prescriptionId: 'rx1',
          scheduledAt: DateTime(2026, 4, 26, 20),
        ),
      ];
      final Map<int, DoseWindow> byHour = <int, DoseWindow>{
        for (final ScheduledDose d in deriveDosesForDate(
          date: today,
          schedules: <ReminderSchedule>[s],
          adherence: records,
          now: now,
        ))
          d.scheduledAt.hour: d.window,
      };

      expect(byHour[8], DoseWindow.missed);
      expect(byHour[12], DoseWindow.overdue);
      expect(byHour[14], DoseWindow.current);
      expect(byHour[16], DoseWindow.upcoming);
      expect(byHour[20], DoseWindow.taken);
    });

    test(
        'matches adherence within ±1 minute tolerance when timestamps drift',
        () {
      final ReminderSchedule s = _schedule(
        id: 's1',
        prescriptionId: 'rx1',
        times: <TimeOfDayDto>[const TimeOfDayDto(hour: 8, minute: 0)],
      );
      final List<AdherenceRecord> records = <AdherenceRecord>[
        // Stored 30s after the canonical scheduledAt — should still match.
        AdherenceRecord(
          id: 'a',
          prescriptionId: 'rx1',
          medicationIndex: 0,
          scheduledAt: DateTime(2026, 4, 26, 8, 0, 30),
          takenAt: DateTime(2026, 4, 26, 8, 5),
          createdAt: DateTime(2026, 4, 26, 8, 5),
        ),
      ];
      final List<ScheduledDose> doses = deriveDosesForDate(
        date: today,
        schedules: <ReminderSchedule>[s],
        adherence: records,
        now: now,
      );
      expect(doses, hasLength(1));
      expect(doses.first.window, DoseWindow.taken);
      expect(doses.first.isTaken, isTrue);
    });
  });
}
