// ════════════════════════════════════════════════════════════════════════════
//  Visit (domain model)
//  ──────────────────────────────────────────────────────────────────────────
//  Mirrors the `visits` collection. Some fields (appointmentId, doctorId,
//  hospitalId, patientPersonId, patientChildId) can come back from the
//  backend in *either* of two shapes depending on whether the route
//  populated them:
//    • String     — raw ObjectId, e.g. "69e78cabc45fded36723ed3b"
//    • Object/Map — populated document, e.g. { "_id": "...", "name": "..." }
//  The `_asIdString` helper accepts both and returns the id string, so the
//  parser never crashes when a route changes its populate strategy.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/foundation.dart';

import '../../appointments/domain/doctor_summary.dart';
import 'ecg_analysis.dart';
import 'prescribed_medication.dart';
import 'vital_signs.dart';

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

    // ── doctor: prefer the explicit summary object if the route populated
    //    it, otherwise fall back to the doctor field if doctorId itself
    //    came in as a populated object.
    final Map<String, dynamic>? doctorMap =
        asMap(json['doctor']) ?? asMap(json['doctorId']);

    return Visit(
      id: (json['_id'] ?? json['id']).toString(),
      visitType: (json['visitType'] as String?) ?? 'regular',
      patientPersonId: _asIdString(json['patientPersonId']),
      patientChildId: _asIdString(json['patientChildId']),
      doctorId: _asIdString(json['doctorId']),
      dentistId: _asIdString(json['dentistId']),
      hospitalId: _asIdString(json['hospitalId']),
      appointmentId: _asIdString(json['appointmentId']),
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
      doctor: doctorMap == null ? null : DoctorSummary.fromJson(doctorMap),
    );
  }

  /// Coerces a backend ObjectId field that may arrive as either:
  ///   • a raw string  ("69e78cab...")
  ///   • a populated   Map (with `_id` or `id` inside)
  ///   • null / missing
  /// into a String id, or null when nothing usable is present.
  ///
  /// This guards against the route flipping its populate strategy — a
  /// change on the backend should never crash JSON parsing on the client.
  static String? _asIdString(Object? v) {
    if (v == null) return null;
    if (v is String) return v.isEmpty ? null : v;
    if (v is Map) {
      final Object? raw = v['_id'] ?? v['id'];
      if (raw is String && raw.isNotEmpty) return raw;
      if (raw != null) return raw.toString();
    }
    return null;
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
