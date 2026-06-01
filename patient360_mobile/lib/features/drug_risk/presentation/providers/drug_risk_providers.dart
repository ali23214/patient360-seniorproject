// ============================================================================
// Drug Risk Providers - Patient 360 mobile
// ----------------------------------------------------------------------------
// Two controllers:
//   * DrugCheckController       - submits a check and exposes the latest
//                                  result (AsyncValue<DrugRiskCheck?>)
//   * DrugRiskHistoryController - paginated list of past checks
//                                  (AsyncValue<List<DrugRiskCheck>>)
//
// After every successful check, DrugCheckController prompts the history
// controller to refresh — so the list at the bottom of the page updates
// in real time without manual pull-to-refresh.
// ============================================================================

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/drug_risk_repository.dart';
import '../../domain/drug_risk_check.dart';

// Type aliases - keep generic types on a SINGLE line so encoding/wrapping
// issues from text editors cannot break the parser (lesson learned from
// the ai_providers.dart UTF-16 incident).
typedef _ChecksList = List<DrugRiskCheck>;
typedef _HistoryState = AsyncValue<_ChecksList>;
typedef _CheckState = AsyncValue<DrugRiskCheck?>;

// ============================================================================
// DrugCheckController
// ============================================================================

class DrugCheckController extends AsyncNotifier<DrugRiskCheck?> {
  @override
  Future<DrugRiskCheck?> build() async => null;

  /// Submit a drug check. Returns the persisted [DrugRiskCheck] on success
  /// (with the FastAPI pipeline's result), or null on failure (the error
  /// is exposed via `state.hasError` so the UI can surface it).
  ///
  /// On success, also refreshes the history list silently.
  Future<DrugRiskCheck?> submit(String text) async {
    final String trimmed = text.trim();
    if (trimmed.isEmpty) return null;

    state = const _CheckState.loading();

    state = await AsyncValue.guard<DrugRiskCheck?>(
      () => ref.read(drugRiskRepositoryProvider).checkDrug(text: trimmed),
    );

    final DrugRiskCheck? check = state.value;
    if (check != null) {
      // ignore: unawaited_futures
      ref.read(drugRiskHistoryProvider.notifier).refresh();
    }
    return check;
  }

  /// Reset the controller to the empty state. Called when the user taps
  /// "مسح" / clear after viewing a result.
  void clear() {
    state = const _CheckState.data(null);
  }
}

final AsyncNotifierProvider<DrugCheckController, DrugRiskCheck?>
drugCheckControllerProvider =
    AsyncNotifierProvider<DrugCheckController, DrugRiskCheck?>(
      DrugCheckController.new,
    );

// ============================================================================
// DrugRiskHistoryController
// ============================================================================

class DrugRiskHistoryController extends AsyncNotifier<_ChecksList> {
  @override
  Future<_ChecksList> build() async {
    return ref.read(drugRiskRepositoryProvider).getMyHistory();
  }

  /// Re-fetches the history list. Triggered automatically after every
  /// successful check, and manually by pull-to-refresh.
  Future<void> refresh() async {
    state = const _HistoryState.loading();
    state = await AsyncValue.guard<_ChecksList>(
      () => ref.read(drugRiskRepositoryProvider).getMyHistory(),
    );
  }
}

final AsyncNotifierProvider<DrugRiskHistoryController, _ChecksList>
drugRiskHistoryProvider =
    AsyncNotifierProvider<DrugRiskHistoryController, _ChecksList>(
      DrugRiskHistoryController.new,
    );
