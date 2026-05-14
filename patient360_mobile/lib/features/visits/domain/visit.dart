import 'package:flutter/foundation.dart';

import '../../appointments/domain/doctor_summary.dart';
import 'ecg_analysis.dart';
import 'prescribed_medication.dart';
import 'vital_signs.dart';

/// One clinical encounter — mirrors the `visits` collection. Embedded
/// sub-documents (vitalSigns, prescribedMedications, ecgAnalysis) come back
/// inline from the backend; we parse them into nested model classes so the
/// UI never has to fish through raw maps.
@immutable
class Visit {
  const Visit({
    required this.id,
    required this.visitType,
    required this.visitDate,
    required this.status,
    required this.chiefComplaint,
    required this.paymentStatus,
    required this.createdAt,
    this.patientPersonId,
    this.patientChildId,
    this.doctorId,
    this.dentistId,
    this.hospitalId,
    this.appointmentId,
    this.diagnosis,
    this.vitalSigns,
    this.prescribedMedications = const <PrescribedMedication>[],
    this.doctorNotes,
    this.followUpDate,
    this.followUpNotes,
    this.visitPhotoUrl,
    this.visitPhotoUploadedAt,
    this.ecgAnalysis,
    this.doctor,
  });

  factory Visit.fromJson(Map<String, dynamic> json) {
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

    final List<PrescribedMedication> meds =
        (json['prescribedMedications'] as List<dynamic>?)
                ?.map(
                  (dynamic e) => PrescribedMedication.fromJson(
                    (e as Map<dynamic, dynamic>).cast<String, dynamic>(),
                  ),
                )
                .toList() ??
            const <PrescribedMedication>[];

    return Visit(
      id: (json['_id'] ?? json['id']).toString(),
      visitType: (json['visitType'] as String?) ?? 'regular',
      patientPersonId: json['patientPersonId'] as String?,
      patientChildId: json['patientChildId'] as String?,
      doctorId: json['doctorId'] as String?,
      dentistId: json['dentistId'] as String?,
      hospitalId: json['hospitalId'] as String?,
      appointmentId: json['appointmentId'] as String?,
      visitDate: asDate(json['visitDate']),
      status: (json['status'] as String?) ?? 'in_progress',
      chiefComplaint: (json['chiefComplaint'] as String?) ?? '',
      diagnosis: json['diagnosis'] as String?,
      vitalSigns: asMap(json['vitalSigns']) == null
          ? null
          : VitalSigns.fromJson(asMap(json['vitalSigns'])!),
      prescribedMedications: meds,
      doctorNotes: json['doctorNotes'] as String?,
      followUpDate: asDateOrNull(json['followUpDate']),
      followUpNotes: json['followUpNotes'] as String?,
      visitPhotoUrl: json['visitPhotoUrl'] as String?,
      visitPhotoUploadedAt: asDateOrNull(json['visitPhotoUploadedAt']),
      ecgAnalysis: asMap(json['ecgAnalysis']) == null
          ? null
          : EcgAnalysis.fromJson(asMap(json['ecgAnalysis'])!),
      paymentStatus: (json['paymentStatus'] as String?) ?? 'pending',
      createdAt: asDate(json['createdAt'], fallback: DateTime.now()),
      doctor: asMap(json['doctor']) == null
          ? null
          : DoctorSummary.fromJson(asMap(json['doctor'])!),
    );
  }

  final String id;
  final String visitType;
  final String? patientPersonId;
  final String? patientChildId;
  final String? doctorId;
  final String? dentistId;
  final String? hospitalId;
  final String? appointmentId;
  final DateTime visitDate;
  final String status;
  final String chiefComplaint;
  final String? diagnosis;
  final VitalSigns? vitalSigns;
  final List<PrescribedMedication> prescribedMedications;
  final String? doctorNotes;
  final DateTime? followUpDate;
  final String? followUpNotes;
  final String? visitPhotoUrl;
  final DateTime? visitPhotoUploadedAt;
  final EcgAnalysis? ecgAnalysis;
  final String paymentStatus;
  final DateTime createdAt;
  final DoctorSummary? doctor;
}

