import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:patient360_mobile/features/prescriptions/data/reminder_local_store.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/reminder_schedule.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/time_of_day_dto.dart';

ReminderSchedule _makeSchedule({
  String id = 's-1',
  String prescriptionId = 'rx-1',
  int medicationIndex = 0,
  bool isEnabled = true,
}) {
  final DateTime now = DateTime(2026, 4, 26, 9);
  return ReminderSchedule(
    id: id,
    prescriptionId: prescriptionId,
    medicationIndex: medicationIndex,
    medicationName: 'Cipro',
    dosage: '500mg',
    times: <TimeOfDayDto>[
      const TimeOfDayDto(hour: 8, minute: 0),
      const TimeOfDayDto(hour: 20, minute: 0),
    ],
    startDate: DateTime(2026, 4, 26),
    endDate: DateTime(2026, 5, 3),
    isEnabled: isEnabled,
    createdAt: now,
    updatedAt: now,
  );
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  test('upsert + load round-trips a schedule', () async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final ReminderLocalStore store = ReminderLocalStore(prefs);
    await store.upsert(_makeSchedule());

    final List<ReminderSchedule> loaded = await store.loadAll();
    expect(loaded, hasLength(1));
    expect(loaded.first.id, 's-1');
    expect(loaded.first.times.length, 2);
    expect(loaded.first.times.first.label, '08:00');
  });

  test('upsert replaces an existing entry by id', () async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final ReminderLocalStore store = ReminderLocalStore(prefs);
    await store.upsert(_makeSchedule());
    await store.upsert(_makeSchedule(isEnabled: false));

    final List<ReminderSchedule> loaded = await store.loadAll();
    expect(loaded, hasLength(1));
    expect(loaded.first.isEnabled, isFalse);
  });

  test('removeByPrescriptionId deletes all matching schedules', () async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final ReminderLocalStore store = ReminderLocalStore(prefs);
    await store.upsert(
        _makeSchedule(id: 's-1', prescriptionId: 'rx-1'));
    await store.upsert(
        _makeSchedule(id: 's-2', prescriptionId: 'rx-1', medicationIndex: 1));
    await store.upsert(
        _makeSchedule(id: 's-3', prescriptionId: 'rx-other'));

    await store.removeByPrescriptionId('rx-1');
    final List<ReminderSchedule> loaded = await store.loadAll();
    expect(loaded.map((ReminderSchedule s) => s.id).toList(),
        <String>['s-3']);
  });

  test('tolerates extra/unknown keys in stored JSON (forward-compat)',
      () async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    // Forge a payload with an extra "futureField" — the parser must ignore
    // it without throwing.
    await prefs.setString(
      'p360.reminders.v1',
      '[{"id":"s-x","prescriptionId":"rx-x","medicationIndex":0,'
          '"medicationName":"Test","dosage":"10mg",'
          '"times":[{"hour":8,"minute":0}],'
          '"startDate":"2026-04-26T00:00:00.000Z",'
          '"endDate":"2026-05-03T00:00:00.000Z",'
          '"isEnabled":true,'
          '"createdAt":"2026-04-26T00:00:00.000Z",'
          '"updatedAt":"2026-04-26T00:00:00.000Z",'
          '"futureField":"some new value"}]',
    );

    final ReminderLocalStore store = ReminderLocalStore(prefs);
    final List<ReminderSchedule> loaded = await store.loadAll();
    expect(loaded, hasLength(1));
    expect(loaded.first.id, 's-x');
  });

  test('writeLastScheduledAt round-trips', () async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final ReminderLocalStore store = ReminderLocalStore(prefs);
    final DateTime now = DateTime(2026, 4, 26, 13, 30);
    await store.writeLastScheduledAt(now);
    expect(store.readLastScheduledAt(), now);
  });
}
