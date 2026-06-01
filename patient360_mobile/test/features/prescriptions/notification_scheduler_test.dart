import 'package:flutter_test/flutter_test.dart';

import 'package:patient360_mobile/features/prescriptions/data/notification_scheduler.dart';

void main() {
  group('deterministicNotificationId', () {
    test('same inputs produce the same id (stable across runs)', () {
      final int a = NotificationScheduler.deterministicNotificationId(
          'sched-1', '2026-04-26T08:00:00.000');
      final int b = NotificationScheduler.deterministicNotificationId(
          'sched-1', '2026-04-26T08:00:00.000');
      expect(a, b);
    });

    test('different inputs produce different ids', () {
      final int a = NotificationScheduler.deterministicNotificationId(
          'sched-1', '2026-04-26T08:00:00.000');
      final int b = NotificationScheduler.deterministicNotificationId(
          'sched-1', '2026-04-26T20:00:00.000');
      final int c = NotificationScheduler.deterministicNotificationId(
          'sched-2', '2026-04-26T08:00:00.000');
      expect(a, isNot(b));
      expect(a, isNot(c));
    });

    test('id fits in a 31-bit signed int (Android limit)', () {
      final int id = NotificationScheduler.deterministicNotificationId(
          'sched-very-long-id-with-uuid-format',
          '2026-04-26T08:30:00.000');
      expect(id, greaterThanOrEqualTo(0));
      expect(id, lessThan(0x80000000));
    });
  });
}
