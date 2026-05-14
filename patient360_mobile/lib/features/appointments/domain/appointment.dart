import 'package:flutter/foundation.dart';

import 'doctor_summary.dart';

/// Mirrors the `appointments` collection. Every field from the frozen schema
/// is represented; write paths (book/cancel) ship only the subset the backend
/// expects.
///
/// Grouping buckets used by the appointments screen:
///   upcoming  → scheduled | confirmed | checked_in | in_progress
///   past      → completed
///   cancelled → cancelled | no_show | rescheduled
@immutable
class Appointment {
  const Appointment({
    required this.id,
    required this.appointmentType,
    required this.appointmentDate,
    required this.appointmentTime,
    required this.reasonForVisit,
    required this.status,
    required this.bookingMethod,
    required this.priority,
    required this.paymentStatus,
    required this.createdAt,
    required this.updatedAt,
    this.patientPersonId,
    this.patientChildId,
    this.doctorId,
    this.dentistId,
    this.laboratoryId,
    this.hospitalId,
    this.slotId,
    this.estimatedDuration,
    this.cancellationReason,
    this.cancelledAt,
    this.paymentMethod,
    this.visitId,
    this.notes,
    this.doctor,
  });

  factory Appointment.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic>? asMap(Object? v) {
      if (v is Map<String, dynamic>) return v;
      if (v is Map) return v.cast<String, dynamic>();
      return null;
    }

    DateTime asDate(Object? v, {DateTime? fallback}) {
      if (v is String && v.isNotEmpty) return DateTime.parse(v);
      return fallback ?? DateTime.fromMillisecondsSinceEpoch(0);
    }

    DateTime? asDateOrNull(Object? v) =>
        v is String && v.isNotEmpty ? DateTime.parse(v) : null;

    String? asId(Object? v) {
      if (v == null) return null;
      if (v is String) return v.isEmpty ? null : v;
      if (v is Map) {
        final id = v['_id'] ?? v['id'];
        return id?.toString();
      }
      return v.toString();
    }

    return Appointment(
      id: (json['_id'] ?? json['id']).toString(),
      appointmentType: (json['appointmentType'] as String?) ?? 'doctor',
      patientPersonId: asId(json['patientPersonId']),
      patientChildId: asId(json['patientChildId']),
      doctorId: asId(json['doctorId']),
      dentistId: asId(json['dentistId']),
      laboratoryId: asId(json['laboratoryId']),
      hospitalId: asId(json['hospitalId']),
      slotId: asId(json['slotId']),
      appointmentDate: asDate(json['appointmentDate']),
      appointmentTime: (json['appointmentTime'] as String?) ?? '00:00',
      estimatedDuration: (json['estimatedDuration'] as num?)?.toInt(),
      reasonForVisit: (json['reasonForVisit'] as String?) ?? '',
      status: (json['status'] as String?) ?? 'scheduled',
      bookingMethod: (json['bookingMethod'] as String?) ?? 'online',
      cancellationReason: json['cancellationReason'] as String?,
      cancelledAt: asDateOrNull(json['cancelledAt']),
      priority: (json['priority'] as String?) ?? 'routine',
      paymentStatus: (json['paymentStatus'] as String?) ?? 'pending',
      paymentMethod: json['paymentMethod'] as String?,
      visitId: asId(json['visitId']),
      notes: json['notes'] as String?,
      createdAt: asDate(json['createdAt'], fallback: DateTime.now()),
      updatedAt: asDate(json['updatedAt'], fallback: DateTime.now()),
      doctor: () {
        // إذا الباك إند populated الـ doctorId، خذ منه DoctorSummary
        final doctorIdField = json['doctorId'];
        if (doctorIdField is Map) {
          return DoctorSummary.fromJson(asMap(doctorIdField)!);
        }
        // وإلا، استخدم حقل doctor المنفصل لو موجود
        final doctorMap = asMap(json['doctor']);
        return doctorMap == null ? null : DoctorSummary.fromJson(doctorMap);
      }(),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    '_id': id,
    'appointmentType': appointmentType,
    if (patientPersonId != null) 'patientPersonId': patientPersonId,
    if (patientChildId != null) 'patientChildId': patientChildId,
    if (doctorId != null) 'doctorId': doctorId,
    if (dentistId != null) 'dentistId': dentistId,
    if (laboratoryId != null) 'laboratoryId': laboratoryId,
    if (hospitalId != null) 'hospitalId': hospitalId,
    if (slotId != null) 'slotId': slotId,
    'appointmentDate': appointmentDate.toIso8601String(),
    'appointmentTime': appointmentTime,
    if (estimatedDuration != null) 'estimatedDuration': estimatedDuration,
    'reasonForVisit': reasonForVisit,
    'status': status,
    'bookingMethod': bookingMethod,
    if (cancellationReason != null) 'cancellationReason': cancellationReason,
    if (cancelledAt != null) 'cancelledAt': cancelledAt!.toIso8601String(),
    'priority': priority,
    'paymentStatus': paymentStatus,
    if (paymentMethod != null) 'paymentMethod': paymentMethod,
    if (visitId != null) 'visitId': visitId,
    if (notes != null) 'notes': notes,
    'createdAt': createdAt.toIso8601String(),
    'updatedAt': updatedAt.toIso8601String(),
  };

