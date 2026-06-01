import 'package:flutter/foundation.dart';

import 'medication_item.dart';

/// Helper: extracts a string ID from a value that might be:
/// - null
/// - a String (already an ID)
/// - a Map (populated object from MongoDB — extract _id)
String? _idAsString(Object? v) {
  if (v == null) return null;
  if (v is String) return v.isEmpty ? null : v;
  if (v is Map) {
    final dynamic id = v['_id'] ?? v['id'];
    return id?.toString();
  }
  return v.toString();
}

/// Mirrors the `prescriptions` collection. The mobile app reads (never
/// writes) prescriptions; pharmacists do the dispensing on a separate
/// surface.
@immutable
class Prescription {
  const Prescription({
    required this.id,
    required this.prescriptionNumber,
    required this.prescriptionDate,
    required this.medications,
    required this.status,
    required this.printCount,
    required this.createdAt,
    required this.updatedAt,
    this.patientPersonId,
    this.patientChildId,
    this.doctorId,
    this.dentistId,
    this.visitId,
    this.expiryDate,
    this.verificationCode,
    this.qrCode,
    this.dispensingId,
    this.prescriptionNotes,
  });

  factory Prescription.fromJson(Map<String, dynamic> json) {
    DateTime asDate(Object? v, {DateTime? fallback}) {
      if (v is String && v.isNotEmpty) return DateTime.parse(v);
      return fallback ?? DateTime.fromMillisecondsSinceEpoch(0);
    }

    DateTime? asDateOrNull(Object? v) =>
        v is String && v.isNotEmpty ? DateTime.parse(v) : null;

    final List<MedicationItem> meds =
        (json['medications'] as List<dynamic>?)
            ?.map(
              (dynamic e) => MedicationItem.fromJson(
                (e as Map<dynamic, dynamic>).cast<String, dynamic>(),
              ),
            )
            .toList() ??
        const <MedicationItem>[];

    return Prescription(
      id: (json['_id'] ?? json['id']).toString(),
      prescriptionNumber: (json['prescriptionNumber'] as String?) ?? '',
      patientPersonId: _idAsString(json['patientPersonId']),
      patientChildId: _idAsString(json['patientChildId']),
      doctorId: _idAsString(json['doctorId']),
      dentistId: _idAsString(json['dentistId']),
      visitId: _idAsString(json['visitId']),
      prescriptionDate: asDate(json['prescriptionDate']),
      expiryDate: asDateOrNull(json['expiryDate']),
      medications: meds,
      status: (json['status'] as String?) ?? 'active',
      verificationCode: json['verificationCode'] as String?,
      qrCode: json['qrCode'] as String?,
      printCount: (json['printCount'] as num?)?.toInt() ?? 0,
      dispensingId: _idAsString(json['dispensingId']),
      prescriptionNotes: json['prescriptionNotes'] as String?,
      createdAt: asDate(json['createdAt'], fallback: DateTime.now()),
      updatedAt: asDate(json['updatedAt'], fallback: DateTime.now()),
    );
  }

  final String id;
  final String prescriptionNumber;
  final String? patientPersonId;
  final String? patientChildId;
  final String? doctorId;
  final String? dentistId;
  final String? visitId;
  final DateTime prescriptionDate;
  final DateTime? expiryDate;
  final List<MedicationItem> medications;

  /// One of: active | dispensed | partially_dispensed | expired | cancelled.
  final String status;
  final String? verificationCode;
  final String? qrCode;
  final int printCount;
  final String? dispensingId;
  final String? prescriptionNotes;
  final DateTime createdAt;
  final DateTime updatedAt;

  /// True when the backend has flipped to `dispensed` *or* every embedded
  /// medication is locally marked as dispensed. Either condition hides the
  /// QR card so the patient can't accidentally show a finalized Rx.
  bool get isFullyDispensed =>
      status == 'dispensed' ||
      (medications.isNotEmpty &&
          medications.every((MedicationItem m) => m.isDispensed));

  /// Earliest non-null `dispensedAt` across the embedded meds — i.e. when
  /// the pharmacy first started fulfilling this prescription.
  DateTime? get firstDispensedAt {
    final List<DateTime> dates =
        medications
            .map((MedicationItem m) => m.dispensedAt)
            .whereType<DateTime>()
            .toList()
          ..sort();
    return dates.isEmpty ? null : dates.first;
  }

  bool get isActive => status == 'active' || status == 'partially_dispensed';
}

/// UI bucket mapping for the 3-tab filter.
enum PrescriptionGroup { active, dispensed, expired }

extension PrescriptionGrouping on PrescriptionGroup {
  static const Map<PrescriptionGroup, Set<String>> _statusSets =
      <PrescriptionGroup, Set<String>>{
        PrescriptionGroup.active: <String>{'active', 'partially_dispensed'},
        PrescriptionGroup.dispensed: <String>{'dispensed'},
        PrescriptionGroup.expired: <String>{'expired', 'cancelled'},
      };

  Set<String> get statuses => _statusSets[this]!;

  bool includes(String status) => statuses.contains(status);
}
