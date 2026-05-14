import 'package:flutter/foundation.dart';

/// One entry in `prescriptions.medications[]`. Mirrors the schema exactly,
/// including the per-medication dispensing flags so partial dispensing
/// (`isDispensed=true` on a subset) renders correctly.
@immutable
class MedicationItem {
  const MedicationItem({
    required this.medicationName,
    required this.dosage,
    required this.frequency,
    required this.duration,
    this.medicationId,
    this.arabicName,
    this.route = 'oral',
    this.instructions,
    this.quantity,
    this.isDispensed = false,
    this.dispensedAt,
  });

  factory MedicationItem.fromJson(Map<String, dynamic> json) {
    DateTime? asDateOrNull(Object? v) =>
        v is String && v.isNotEmpty ? DateTime.parse(v) : null;
    return MedicationItem(
      medicationId: json['medicationId'] as String?,
      medicationName: (json['medicationName'] as String?) ?? '',
      arabicName: json['arabicName'] as String?,
      dosage: (json['dosage'] as String?) ?? '',
      frequency: (json['frequency'] as String?) ?? '',
      duration: (json['duration'] as String?) ?? '',
      route: (json['route'] as String?) ?? 'oral',
      instructions: json['instructions'] as String?,
      quantity: (json['quantity'] as num?)?.toInt(),
      isDispensed: (json['isDispensed'] as bool?) ?? false,
      dispensedAt: asDateOrNull(json['dispensedAt']),
    );
  }

  final String? medicationId;
  final String medicationName;
  final String? arabicName;
  final String dosage;
  final String frequency;
  final String duration;
  final String route;
  final String? instructions;
  final int? quantity;
  final bool isDispensed;
  final DateTime? dispensedAt;

  String get displayName =>
      arabicName != null && arabicName!.isNotEmpty ? arabicName! : medicationName;
}