  final String id;
  final String appointmentType;
  final String? patientPersonId;
  final String? patientChildId;
  final String? doctorId;
  final String? dentistId;
  final String? laboratoryId;
  final String? hospitalId;
  final String? slotId;
  final DateTime appointmentDate;
  final String appointmentTime;
  final int? estimatedDuration;
  final String reasonForVisit;
  final String status;
  final String bookingMethod;
  final String? cancellationReason;
  final DateTime? cancelledAt;
  final String priority;
  final String paymentStatus;
  final String? paymentMethod;
  final String? visitId;
  final String? notes;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DoctorSummary? doctor;
}

/// Payload for `POST /api/patient/appointments`.
@immutable
class BookAppointmentDto {
  const BookAppointmentDto({
    required this.slotId,
    required this.appointmentType,
    required this.reasonForVisit,
    this.priority = 'routine',
    this.notes,
  });

  final String slotId;
  final String appointmentType;
  final String reasonForVisit;
  final String priority;
  final String? notes;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'slotId': slotId,
    'appointmentType': appointmentType,
    'reasonForVisit': reasonForVisit,
    'priority': priority,
    if (notes != null && notes!.isNotEmpty) 'notes': notes,
  };
}

/// The three UI buckets mapped from the `status` enum.
enum AppointmentGroup { upcoming, past, cancelled }

extension AppointmentGrouping on AppointmentGroup {
  static const Map<AppointmentGroup, Set<String>> _statusSets =
      <AppointmentGroup, Set<String>>{
        AppointmentGroup.upcoming: <String>{
          'scheduled',
          'confirmed',
          'checked_in',
          'in_progress',
        },
        AppointmentGroup.past: <String>{'completed'},
        AppointmentGroup.cancelled: <String>{
          'cancelled',
          'no_show',
          'rescheduled',
        },
      };

  Set<String> get statuses => _statusSets[this]!;

  bool includes(String status) => statuses.contains(status);
}

/// Splits a flat list of appointments into the three UI buckets.
Map<AppointmentGroup, List<Appointment>> groupAppointments(
  List<Appointment> appointments,
) {
  final Map<AppointmentGroup, List<Appointment>> out =
      <AppointmentGroup, List<Appointment>>{
        AppointmentGroup.upcoming: <Appointment>[],
        AppointmentGroup.past: <Appointment>[],
        AppointmentGroup.cancelled: <Appointment>[],
      };
  for (final Appointment a in appointments) {
    for (final AppointmentGroup g in AppointmentGroup.values) {
      if (g.includes(a.status)) {
        out[g]!.add(a);
        break;
      }
    }
  }
  return out;
}
