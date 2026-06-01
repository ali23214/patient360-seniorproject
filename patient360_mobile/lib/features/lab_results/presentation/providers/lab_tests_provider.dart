import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/utils/logger.dart';
import '../../data/lab_tests_repository.dart';
import '../../domain/lab_test.dart';

class LabTestsController extends AsyncNotifier<List<LabTest>> {
  @override
  Future<List<LabTest>> build() async {
    return ref.watch(labTestsRepositoryProvider).getLabTests();
  }

  Future<void> refresh() async {
    state = const AsyncValue<List<LabTest>>.loading();
    state = await AsyncValue.guard<List<LabTest>>(
      () => ref.read(labTestsRepositoryProvider).getLabTests(),
    );
  }

  /// Optimistically marks [id] viewed in local state, then POSTs to the
  /// backend. On any failure the local change is reverted so the unread
  /// indicator returns — better than silently swallowing a sync error.
  Future<void> markViewed(String id) async {
    final List<LabTest> current = state.value ?? <LabTest>[];
    final int idx = current.indexWhere((LabTest t) => t.id == id);
    if (idx < 0) return;
    final LabTest before = current[idx];
    if (before.isViewedByPatient) return; // already viewed — no-op

    final List<LabTest> optimistic = List<LabTest>.from(current);
    optimistic[idx] = before.copyWith(
      isViewedByPatient: true,
      patientViewedAt: DateTime.now(),
    );
    state = AsyncValue<List<LabTest>>.data(optimistic);

    try {
      await ref.read(labTestsRepositoryProvider).markLabTestViewed(id);
    } catch (e, st) {
      appLogger.w('markViewed failed — reverting', error: e, stackTrace: st);
      final List<LabTest> reverted = List<LabTest>.from(state.value ?? optimistic);
      final int rIdx = reverted.indexWhere((LabTest t) => t.id == id);
      if (rIdx >= 0) reverted[rIdx] = before;
      state = AsyncValue<List<LabTest>>.data(reverted);
    }
  }
}

final AsyncNotifierProvider<LabTestsController, List<LabTest>>
    labTestsProvider =
    AsyncNotifierProvider<LabTestsController, List<LabTest>>(
  LabTestsController.new,
);

/// Pre-grouped tabs derived from the cached lab tests list. Recomputes
/// only when the underlying list changes.
final Provider<AsyncValue<Map<LabTestGroup, List<LabTest>>>>
    groupedLabTestsProvider =
    Provider<AsyncValue<Map<LabTestGroup, List<LabTest>>>>(
  (Ref ref) {
    final AsyncValue<List<LabTest>> src = ref.watch(labTestsProvider);
    return src.whenData((List<LabTest> all) {
      final Map<LabTestGroup, List<LabTest>> out =
          <LabTestGroup, List<LabTest>>{
        for (final LabTestGroup g in LabTestGroup.values) g: <LabTest>[],
      };
      for (final LabTest t in all) {
        for (final LabTestGroup g in LabTestGroup.values) {
          if (g.includes(t)) out[g]!.add(t);
        }
      }
      return out;
    });
  },
);
