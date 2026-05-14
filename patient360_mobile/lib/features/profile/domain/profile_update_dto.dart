import 'package:flutter/foundation.dart';

/// Editable subset of the patient profile that the mobile app permits.
/// Fields the web also forbids editing (email, nationalId, dateOfBirth,
/// firstName/fatherName/lastName) are intentionally absent.
@immutable
class ProfileUpdateDto {
  const ProfileUpdateDto({
    required this.phoneNumber,
    required this.address,
    required this.governorate,
    required this.city,
    this.alternativePhoneNumber,
    this.bloodType,
    this.height,
    this.weight,
    this.smokingStatus,
    this.allergies = const <String>[],
    this.chronicDiseases = const <String>[],
    this.emergencyContact,
  });

  final String phoneNumber;
  final String? alternativePhoneNumber;
  final String address;

  /// One of 14 schema-validated enum values — see
  /// [ArabicLabels.governorate].
  final String governorate;
  final String city;

  /// One of: A+, A-, B+, B-, AB+, AB-, O+, O-, unknown. Stored separately
  /// from rhFactor in the backend; client-side we treat them as one.
  final String? bloodType;
  final num? height;
  final num? weight;
  final String? smokingStatus;
  final List<String> allergies;
  final List<String> chronicDiseases;
  final EmergencyContactDto? emergencyContact;

  bool get hasChanges => true; // computed by caller via copy comparisons

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'phoneNumber': phoneNumber,
      if (alternativePhoneNumber != null && alternativePhoneNumber!.isNotEmpty)
        'alternativePhoneNumber': alternativePhoneNumber,
      'address': address,
      'governorate': governorate,
      'city': city,
      if (bloodType != null && bloodType!.isNotEmpty) 'bloodType': bloodType,
      if (height != null) 'height': height,
      if (weight != null) 'weight': weight,
      if (smokingStatus != null && smokingStatus!.isNotEmpty)
        'smokingStatus': smokingStatus,
      'allergies': allergies,
      'chronicDiseases': chronicDiseases,
      if (emergencyContact != null)
        'emergencyContact': emergencyContact!.toJson(),
    };
  }
}

@immutable
class EmergencyContactDto {
  const EmergencyContactDto({
    required this.name,
    required this.relationship,
    required this.phoneNumber,
  });

  final String name;
  final String relationship;
  final String phoneNumber;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'name': name,
        'relationship': relationship,
        'phoneNumber': phoneNumber,
      };
}
