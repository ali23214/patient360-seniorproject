import 'package:flutter/foundation.dart';

/// Patient-facing view of a doctor suitable for the booking flow.
///
/// Shape matches `GET /api/patient/doctors` (see web api.js `searchDoctors`);
/// some fields are optional because the backend doesn't always join them.
@immutable
class DoctorSummary {
  const DoctorSummary({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.specialization,
    this.averageRating,
    this.consultationFee,
    this.currency,
    this.hospitalAffiliation,
    this.yearsOfExperience,
    this.governorate,
    this.city,
  });

  factory DoctorSummary.fromJson(Map<String, dynamic> json) {
    return DoctorSummary(
      id: (json['_id'] ?? json['id']).toString(),
      firstName: (json['firstName'] as String?) ?? '',
      lastName: (json['lastName'] as String?) ?? '',
      specialization: (json['specialization'] as String?) ?? '',
      averageRating: (json['averageRating'] as num?)?.toDouble(),
      consultationFee: (json['consultationFee'] as num?)?.toDouble(),
      currency: json['currency'] as String?,
      hospitalAffiliation:
          json['hospitalAffiliation'] as String?,
      yearsOfExperience: (json['yearsOfExperience'] as num?)?.toInt(),
      governorate: json['governorate'] as String?,
      city: json['city'] as String?,
    );
  }

  final String id;
  final String firstName;
  final String lastName;
  final String specialization;
  final double? averageRating;
  final double? consultationFee;
  final String? currency;
  final String? hospitalAffiliation;
  final int? yearsOfExperience;
  final String? governorate;
  final String? city;

  /// `د. firstName lastName` for display; preserves RTL auto-direction
  /// because firstName / lastName can contain Arabic script.
  String get displayName => 'د. $firstName $lastName'.trim();
}
