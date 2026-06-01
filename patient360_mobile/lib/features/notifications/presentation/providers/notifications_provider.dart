import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/utils/logger.dart';
import '../../../home/presentation/providers/home_providers.dart';
import '../../data/notifications_repository.dart';
import '../../domain/app_notification.dart';

/// Controller for the patient's notifications list.
///
/// The interesting bit is [markRead]: it does an optimistic local update
/// (UI flips instantly), fires the network call in the background, then
/// invalidates [dashboardOverviewProvider] on success so the unread bell
/// badge in every other screen (Home, Drawer, Medications) updates too.
///
/// Without that invalidation step the badge stays stuck at its initial
/// count because those screens read `unreadNotifications` from the
/// overview snapshot, not from this provider.
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
    // Refresh the global overview too — that's what other screens watch.
    ref.invalidate(dashboardOverviewProvider);
  }

  /// Optimistically marks [id] as read in the local cache, fires the
  /// network call in the background, and reverts the optimistic flip if
  /// the request fails. Also invalidates [dashboardOverviewProvider] on
  /// success so every screen showing the unread badge re-syncs.
  Future<void> markRead(String id) async {
    final List<AppNotification> current = state.value ?? <AppNotification>[];
    final int idx = current.indexWhere((AppNotification n) => n.id == id);
    if (idx < 0) return;
    final AppNotification before = current[idx];
    if (before.isRead) return;

    // ── Optimistic update — UI flips instantly ────────────────────────
    final List<AppNotification> optimistic = List<AppNotification>.from(
      current,
    );
    optimistic[idx] = before.copyWith(status: 'read', readAt: DateTime.now());
    state = AsyncValue<List<AppNotification>>.data(optimistic);

    // ── Network call ──────────────────────────────────────────────────
    try {
      await ref.read(notificationsRepositoryProvider).markNotificationRead(id);

      // Re-fetch overview so the bell badge on other screens updates.
      // This is what fixes "badge stuck at 5 after opening notifications".
      ref.invalidate(dashboardOverviewProvider);
    } catch (e, st) {
      appLogger.w('markRead failed — reverting', error: e, stackTrace: st);
      final List<AppNotification> reverted = List<AppNotification>.from(
        state.value ?? optimistic,
      );
      final int rIdx = reverted.indexWhere((AppNotification n) => n.id == id);
      if (rIdx >= 0) reverted[rIdx] = before;
      state = AsyncValue<List<AppNotification>>.data(reverted);
    }
  }

  /// Mark every unread notification as read in one sweep. Used by the
  /// "Mark all as read" button in the notifications screen (if present).
  /// Implemented as a batch of [markRead] calls to keep the API surface
  /// minimal and reuse the optimistic + invalidation logic.
  Future<void> markAllRead() async {
    final List<AppNotification> current = state.value ?? <AppNotification>[];
    final List<String> unreadIds = current
        .where((AppNotification n) => !n.isRead)
        .map((AppNotification n) => n.id)
        .toList();
    for (final String id in unreadIds) {
      await markRead(id);
    }
  }
}

final AsyncNotifierProvider<NotificationsController, List<AppNotification>>
notificationsProvider =
    AsyncNotifierProvider<NotificationsController, List<AppNotification>>(
      NotificationsController.new,
    );

/// Live unread count derived from the local notifications cache.
///
/// Preference order:
///   1. [notificationsProvider] cache — most accurate, reflects optimistic
///      mark-read flips immediately.
///   2. [dashboardOverviewProvider] snapshot — fallback for cold start
///      before the notifications screen has been visited.
///
/// Used by [PageHeader] across every screen so the bell badge stays in
/// sync with the list state.
final Provider<int> unreadNotificationsCountProvider = Provider<int>((Ref ref) {
  final AsyncValue<List<AppNotification>> async = ref.watch(
    notificationsProvider,
  );
  final List<AppNotification>? loaded = async.value;
  if (loaded != null) {
    return loaded.where((AppNotification n) => !n.isRead).length;
  }
  return ref.watch(dashboardOverviewProvider).value?.unreadNotifications ?? 0;
});
