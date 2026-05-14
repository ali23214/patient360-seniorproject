import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/appointments_repository.dart';
import '../../domain/appointment.dart';

/// Caches the current patient's appointments. UI groups the flat list into
/// upcoming / past / cancelled buckets via [groupAppointments].
class AppointmentsController
    extends AsyncNotifier<List<Appointment>> {
  @override
  Future<List<Appointment>> build() async {
    return ref.watch(appointmentsRepositoryProvider).getAppointments();
  }

  Future<void> refresh() async {
    state = const AsyncValue<List<Appointment>>.loading();
    state = await AsyncValue.guard<List<Appointment>>(
      () => ref.read(appointmentsRepositoryProvider).getAppointments(),
    );
  }
}

final AsyncNotifierProvider<AppointmentsController, List<Appointment>>
    appointmentsProvider =
    AsyncNotifierProvider<AppointmentsController, List<Appointment>>(
  AppointmentsController.new,
);

/// Convenience: lets widgets read just one bucket without rebuilding when the
/// other two change.
final appointmentsByGroupProvider =
    Provider.family<AsyncValue<List<Appointment>>, AppointmentGroup>(
  (Ref ref, AppointmentGroup group) {
    final AsyncValue<List<Appointment>> src =
        ref.watch(appointmentsProvider);
    return src.whenData(
      (List<Appointment> list) =>
          list.where((Appointment a) => group.includes(a.status)).toList(),
    );
  },
);
