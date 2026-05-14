import 'package:flutter/foundation.dart';

/// Embedded vital signs sub-document on a [Visit]. Mirrors the 9-field
/// schema in `backend/models/Visit.js`. Every field is nullable because the
/// doctor enters whichever measurements they took at this visit.
@immutable
class VitalSigns {
  const VitalSigns({
    this.bloodPressureSystolic,
    this.bloodPressureDiastolic,
    this.heartRate,
    this.oxygenSaturation,
    this.bloodGlucose,
    this.temperature,
    this.weight,
    this.height,
    this.respiratoryRate,
  });

  factory VitalSigns.fromJson(Map<String, dynamic> json) {
    num? n(Object? v) => v as num?;
    return VitalSigns(
      bloodPressureSystolic: n(json['bloodPressureSystolic']),
      bloodPressureDiastolic: n(json['bloodPressureDiastolic']),
      heartRate: n(json['heartRate']),
      oxygenSaturation: n(json['oxygenSaturation']),
      bloodGlucose: n(json['bloodGlucose']),
      temperature: n(json['temperature']),
      weight: n(json['weight']),
      height: n(json['height']),
      respiratoryRate: n(json['respiratoryRate']),
    );
  }

  final num? bloodPressureSystolic;
  final num? bloodPressureDiastolic;
  final num? heartRate;
  final num? oxygenSaturation;
  final num? bloodGlucose;
  final num? temperature;
  final num? weight;
  final num? height;
  final num? respiratoryRate;

  /// True when at least one measurement is present.
  bool get hasAny =>
      bloodPressureSystolic != null ||
      bloodPressureDiastolic != null ||
      heartRate != null ||
      oxygenSaturation != null ||
      bloodGlucose != null ||
      temperature != null ||
      weight != null ||
      height != null ||
      respiratoryRate != null;

  /// Display units for each numeric field. Used by [VitalSignsGrid].
  static const Map<String, String> units = <String, String>{
    'bloodPressureSystolic': 'mmHg',
    'bloodPressureDiastolic': 'mmHg',
    'heartRate': 'نبضة/دقيقة',
    'oxygenSaturation': '%',
    'bloodGlucose': 'mg/dL',
    'temperature': '°C',
    'weight': 'كغ',
    'height': 'سم',
    'respiratoryRate': 'نفس/دقيقة',
  };
}
