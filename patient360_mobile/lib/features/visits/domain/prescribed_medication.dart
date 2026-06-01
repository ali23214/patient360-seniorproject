import 'package:flutter/foundation.dart';

/// Inline medication entry on a Visit document — `prescribedMedications[i]`.
/// Distinct from the `prescriptions` collection which carries dispensing data.
@immutable
class PrescribedMedication {
  const PrescribedMedication({
    required this.medicationName,
    required this.dosage,
    required this.frequency,
    required this.duration,
    this.medicationId,
    this.route = 'oral',
    this.instructions,
    this.quantity,
  });

  factory PrescribedMedication.fromJson(Map<String, dynamic> json) {
    return PrescribedMedication(
      medicationId: json['medicationId'] as String?,
      medicationName: (json['medicationName'] as String?) ?? '',
      dosage: (json['dosage'] as String?) ?? '',
      frequency: (json['frequency'] as String?) ?? '',
      duration: (json['duration'] as String?) ?? '',
      route: (json['route'] as String?) ?? 'oral',
      instructions: json['instructions'] as String?,
      quantity: (json['quantity'] as num?)?.toInt(),
    );
  }

  final String? medicationId;
  final String medicationName;
  final String dosage;
  final String frequency;
  final String duration;

  /// One of the 7 enum values: oral | topical | injection | inhalation
  /// | sublingual | rectal | other.
  final String route;
  final String? instructions;
  final int? quantity;
}
