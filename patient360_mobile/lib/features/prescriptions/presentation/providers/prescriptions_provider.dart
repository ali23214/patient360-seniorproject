import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/prescriptions_repository.dart';
import '../../domain/prescription.dart';

class PrescriptionsController extends AsyncNotifier<List<Prescription>> {
  @override
  Future<List<Prescription>> build() async {
    return ref
        .watch(prescriptionsRepositoryProvider)
        .getPrescriptions();
  }

  Future<void> refresh() async {
    state = const AsyncValue<List<Prescription>>.loading();
    state = await AsyncValue.guard<List<Prescription>>(
      () => ref
          .read(prescriptionsRepositoryProvider)
          .getPrescriptions(),
    );
  }
}

final AsyncNotifierProvider<PrescriptionsController, List<Prescription>>
    prescriptionsProvider =
    AsyncNotifierProvider<PrescriptionsController, List<Prescription>>(
  PrescriptionsController.new,
);

/// Convenience reader: pre-grouped prescriptions for the 3-tab filter.
/// Recomputes only when the underlying list changes.
final Provider<AsyncValue<Map<PrescriptionGroup, List<Prescription>>>>
    groupedPrescriptionsProvider = Provider<
        AsyncValue<Map<PrescriptionGroup, List<Prescription>>>>(
  (Ref ref) {
    final AsyncValue<List<Prescription>> src =
        ref.watch(prescriptionsProvider);
    return src.whenData(
      (List<Prescription> all) {
        final Map<PrescriptionGroup, List<Prescription>> out =
            <PrescriptionGroup, List<Prescription>>{
          for (final PrescriptionGroup g in PrescriptionGroup.values)
            g: <Prescription>[],
        };
        for (final Prescription p in all) {
          for (final PrescriptionGroup g in PrescriptionGroup.values) {
            if (g.includes(p.status)) {
              out[g]!.add(p);
              break;
            }
          }
        }
        return out;
      },
    );
  },
);
