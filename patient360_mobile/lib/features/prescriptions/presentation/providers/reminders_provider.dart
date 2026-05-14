import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/notification_scheduler.dart';
import '../../data/reminder_local_store.dart';
import '../../domain/reminders/reminder_schedule.dart';

/// Source of truth for the patient's local reminder schedules. Mutations
/// always:
///   1. write to [ReminderLocalStore]
///   2. push the updated set into [NotificationScheduler.scheduleSlidingWindow]
///   3. swap [state] in-place so listeners see the new value without an
///      extra round-trip through SharedPreferences.
class RemindersController
    extends AsyncNotifier<List<ReminderSchedule>> {
  @override
  Future<List<ReminderSchedule>> build() async {
    final ReminderLocalStore store = ref.read(reminderLocalStoreProvider);
    return store.loadAll();
  }

  Future<void> createOrUpdate(ReminderSchedule schedule) async {
    final ReminderLocalStore store = ref.read(reminderLocalStoreProvider);
    final NotificationScheduler scheduler =
        ref.read(notificationSchedulerProvider);
    await store.upsert(schedule);
    final List<ReminderSchedule> all = await store.loadAll();
    state = AsyncValue<List<ReminderSchedule>>.data(all);
    await scheduler.scheduleSlidingWindow(all);
    await store.writeLastScheduledAt(DateTime.now());
  }

  Future<void> toggleEnabled(String id, bool enabled) async {
    final List<ReminderSchedule> current = state.value ?? <ReminderSchedule>[];
    final ReminderSchedule? found = current
        .cast<ReminderSchedule?>()
        .firstWhere(
          (ReminderSchedule? s) => s?.id == id,
          orElse: () => null,
        );
    if (found == null) return;
    final ReminderSchedule updated = found.copyWith(
      isEnabled: enabled,
      updatedAt: DateTime.now(),
    );
    await createOrUpdate(updated);
  }

  Future<void> deleteByPrescription(String prescriptionId) async {
    final ReminderLocalStore store = ref.read(reminderLocalStoreProvider);
    final NotificationScheduler scheduler =
        ref.read(notificationSchedulerProvider);
    await scheduler.cancelByPrescription(prescriptionId);
    await store.removeByPrescriptionId(prescriptionId);
    final List<ReminderSchedule> all = await store.loadAll();
    state = AsyncValue<List<ReminderSchedule>>.data(all);
    await scheduler.scheduleSlidingWindow(all);
  }

  Future<void> deleteById(String id) async {
    final ReminderLocalStore store = ref.read(reminderLocalStoreProvider);
    final NotificationScheduler scheduler =
        ref.read(notificationSchedulerProvider);
    await scheduler.cancelBySchedule(id);
    await store.removeById(id);
    final List<ReminderSchedule> all = await store.loadAll();
    state = AsyncValue<List<ReminderSchedule>>.data(all);
    await scheduler.scheduleSlidingWindow(all);
  }
}

final AsyncNotifierProvider<RemindersController, List<ReminderSchedule>>
    remindersProvider =
    AsyncNotifierProvider<RemindersController, List<ReminderSchedule>>(
  RemindersController.new,
);

/// Lookup: the active reminder for a given (prescription, medicationIndex)
/// pair, if any. Used by [PrescriptionCard] to decide between "set up" CTA
/// and the inline toggle row.
final reminderByMedProvider = Provider.family<ReminderSchedule?,
    ({String prescriptionId, int medicationIndex})>(
  (Ref ref, ({String prescriptionId, int medicationIndex}) key) {
    final List<ReminderSchedule> all =
        ref.watch(remindersProvider).value ?? <ReminderSchedule>[];
    for (final ReminderSchedule s in all) {
      if (s.prescriptionId == key.prescriptionId &&
          s.medicationIndex == key.medicationIndex) {
        return s;
      }
    }
    return null;
  },
);
