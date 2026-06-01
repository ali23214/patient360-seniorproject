import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:patient360_mobile/core/network/api_exception.dart';
import 'package:patient360_mobile/features/notifications/data/notifications_repository.dart';
import 'package:patient360_mobile/features/notifications/domain/app_notification.dart';
import 'package:patient360_mobile/features/notifications/presentation/providers/notifications_provider.dart';

AppNotification _notif({
  required String id,
  bool read = false,
}) {
  return AppNotification(
    id: id,
    recipientId: 'p',
    recipientType: 'patient',
    type: 'appointment_reminder',
    title: 'موعد قادم',
    message: 'لديك موعد غداً',
    status: read ? 'read' : 'sent',
    priority: 'medium',
    channels: const <String>['inapp'],
    createdAt: DateTime(2026, 4, 26),
    readAt: read ? DateTime(2026, 4, 26) : null,
  );
}

class _ListRepo extends NotificationsRepository {
  _ListRepo(this._initial, {this.failOnMark = false}) : super(Dio());
  final List<AppNotification> _initial;
  final bool failOnMark;
  int markCallCount = 0;

  @override
  Future<List<AppNotification>> getNotifications() async => _initial;

  @override
  Future<void> markNotificationRead(String id) async {
    markCallCount++;
    if (failOnMark) throw const ApiException.server(500, 'boom');
  }
}

ProviderContainer _container(NotificationsRepository repo) {
  final List<Object> overrides = <Object>[
    notificationsRepositoryProvider.overrideWithValue(repo),
  ];
  final ProviderContainer c = ProviderContainer(overrides: overrides.cast());
  addTearDown(c.dispose);
  return c;
}

void main() {
  group('NotificationsController.markRead', () {
    test('flips to read on success', () async {
      final _ListRepo repo = _ListRepo(<AppNotification>[
        _notif(id: 'n1', read: false),
      ]);
      final ProviderContainer c = _container(repo);
      await c.read(notificationsProvider.future);

      await c.read(notificationsProvider.notifier).markRead('n1');

      final List<AppNotification> after =
          c.read(notificationsProvider).value!;
      expect(after.first.isRead, isTrue);
      expect(after.first.readAt, isNotNull);
      expect(repo.markCallCount, 1);
    });

    test('reverts on 500 — notification stays unread', () async {
      final _ListRepo repo = _ListRepo(
        <AppNotification>[_notif(id: 'n1', read: false)],
        failOnMark: true,
      );
      final ProviderContainer c = _container(repo);
      await c.read(notificationsProvider.future);

      await c.read(notificationsProvider.notifier).markRead('n1');

      final List<AppNotification> after =
          c.read(notificationsProvider).value!;
      expect(after.first.isRead, isFalse,
          reason: 'failed mark should revert to unread');
      expect(after.first.readAt, isNull);
    });

    test('is a no-op when the notification is already read', () async {
      final _ListRepo repo = _ListRepo(<AppNotification>[
        _notif(id: 'n1', read: true),
      ]);
      final ProviderContainer c = _container(repo);
      await c.read(notificationsProvider.future);

      await c.read(notificationsProvider.notifier).markRead('n1');
      expect(repo.markCallCount, 0);
    });
  });

  group('unreadNotificationsCountProvider', () {
    test('returns the number of unread notifications', () async {
      final _ListRepo repo = _ListRepo(<AppNotification>[
        _notif(id: 'a', read: false),
        _notif(id: 'b', read: false),
        _notif(id: 'c', read: true),
      ]);
      final ProviderContainer c = _container(repo);
      await c.read(notificationsProvider.future);
      expect(c.read(unreadNotificationsCountProvider), 2);
    });
  });
}
