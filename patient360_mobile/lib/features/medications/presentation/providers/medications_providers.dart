import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../prescriptions/domain/prescription.dart';
import '../../../prescriptions/domain/reminders/adherence_record.dart';
import '../../../prescriptions/domain/reminders/reminder_schedule.dart';
import '../../../prescriptions/presentation/providers/adherence_provider.dart';
import '../../../prescriptions/presentation/providers/prescriptions_provider.dart';
import '../../../prescriptions/presentation/providers/reminders_provider.dart';
import '../../domain/adherence_stats.dart';
import '../../domain/dose_derivation.dart';
import '../../domain/scheduled_dose.dart';

/// Live "now" used by every dose-window calculation. Override in tests with
/// `nowProvider.overrideWithValue(...)` to pin time without monkey-patching
/// `DateTime.now()`.
final Provider<DateTime> nowProvider =
    Provider<DateTime>((Ref ref) => DateTime.now());

/// Lookup table: prescriptionId → prescriptionNumber. Built from
/// [prescriptionsProvider] so [DoseRow] can show the muted Rx ref next to
/// each medication name without wiring a second async fetch.
final Provider<Map<String, String>> _prescriptionNumberLookupProvider =
    Provider<Map<String, String>>((Ref ref) {
  final List<Prescription> all =
      ref.watch(prescriptionsProvider).value ?? const <Prescription>[];
  return <String, String>{
    for (final Prescription p in all) p.id: p.prescriptionNumber,
  };
});

/// Family: doses for an arbitrary date (used by Today and the day-detail
/// card on the Calendar tab). Date-only keying ensures equal calls collapse
/// inside the Riverpod cache.
final dosesForDateProvider =
    Provider.family<List<ScheduledDose>, DateTime>((Ref ref, DateTime date) {
  final List<ReminderSchedule> schedules =
      ref.watch(remindersProvider).value ?? const <ReminderSchedule>[];
  final List<AdherenceRecord> adherence =
      ref.watch(adherenceProvider).value ?? const <AdherenceRecord>[];
  final DateTime now = ref.watch(nowProvider);
  final Map<String, String> rxNumbers =
      ref.watch(_prescriptionNumberLookupProvider);

  final List<ScheduledDose> raw = deriveDosesForDate(
    date: date,
    schedules: schedules,
    adherence: adherence,
    now: now,
  );

  if (rxNumbers.isEmpty) return raw;
  return <ScheduledDose>[
    for (final ScheduledDose d in raw)
      d._withPrescriptionNumber(rxNumbers[d.prescriptionId]),
  ];
});

/// Today's doses, derived once via [_DateOnly.today] so callers don't have
/// to keep recomputing the date.
final todayDosesProvider = Provider<List<ScheduledDose>>(
  (Ref ref) {
    final DateTime now = ref.watch(nowProvider);
    return ref.watch(
      dosesForDateProvider(DateTime(now.year, now.month, now.day)),
    );
  },
);

/// Adherence stats for a half-open `[from, to)` range. The Calendar tab
/// uses one provider for the visible-month range; the Today tab uses one
/// for `[today, today+1)` plus another for the ISO-week range.
final adherenceStatsProvider =
    Provider.family<AdherenceStats, ({DateTime from, DateTime to})>(
  (Ref ref, ({DateTime from, DateTime to}) range) {
    final List<ReminderSchedule> schedules =
        ref.watch(remindersProvider).value ?? const <ReminderSchedule>[];
    final List<AdherenceRecord> adherence =
        ref.watch(adherenceProvider).value ?? const <AdherenceRecord>[];
    return statsForRange(
      from: range.from,
      to: range.to,
      schedules: schedules,
      adherence: adherence,
    );
  },
);

extension on ScheduledDose {
  ScheduledDose _withPrescriptionNumber(String? num) {
    if (num == null || num.isEmpty) return this;
    return ScheduledDose(
      prescriptionId: prescriptionId,
      medicationIndex: medicationIndex,
      medicationName: medicationName,
      dosage: dosage,
      scheduledAt: scheduledAt,
      isTaken: isTaken,
      takenAt: takenAt,
      window: window,
      scheduleId: scheduleId,
      prescriptionNumber: num,
    );
  }
}
