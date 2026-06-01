import 'package:flutter/foundation.dart';

/// Lifecycle of a single dose seen by the patient.
///
/// State transitions are driven purely by wall-clock time + the existence
/// of a matching adherence record:
///
/// * [upcoming]  — scheduledAt is in the future.
/// * [current]   — scheduledAt is within ±30 min of `now`.
/// * [overdue]   — scheduledAt is 30 min..4 hours past `now` and not taken.
/// * [missed]    — scheduledAt is more than 4 hours past `now` and not taken.
/// * [taken]     — wins over every other state when an [AdherenceRecord]
///                 matches the (rxId, medIndex, scheduledAt) triple.
enum DoseWindow { upcoming, current, overdue, taken, missed }

/// One concrete dose for a given calendar day, derived from a
/// [ReminderSchedule] and any [AdherenceRecord] that matches.
///
/// Plain immutable value type — kept consistent with the rest of the
/// codebase (no freezed code-gen) so `flutter pub run build_runner` is not
/// required to compile this feature.
@immutable
class ScheduledDose {
  const ScheduledDose({
    required this.prescriptionId,
    required this.medicationIndex,
    required this.medicationName,
    required this.dosage,
    required this.scheduledAt,
    required this.window,
    this.isTaken = false,
    this.takenAt,
    this.scheduleId,
    this.prescriptionNumber,
  });

  final String prescriptionId;
  final int medicationIndex;
  final String medicationName;
  final String dosage;

  /// Today (or the inspected day) at the schedule's hour:minute.
  final DateTime scheduledAt;
  final bool isTaken;
  final DateTime? takenAt;
  final DoseWindow window;

  /// The owning [ReminderSchedule.id]. Surfaced so the deep-link payload
  /// (`focusDose=<scheduleId>:<iso>`) can disambiguate when two schedules
  /// share a clock time.
  final String? scheduleId;

  /// The prescription's display number — shown muted next to the dose row
  /// so the patient can cross-reference the source Rx without expanding it.
  final String? prescriptionNumber;

  ScheduledDose copyWith({
    DoseWindow? window,
    bool? isTaken,
    DateTime? takenAt,
  }) {
    return ScheduledDose(
      prescriptionId: prescriptionId,
      medicationIndex: medicationIndex,
      medicationName: medicationName,
      dosage: dosage,
      scheduledAt: scheduledAt,
      isTaken: isTaken ?? this.isTaken,
      takenAt: takenAt ?? this.takenAt,
      window: window ?? this.window,
      scheduleId: scheduleId,
      prescriptionNumber: prescriptionNumber,
    );
  }
}
