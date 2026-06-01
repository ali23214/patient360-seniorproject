import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/appointments_repository.dart';
import '../../domain/appointment.dart';
import '../../domain/availability_slot.dart';
import '../../domain/doctor_summary.dart';
import 'appointments_provider.dart';

enum BookingStep { search, slots, confirm }

@immutable
class BookingFlowState {
  const BookingFlowState({
    this.step = BookingStep.search,
    this.specialization,
    this.governorate,
    this.doctors = const AsyncValue<List<DoctorSummary>>.data(
      <DoctorSummary>[],
    ),
    this.selectedDoctor,
    this.slots = const AsyncValue<List<AvailabilitySlot>>.data(
      <AvailabilitySlot>[],
    ),
    this.selectedSlot,
    this.reasonForVisit = '',
    this.priority = 'routine',
    this.isSubmitting = false,
  });

  final BookingStep step;
  final String? specialization;
  final String? governorate;
  final AsyncValue<List<DoctorSummary>> doctors;
  final DoctorSummary? selectedDoctor;
  final AsyncValue<List<AvailabilitySlot>> slots;
  final AvailabilitySlot? selectedSlot;
  final String reasonForVisit;
  final String priority;
  final bool isSubmitting;

  BookingFlowState copyWith({
    BookingStep? step,
    String? specialization,
    String? governorate,
    AsyncValue<List<DoctorSummary>>? doctors,
    Object? selectedDoctor = _unset,
    AsyncValue<List<AvailabilitySlot>>? slots,
    Object? selectedSlot = _unset,
    String? reasonForVisit,
    String? priority,
    bool? isSubmitting,
  }) {
    return BookingFlowState(
      step: step ?? this.step,
      specialization: specialization ?? this.specialization,
      governorate: governorate ?? this.governorate,
      doctors: doctors ?? this.doctors,
      selectedDoctor: identical(selectedDoctor, _unset)
          ? this.selectedDoctor
          : selectedDoctor as DoctorSummary?,
      slots: slots ?? this.slots,
      selectedSlot: identical(selectedSlot, _unset)
          ? this.selectedSlot
          : selectedSlot as AvailabilitySlot?,
      reasonForVisit: reasonForVisit ?? this.reasonForVisit,
      priority: priority ?? this.priority,
      isSubmitting: isSubmitting ?? this.isSubmitting,
    );
  }

  bool get canConfirm =>
      selectedSlot != null && reasonForVisit.trim().isNotEmpty;
}

const Object _unset = Object();

/// Drives the 3-step booking wizard (search → slots → confirm). Auto-disposes
/// via [NotifierProvider.autoDispose] below so closing the sheet fully resets
/// the flow next time it opens.
class BookingFlowController extends Notifier<BookingFlowState> {
  @override
  BookingFlowState build() {
    return const BookingFlowState();
  }

  void setSpecialization(String? v) {
    state = state.copyWith(specialization: v);
  }

  void setGovernorate(String? v) {
    state = state.copyWith(governorate: v);
  }

  Future<void> searchDoctors() async {
    state = state.copyWith(
      doctors: const AsyncValue<List<DoctorSummary>>.loading(),
    );
    state = state.copyWith(
      doctors: await AsyncValue.guard<List<DoctorSummary>>(
        () => ref.read(appointmentsRepositoryProvider).searchDoctors(
              specialization: state.specialization,
              governorate: state.governorate,
            ),
      ),
    );
  }

  Future<void> pickDoctor(DoctorSummary d) async {
    state = state.copyWith(
      selectedDoctor: d,
      step: BookingStep.slots,
      slots: const AsyncValue<List<AvailabilitySlot>>.loading(),
    );
    state = state.copyWith(
      slots: await AsyncValue.guard<List<AvailabilitySlot>>(
        () => ref.read(appointmentsRepositoryProvider).getDoctorSlots(d.id),
      ),
    );
  }

  void pickSlot(AvailabilitySlot slot) {
    state = state.copyWith(selectedSlot: slot, step: BookingStep.confirm);
  }

  void setReason(String v) {
    state = state.copyWith(reasonForVisit: v);
  }

  void setPriority(String v) {
    state = state.copyWith(priority: v);
  }

  void goToSearch() {
    state = state.copyWith(step: BookingStep.search);
  }

  void goToSlots() {
    state = state.copyWith(step: BookingStep.slots);
  }

  /// Posts the booking. Returns the created [Appointment] on success, which
  /// the UI uses to show a confirmation SnackBar. Also invalidates the list
  /// provider so the next read pulls the new row.
  Future<Appointment> confirmBooking() async {
    final AvailabilitySlot? slot = state.selectedSlot;
    final String reason = state.reasonForVisit.trim();
    if (slot == null || reason.isEmpty) {
      throw ArgumentError('slot + reason required before confirm');
    }

    state = state.copyWith(isSubmitting: true);
    try {
      final Appointment booked = await ref
          .read(appointmentsRepositoryProvider)
          .bookAppointment(
            BookAppointmentDto(
              slotId: slot.id,
              appointmentType: 'doctor',
              reasonForVisit: reason,
              priority: state.priority,
            ),
          );
      ref.invalidate(appointmentsProvider);
      return booked;
    } finally {
      state = state.copyWith(isSubmitting: false);
    }
  }
}

final NotifierProvider<BookingFlowController, BookingFlowState>
    bookingFlowProvider =
    NotifierProvider<BookingFlowController, BookingFlowState>(
  BookingFlowController.new,
  isAutoDispose: true,
);
