import 'package:flutter/foundation.dart';

/// One "I took my dose" tap. Stored locally for v1; the JSON shape is the
/// same one a future POST `/api/patient/adherence` endpoint will accept,
/// so the existing records can be batch-synced when the backend lands.
@immutable
class AdherenceRecord {
  const AdherenceRecord({
    required this.id,
    required this.prescriptionId,
    required this.medicationIndex,
    required this.scheduledAt,
    required this.takenAt,
    required this.createdAt,
  });

  factory AdherenceRecord.fromJson(Map<String, dynamic> json) {
    return AdherenceRecord(
      id: json['id'] as String,
      prescriptionId: json['prescriptionId'] as String,
      medicationIndex: (json['medicationIndex'] as num).toInt(),
      scheduledAt: DateTime.parse(json['scheduledAt'] as String),
      takenAt: DateTime.parse(json['takenAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  final String id;
  final String prescriptionId;
  final int medicationIndex;
  final DateTime scheduledAt;
  final DateTime takenAt;
  final DateTime createdAt;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'prescriptionId': prescriptionId,
        'medicationIndex': medicationIndex,
        'scheduledAt': scheduledAt.toIso8601String(),
        'takenAt': takenAt.toIso8601String(),
        'createdAt': createdAt.toIso8601String(),
      };
}
