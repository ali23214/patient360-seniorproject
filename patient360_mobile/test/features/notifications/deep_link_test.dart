import 'package:flutter_test/flutter_test.dart';

import 'package:patient360_mobile/features/notifications/domain/notification_type_meta.dart';
import 'package:patient360_mobile/router/route_names.dart';

void main() {
  group('routeForRelatedType', () {
    test('appointments → /appointments', () {
      expect(routeForRelatedType('appointments'), RouteNames.appointments);
    });

    test('visits → /visits', () {
      expect(routeForRelatedType('visits'), RouteNames.visits);
    });

    test('prescriptions → /medications?tab=prescriptions', () {
      expect(
        routeForRelatedType('prescriptions'),
        '${RouteNames.medications}?tab=prescriptions',
      );
    });

    test('lab_tests → /lab', () {
      expect(routeForRelatedType('lab_tests'), RouteNames.lab);
    });

    test('emergency_reports → /ai', () {
      expect(routeForRelatedType('emergency_reports'), RouteNames.ai);
    });

    test('null relatedType → null route (no deep-link)', () {
      expect(routeForRelatedType(null), isNull);
    });

    test('unknown relatedType → null route', () {
      expect(routeForRelatedType('unknown_collection'), isNull);
    });
  });
}
