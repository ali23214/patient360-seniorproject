import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/utils/logger.dart';
import '../../../prescriptions/data/notification_scheduler.dart';
import '../../../prescriptions/domain/reminders/reminder_schedule.dart';
import '../../../prescriptions/presentation/providers/reminders_provider.dart';

/// One-way sync from [remindersProvider] → [NotificationScheduler].
///
/// The reminder data layer (provider, repository, persistence) is fully
/// wired by Ali. The OS-level notification scheduler is fully wired in
/// [NotificationScheduler]. The piece that was missing was the bridge:
/// nothing was calling [NotificationScheduler.scheduleSlidingWindow] when
/// the reminder list changed. This provider fills that gap.
///
/// How it works:
///   - Watches [remindersProvider] for changes (refresh, add, edit, delete).
///   - On every successful update, hands the new list to
///     [NotificationScheduler.scheduleSlidingWindow], which cancels every
///     previously-pending notification and re-plans the next 7 days.
///   - Errors are logged but never thrown — a flaky scheduler should never
///     break the UI.
///
/// Activation:
///   Read `reminderSyncProvider` once at the top of a long-lived widget
///   (e.g. [MedicationsScreen] in `initState`). Because [Provider] caches
///   its value for the life of the [ProviderScope], one read is enough.
///   The internal [Ref.listen] keeps firing until the scope tears down.
///
/// Why not call `scheduleSlidingWindow` from inside `remindersProvider`?
///   Domain providers (data) shouldn't depend on platform plugins
///   (notifications). Keeping the bridge here lets `remindersProvider`
///   stay pure and testable without mocking the OS layer.
final Provider<void> reminderSyncProvider = Provider<void>((Ref ref) {
  ref.listen<AsyncValue<List<ReminderSchedule>>>(remindersProvider, (
    AsyncValue<List<ReminderSchedule>>? previous,
    AsyncValue<List<ReminderSchedule>> next,
  ) {
    // Only act on successful data — we don't want to clear schedules
    // because of a transient loading state or network error.
    next.whenData((List<ReminderSchedule> schedules) async {
      try {
        final NotificationScheduler scheduler = ref.read(
          notificationSchedulerProvider,
        );

        if (schedules.isEmpty) {
          // No active reminders → cancel everything pending. Safe to call
          // even when the scheduler has nothing scheduled.
          await scheduler.cancelAll();
          appLogger.i(
            '💊 reminder sync: no reminders, cancelled all pending notifications',
          );
          return;
        }

        final int planned = await scheduler.scheduleSlidingWindow(schedules);
        appLogger.i(
          '💊 reminder sync: scheduled $planned notifications '
          'for ${schedules.length} reminder(s)',
        );
      } catch (e, st) {
        appLogger.w(
          'reminder sync failed — schedule out of date until next change',
          error: e,
          stackTrace: st,
        );
      }
    });
  }, fireImmediately: true);
});
