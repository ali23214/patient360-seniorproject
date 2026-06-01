import '../../prescriptions/domain/reminders/adherence_record.dart';
import '../../prescriptions/domain/reminders/reminder_schedule.dart';
import '../../prescriptions/domain/reminders/time_of_day_dto.dart';
import 'scheduled_dose.dart';

/// Tolerance for matching an adherence record's `scheduledAt` to a derived
/// dose. Stored timestamps may be off by a few seconds because of clock
/// drift between scheduling and tap; ±1 minute keeps the match stable
/// without ever colliding with a different dose (closest time on a real
/// schedule is the 30-minute "current" window).
const Duration _adherenceMatchTolerance = Duration(minutes: 1);

/// Derives the list of [ScheduledDose]s for a single calendar day.
///
/// `date` is treated as a *date* — the time component is ignored. Schedules
/// are included when:
///   - `isEnabled == true`,
///   - `dateOnly(date) >= dateOnly(startDate)`, and
///   - `dateOnly(date) <  dateOnly(endDate)` (endDate is exclusive — same
///     convention as [ReminderSchedule.endDate] and the scheduler's
///     sliding window).
///
/// For each matching schedule, every entry in `times` produces one
/// [ScheduledDose]. Adherence is matched in O(N×M) for clarity — N
/// schedules × M times is small (single-digit per day in practice).
///
/// Returns the doses sorted ascending by `scheduledAt`.
List<ScheduledDose> deriveDosesForDate({
  required DateTime date,
  required List<ReminderSchedule> schedules,
  required List<AdherenceRecord> adherence,
  required DateTime now,
}) {
  final DateTime day = _dateOnly(date);
  final List<ScheduledDose> out = <ScheduledDose>[];

  for (final ReminderSchedule s in schedules) {
    if (!s.isEnabled) continue;
    if (day.isBefore(_dateOnly(s.startDate))) continue;
    if (!day.isBefore(_dateOnly(s.endDate))) continue;

    for (final TimeOfDayDto t in s.times) {
      final DateTime scheduledAt =
          DateTime(day.year, day.month, day.day, t.hour, t.minute);

      final AdherenceRecord? matched = _findMatch(
        adherence,
        prescriptionId: s.prescriptionId,
        medicationIndex: s.medicationIndex,
        scheduledAt: scheduledAt,
      );

      final DoseWindow window = computeDoseWindow(
        scheduledAt: scheduledAt,
        now: now,
        isTaken: matched != null,
      );

      out.add(
        ScheduledDose(
          prescriptionId: s.prescriptionId,
          medicationIndex: s.medicationIndex,
          medicationName: s.medicationName,
          dosage: s.dosage,
          scheduledAt: scheduledAt,
          isTaken: matched != null,
          takenAt: matched?.takenAt,
          window: window,
          scheduleId: s.id,
        ),
      );
    }
  }

  out.sort((ScheduledDose a, ScheduledDose b) =>
      a.scheduledAt.compareTo(b.scheduledAt));
  return out;
}

/// Pure window-classification rule, exposed so unit tests can pin every
/// boundary without rebuilding the surrounding [ScheduledDose].
DoseWindow computeDoseWindow({
  required DateTime scheduledAt,
  required DateTime now,
  required bool isTaken,
}) {
  if (isTaken) return DoseWindow.taken;

  // Positive when scheduledAt is in the future, negative when in the past.
  final Duration delta = scheduledAt.difference(now);

  if (delta > const Duration(minutes: 30)) return DoseWindow.upcoming;
  if (delta >= const Duration(minutes: -30)) return DoseWindow.current;
  if (delta > const Duration(hours: -4)) return DoseWindow.overdue;
  return DoseWindow.missed;
}

AdherenceRecord? _findMatch(
  List<AdherenceRecord> records, {
  required String prescriptionId,
  required int medicationIndex,
  required DateTime scheduledAt,
}) {
  for (final AdherenceRecord r in records) {
    if (r.prescriptionId != prescriptionId) continue;
    if (r.medicationIndex != medicationIndex) continue;
    if (r.scheduledAt.difference(scheduledAt).abs() <=
        _adherenceMatchTolerance) {
      return r;
    }
  }
  return null;
}

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);
