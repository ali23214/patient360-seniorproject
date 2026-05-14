import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../data/reminder_local_store.dart';
import '../../domain/reminders/adherence_record.dart';
import '../../domain/reminders/reminder_schedule.dart';
import 'reminders_provider.dart';

/// Aggregate result of [AdherenceController.adherenceRateForWeek].
class AdherenceWeekStats {
  const AdherenceWeekStats({
    required this.expectedDoses,
    required this.takenDoses,
  });
  final int expectedDoses;
  final int takenDoses;

  /// Fraction in 0.0..1.0. Returns 0 when no doses were expected (avoids
  /// dividing by zero in widgets that show a progress ring).
  double get rate =>
      expectedDoses == 0 ? 0 : takenDoses / expectedDoses;
}

class AdherenceController extends AsyncNotifier<List<AdherenceRecord>> {
  static const Uuid _uuid = Uuid();

  @override
  Future<List<AdherenceRecord>> build() async {
    final ReminderLocalStore store = ref.read(reminderLocalStoreProvider);
    // Show the last 30 days by default — caller can fetch wider via
    // [adherenceForRange] on the store directly.
    final DateTime now = DateTime.now();
    return store.adherenceForRange(
      now.subtract(const Duration(days: 30)),
      now.add(const Duration(days: 1)),
    );
  }

  Future<void> markTaken({
    required String prescriptionId,
    required int medicationIndex,
    required DateTime scheduledAt,
  }) async {
    final ReminderLocalStore store = ref.read(reminderLocalStoreProvider);
    final AdherenceRecord existing = await store.findAdherence(
          prescriptionId: prescriptionId,
          medicationIndex: medicationIndex,
          scheduledAt: scheduledAt,
        ) ??
        AdherenceRecord(
          id: _uuid.v4(),
          prescriptionId: prescriptionId,
          medicationIndex: medicationIndex,
          scheduledAt: scheduledAt,
          takenAt: DateTime.now(),
          createdAt: DateTime.now(),
        );
    await store.recordAdherence(existing);
    state = AsyncValue<List<AdherenceRecord>>.data(
      await store.adherenceForRange(
        DateTime.now().subtract(const Duration(days: 30)),
        DateTime.now().add(const Duration(days: 1)),
      ),
    );
  }

  /// Computes adherence for the 7-day period starting at [weekStart].
  /// Walks every active reminder's daily times within the window to derive
  /// `expectedDoses`, then counts `takenDoses` from this controller's state.
  AdherenceWeekStats adherenceRateForWeek({required DateTime weekStart}) {
    final DateTime weekEnd = weekStart.add(const Duration(days: 7));
    final List<ReminderSchedule> schedules =
        ref.read(remindersProvider).value ?? <ReminderSchedule>[];

    int expected = 0;
    for (final ReminderSchedule s in schedules) {
      if (!s.isEnabled) continue;
      for (int dayOffset = 0; dayOffset < 7; dayOffset++) {
        final DateTime day = DateTime(
          weekStart.year,
          weekStart.month,
          weekStart.day + dayOffset,
        );
        if (day.isBefore(_dateOnly(s.startDate))) continue;
        if (!day.isBefore(_dateOnly(s.endDate))) continue;
        expected += s.times.length;
      }
    }

    final List<AdherenceRecord> records =
        state.value ?? <AdherenceRecord>[];
    final int taken = records
        .where((AdherenceRecord r) =>
            !r.scheduledAt.isBefore(weekStart) &&
            r.scheduledAt.isBefore(weekEnd))
        .length;

    return AdherenceWeekStats(
      expectedDoses: expected,
      takenDoses: taken,
    );
  }

  static DateTime _dateOnly(DateTime d) =>
      DateTime(d.year, d.month, d.day);
}

final AsyncNotifierProvider<AdherenceController, List<AdherenceRecord>>
    adherenceProvider =
    AsyncNotifierProvider<AdherenceController, List<AdherenceRecord>>(
  AdherenceController.new,
);
