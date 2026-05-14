import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/visits_repository.dart';
import '../../domain/visit.dart';

/// Caches the patient's visits; the repository sorts by visitDate desc.
class VisitsController extends AsyncNotifier<List<Visit>> {
  @override
  Future<List<Visit>> build() async {
    return ref.watch(visitsRepositoryProvider).getVisits();
  }

  Future<void> refresh() async {
    state = const AsyncValue<List<Visit>>.loading();
    state = await AsyncValue.guard<List<Visit>>(
      () => ref.read(visitsRepositoryProvider).getVisits(),
    );
  }
}

final AsyncNotifierProvider<VisitsController, List<Visit>> visitsProvider =
    AsyncNotifierProvider<VisitsController, List<Visit>>(
  VisitsController.new,
);

/// Tracks which visit cards are expanded. Feature-scoped local state — does
/// not cross navigation boundaries because go_router rebuilds the screen.
class ExpandedVisitsController extends Notifier<Set<String>> {
  @override
  Set<String> build() => const <String>{};

  void toggle(String id) {
    final Set<String> next = <String>{...state};
    if (next.contains(id)) {
      next.remove(id);
    } else {
      next.add(id);
    }
    state = next;
  }
}

final NotifierProvider<ExpandedVisitsController, Set<String>>
    expandedVisitsProvider =
    NotifierProvider<ExpandedVisitsController, Set<String>>(
  ExpandedVisitsController.new,
);
