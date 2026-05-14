import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/utils/logger.dart';
import '../../../home/presentation/providers/home_providers.dart';
import '../../data/notifications_repository.dart';
import '../../domain/app_notification.dart';

class NotificationsController extends AsyncNotifier<List<AppNotification>> {
  @override
  Future<List<AppNotification>> build() async {
    return ref.read(notificationsRepositoryProvider).getNotifications();
  }

  Future<void> refresh() async {
    state = const AsyncValue<List<AppNotification>>.loading();
    state = await AsyncValue.guard<List<AppNotification>>(
      () => ref.read(notificationsRepositoryProvider).getNotifications(),
    );
  }

  /// Optimistically marks [id] as read in cache, fires the network call
  /// in the background, and reverts the optimistic flip if the request
  /// fails. The UI never blocks waiting for the round-trip.
  Future<void> markRead(String id) async {
    final List<AppNotification> current =
        state.value ?? <AppNotification>[];
    final int idx = current.indexWhere((AppNotification n) => n.id == id);
    if (idx < 0) return;
    final AppNotification before = current[idx];
    if (before.isRead) return;

    final List<AppNotification> optimistic =
        List<AppNotification>.from(current);
    optimistic[idx] = before.copyWith(
      status: 'read',
      readAt: DateTime.now(),
    );
    state = AsyncValue<List<AppNotification>>.data(optimistic);

    try {
      await ref
          .read(notificationsRepositoryProvider)
          .markNotificationRead(id);
    } catch (e, st) {
      appLogger.w('markRead failed — reverting',
          error: e, stackTrace: st);
      final List<AppNotification> reverted = List<AppNotification>.from(
        state.value ?? optimistic,
      );
      final int rIdx =
          reverted.indexWhere((AppNotification n) => n.id == id);
      if (rIdx >= 0) reverted[rIdx] = before;
      state = AsyncValue<List<AppNotification>>.data(reverted);
    }
  }
}

final AsyncNotifierProvider<NotificationsController, List<AppNotification>>
    notificationsProvider = AsyncNotifierProvider<NotificationsController,
        List<AppNotification>>(NotificationsController.new);

/// Live unread count read by [PageHeader] across every screen.
///
/// Falls back to [dashboardOverviewProvider] until [notificationsProvider]
/// has loaded (notifications screen hasn't been visited yet) so the bell
/// badge isn't blank on cold start.
final Provider<int> unreadNotificationsCountProvider = Provider<int>(
  (Ref ref) {
    final AsyncValue<List<AppNotification>> async =
        ref.watch(notificationsProvider);
    final List<AppNotification>? loaded = async.value;
    if (loaded != null) {
      return loaded.where((AppNotification n) => !n.isRead).length;
    }
    return ref
            .watch(dashboardOverviewProvider)
            .value
            ?.unreadNotifications ??
        0;
  },
);
