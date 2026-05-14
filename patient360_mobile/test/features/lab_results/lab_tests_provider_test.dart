import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:patient360_mobile/core/network/api_exception.dart';
import 'package:patient360_mobile/features/lab_results/data/lab_tests_repository.dart';
import 'package:patient360_mobile/features/lab_results/domain/lab_test.dart';
import 'package:patient360_mobile/features/lab_results/presentation/providers/lab_tests_provider.dart';

LabTest _test({
  required String id,
  bool viewed = false,
  String status = 'completed',
}) {
  return LabTest(
    id: id,
    testNumber: 'LAB-$id',
    orderDate: DateTime(2026, 4, 1),
    testCategory: 'cbc',
    priority: 'routine',
    status: status,
    testsOrdered: const [],
    testResults: const [],
    isCritical: false,
    isViewedByPatient: viewed,
    createdAt: DateTime(2026, 4, 1),
  );
}

class _ListRepo extends LabTestsRepository {
  _ListRepo(this._initial, {this.failOnMark = false}) : super(Dio());

  final List<LabTest> _initial;
  final bool failOnMark;
  int markCallCount = 0;

  @override
  Future<List<LabTest>> getLabTests() async => _initial;

  @override
  Future<void> markLabTestViewed(String id) async {
    markCallCount++;
    if (failOnMark) {
      throw const ApiException.server(500, 'boom');
    }
  }
}

ProviderContainer _container(LabTestsRepository repo) {
  final List<Object> overrides = <Object>[
    labTestsRepositoryProvider.overrideWithValue(repo),
  ];
  final ProviderContainer c = ProviderContainer(overrides: overrides.cast());
  addTearDown(c.dispose);
  return c;
}

void main() {
  group('LabTestsController.markViewed', () {
    test('flips isViewedByPatient and calls the repo on success', () async {
      final _ListRepo repo = _ListRepo(<LabTest>[
        _test(id: '1', viewed: false),
      ]);
      final ProviderContainer c = _container(repo);
      // Wait for build() to resolve the initial fetch.
      await c.read(labTestsProvider.future);

      await c.read(labTestsProvider.notifier).markViewed('1');

      final List<LabTest> after = c.read(labTestsProvider).value!;
      expect(after.first.isViewedByPatient, isTrue);
      expect(after.first.patientViewedAt, isNotNull);
      expect(repo.markCallCount, 1);
    });

    test('reverts the optimistic flip when the repo throws 500', () async {
      final _ListRepo repo = _ListRepo(
        <LabTest>[_test(id: '1', viewed: false)],
        failOnMark: true,
      );
      final ProviderContainer c = _container(repo);
      await c.read(labTestsProvider.future);

      await c.read(labTestsProvider.notifier).markViewed('1');

      final List<LabTest> after = c.read(labTestsProvider).value!;
      expect(
        after.first.isViewedByPatient,
        isFalse,
        reason: 'failed mark should revert to unread',
      );
      expect(after.first.patientViewedAt, isNull);
      expect(repo.markCallCount, 1);
    });

    test('is a no-op when the test is already viewed', () async {
      final _ListRepo repo = _ListRepo(<LabTest>[
        _test(id: '1', viewed: true),
      ]);
      final ProviderContainer c = _container(repo);
      await c.read(labTestsProvider.future);

      await c.read(labTestsProvider.notifier).markViewed('1');

      expect(repo.markCallCount, 0);
    });

    test('is a no-op when the id does not match any test', () async {
      final _ListRepo repo = _ListRepo(<LabTest>[
        _test(id: '1', viewed: false),
      ]);
      final ProviderContainer c = _container(repo);
      await c.read(labTestsProvider.future);

      await c.read(labTestsProvider.notifier).markViewed('does-not-exist');

      expect(repo.markCallCount, 0);
      expect(c.read(labTestsProvider).value!.first.isViewedByPatient, isFalse);
    });
  });

  group('LabTestGroup.includes', () {
    test('all → matches every status', () {
      expect(LabTestGroup.all.includes(_test(id: 'a', status: 'ordered')),
          isTrue);
      expect(LabTestGroup.all.includes(_test(id: 'b', status: 'completed')),
          isTrue);
      expect(LabTestGroup.all.includes(_test(id: 'c', status: 'cancelled')),
          isTrue);
    });

    test('pending → matches non-completed only', () {
      expect(LabTestGroup.pending.includes(_test(id: 'a', status: 'ordered')),
          isTrue);
      expect(
          LabTestGroup.pending.includes(_test(id: 'b', status: 'in_progress')),
          isTrue);
      expect(
          LabTestGroup.pending.includes(_test(id: 'c', status: 'completed')),
          isFalse);
    });

    test('completed → matches only "completed"', () {
      expect(
          LabTestGroup.completed.includes(_test(id: 'a', status: 'ordered')),
          isFalse);
      expect(
          LabTestGroup.completed.includes(_test(id: 'b', status: 'completed')),
          isTrue);
    });
  });
}
