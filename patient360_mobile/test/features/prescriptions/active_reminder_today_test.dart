import 'package:flutter_test/flutter_test.dart';

import 'package:patient360_mobile/features/prescriptions/domain/reminders/reminder_schedule.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/time_of_day_dto.dart';
import 'package:patient360_mobile/features/prescriptions/presentation/providers/active_reminder_today_provider.dart';

ReminderSchedule _schedule(List<TimeOfDayDto> times, {bool enabled = true}) {
  final DateTime created = DateTime(2026, 4, 26);
  return ReminderSchedule(
    id: 's',
    prescriptionId: 'rx',
    medicationIndex: 0,
    medicationName: 'Cipro',
    dosage: '500mg',
    times: times,
    startDate: DateTime(2026, 4, 1),
    endDate: DateTime(2026, 6, 1),
    isEnabled: enabled,
    createdAt: created,
    updatedAt: created,
  );
}

void main() {
  test('returns the dose due in 15 minutes', () {
    final DateTime now = DateTime(2026, 4, 26, 13, 45);
    final List<UpcomingDose> doses = computeUpcomingDoses(
      <ReminderSchedule>[
        _schedule(<TimeOfDayDto>[const TimeOfDayDto(hour: 14, minute: 0)]),
      ],
      now,
    );
    expect(doses, hasLength(1));
    expect(doses.first.minutesUntil, 15);
    expect(doses.first.isLate, isFalse);
  });

  test('returns a dose 5 minutes late as isLate=true', () {
    final DateTime now = DateTime(2026, 4, 26, 14, 5);
    final List<UpcomingDose> doses = computeUpcomingDoses(
      <ReminderSchedule>[
        _schedule(<TimeOfDayDto>[const TimeOfDayDto(hour: 14, minute: 0)]),
      ],
      now,
    );
    expect(doses, hasLength(1));
    expect(doses.first.isLate, isTrue);
    expect(doses.first.minutesLate, 5);
  });

  test('skips disabled schedules', () {
    final DateTime now = DateTime(2026, 4, 26, 13, 45);
    final List<UpcomingDose> doses = computeUpcomingDoses(
      <ReminderSchedule>[
        _schedule(<TimeOfDayDto>[const TimeOfDayDto(hour: 14, minute: 0)],
            enabled: false),
      ],
      now,
    );
    expect(doses, isEmpty);
  });

  test('does not return doses outside the ±60min window', () {
    final DateTime now = DateTime(2026, 4, 26, 12, 0);
    final List<UpcomingDose> doses = computeUpcomingDoses(
      <ReminderSchedule>[
        _schedule(<TimeOfDayDto>[const TimeOfDayDto(hour: 17, minute: 0)]),
      ],
      now,
    );
    expect(doses, isEmpty);
  });
}
