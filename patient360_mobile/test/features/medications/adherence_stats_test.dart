import 'package:flutter_test/flutter_test.dart';
import 'package:patient360_mobile/features/medications/domain/adherence_stats.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/adherence_record.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/reminder_schedule.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/time_of_day_dto.dart';

ReminderSchedule _schedule({
  required String id,
  required List<TimeOfDayDto> times,
  bool enabled = true,
  DateTime? start,
  DateTime? end,
}) {
  final DateTime created = DateTime(2026, 4, 1);
  return ReminderSchedule(
    id: id,
    prescriptionId: 'rx-$id',
    medicationIndex: 0,
    medicationName: 'M',
    dosage: '1',
    times: times,
    startDate: start ?? DateTime(2026, 4, 1),
    endDate: end ?? DateTime(2026, 6, 1),
    isEnabled: enabled,
    createdAt: created,
    updatedAt: created,
  );
}

AdherenceRecord _record({
  required String prescriptionId,
  required DateTime scheduledAt,
}) =>
    AdherenceRecord(
      id: '${prescriptionId}_${scheduledAt.toIso8601String()}',
      prescriptionId: prescriptionId,
      medicationIndex: 0,
      scheduledAt: scheduledAt,
      takenAt: scheduledAt,
      createdAt: scheduledAt,
    );

void main() {
  group('statsForRange', () {
    test('returns rate=0 (not NaN) when no doses are expected', () {
      final AdherenceStats stats = statsForRange(
        from: DateTime(2026, 4, 26),
        to: DateTime(2026, 4, 27),
        schedules: const <ReminderSchedule>[],
        adherence: const <AdherenceRecord>[],
      );
      expect(stats.expectedDoses, 0);
      expect(stats.takenDoses, 0);
      expect(stats.rate, 0);
      expect(stats.rate.isNaN, isFalse);
      expect(stats.byDay, isEmpty);
    });

    test('returns rate=0 (not NaN) when range is empty', () {
      final AdherenceStats stats = statsForRange(
        from: DateTime(2026, 4, 26),
        to: DateTime(2026, 4, 26),
        schedules: <ReminderSchedule>[
          _schedule(
            id: 's',
            times: <TimeOfDayDto>[const TimeOfDayDto(hour: 8, minute: 0)],
          ),
        ],
        adherence: const <AdherenceRecord>[],
      );
      expect(stats.expectedDoses, 0);
      expect(stats.rate, 0);
      expect(stats.byDay, isEmpty);
    });

    test('counts every dose × every day in the range', () {
      // 7-day window × 2 doses/day = 14 expected.
      final AdherenceStats stats = statsForRange(
        from: DateTime(2026, 4, 20),
        to: DateTime(2026, 4, 27),
        schedules: <ReminderSchedule>[
          _schedule(
            id: 's',
            times: <TimeOfDayDto>[
              const TimeOfDayDto(hour: 8, minute: 0),
              const TimeOfDayDto(hour: 20, minute: 0),
            ],
          ),
        ],
        adherence: const <AdherenceRecord>[],
      );
      expect(stats.expectedDoses, 14);
      expect(stats.takenDoses, 0);
      expect(stats.rate, 0);
      expect(stats.byDay.length, 7);
      for (final double r in stats.byDay.values) {
        expect(r, 0);
      }
    });

    test('rate is takenDoses / expectedDoses for partial weeks', () {
      // 7 days × 1 dose = 7 expected; 4 taken → rate = 4/7.
      final List<AdherenceRecord> records = <AdherenceRecord>[
        for (int i = 0; i < 4; i++)
          _record(
            prescriptionId: 'rx-s',
            scheduledAt: DateTime(2026, 4, 20 + i, 8, 0),
          ),
      ];
      final AdherenceStats stats = statsForRange(
        from: DateTime(2026, 4, 20),
        to: DateTime(2026, 4, 27),
        schedules: <ReminderSchedule>[
          _schedule(
            id: 's',
            times: <TimeOfDayDto>[const TimeOfDayDto(hour: 8, minute: 0)],
          ),
        ],
        adherence: records,
      );
      expect(stats.expectedDoses, 7);
      expect(stats.takenDoses, 4);
      expect(stats.rate, closeTo(4 / 7, 1e-9));
      expect(stats.byDay[DateTime(2026, 4, 20)], 1.0);
      expect(stats.byDay[DateTime(2026, 4, 24)], 0.0);
    });

    test('end date is exclusive — adherence on `to` is not counted', () {
      final AdherenceStats stats = statsForRange(
        from: DateTime(2026, 4, 26),
        to: DateTime(2026, 4, 27),
        schedules: <ReminderSchedule>[
          _schedule(
            id: 's',
            times: <TimeOfDayDto>[const TimeOfDayDto(hour: 8, minute: 0)],
          ),
        ],
        adherence: <AdherenceRecord>[
          _record(
            prescriptionId: 'rx-s',
            scheduledAt: DateTime(2026, 4, 27, 8, 0), // outside
          ),
        ],
      );
      expect(stats.takenDoses, 0);
    });

    test('schedule range respected per-day inside the window', () {
      // Schedule active only Apr 22..Apr 24 (end exclusive).
      final AdherenceStats stats = statsForRange(
        from: DateTime(2026, 4, 20),
        to: DateTime(2026, 4, 27),
        schedules: <ReminderSchedule>[
          _schedule(
            id: 's',
            times: <TimeOfDayDto>[const TimeOfDayDto(hour: 8, minute: 0)],
            start: DateTime(2026, 4, 22),
            end: DateTime(2026, 4, 24),
          ),
        ],
        adherence: const <AdherenceRecord>[],
      );
      expect(stats.expectedDoses, 2);
      expect(stats.byDay.containsKey(DateTime(2026, 4, 21)), isFalse);
      expect(stats.byDay.containsKey(DateTime(2026, 4, 22)), isTrue);
      expect(stats.byDay.containsKey(DateTime(2026, 4, 23)), isTrue);
      expect(stats.byDay.containsKey(DateTime(2026, 4, 24)), isFalse);
    });

    test('disabled schedules are excluded from expected', () {
      final AdherenceStats stats = statsForRange(
        from: DateTime(2026, 4, 26),
        to: DateTime(2026, 4, 27),
        schedules: <ReminderSchedule>[
          _schedule(
            id: 's',
            times: <TimeOfDayDto>[const TimeOfDayDto(hour: 8, minute: 0)],
            enabled: false,
          ),
        ],
        adherence: const <AdherenceRecord>[],
      );
      expect(stats.expectedDoses, 0);
      expect(stats.byDay, isEmpty);
    });
  });
}
