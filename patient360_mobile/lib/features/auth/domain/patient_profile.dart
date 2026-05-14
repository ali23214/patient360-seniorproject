import 'package:flutter/foundation.dart';

/// Static medical profile — mirrors the `patients` collection.
@immutable
class PatientProfile {
  const PatientProfile({
    this.id,
    this.personId,
    this.childId,
    this.bloodType,
    this.rhFactor,
    this.height,
    this.weight,
    this.bmi,
    this.smokingStatus,
    this.alcoholConsumption,
    this.exerciseFrequency,
    this.dietType,
    this.chronicDiseases = const <String>[],
    this.allergies = const <String>[],
    this.familyHistory = const <String>[],
    this.currentMedications = const <String>[],
    this.previousSurgeries = const <PreviousSurgery>[],
    this.emergencyContact,
    this.medicalCardNumber,
    this.totalVisits,
    this.lastVisitDate,
  });

  factory PatientProfile.fromJson(Map<String, dynamic> json) {
    List<String> asStringList(Object? raw) =>
        (raw as List<dynamic>?)?.map((dynamic e) => e.toString()).toList() ??
        const <String>[];

    return PatientProfile(
      id: json['_id'] as String?,
      personId: json['personId'] as String?,
      childId: json['childId'] as String?,
      bloodType: json['bloodType'] as String?,
      rhFactor: json['rhFactor'] as String?,
      height: json['height'] as num?,
      weight: json['weight'] as num?,
      bmi: json['bmi'] as num?,
      smokingStatus: json['smokingStatus'] as String?,
      alcoholConsumption: json['alcoholConsumption'] as String?,
      exerciseFrequency: json['exerciseFrequency'] as String?,
      dietType: json['dietType'] as String?,
      chronicDiseases: asStringList(json['chronicDiseases']),
      allergies: asStringList(json['allergies']),
      familyHistory: asStringList(json['familyHistory']),
      currentMedications: asStringList(json['currentMedications']),
      previousSurgeries: (json['previousSurgeries'] as List<dynamic>?)
              ?.map(
                (dynamic e) => PreviousSurgery.fromJson(
                  (e as Map<dynamic, dynamic>).cast<String, dynamic>(),
                ),
              )
              .toList() ??
          const <PreviousSurgery>[],
      emergencyContact: json['emergencyContact'] == null
          ? null
          : EmergencyContact.fromJson(
              (json['emergencyContact'] as Map<dynamic, dynamic>)
                  .cast<String, dynamic>(),
            ),
      medicalCardNumber: json['medicalCardNumber'] as String?,
      totalVisits: (json['totalVisits'] as num?)?.toInt(),
      lastVisitDate: json['lastVisitDate'] == null
          ? null
          : DateTime.parse(json['lastVisitDate'] as String),
    );
  }

  final String? id;
  final String? personId;
  final String? childId;
  final String? bloodType;
  final String? rhFactor;
  final num? height;
  final num? weight;
  final num? bmi;
  final String? smokingStatus;
  final String? alcoholConsumption;
  final String? exerciseFrequency;
  final String? dietType;
  final List<String> chronicDiseases;
  final List<String> allergies;
  final List<String> familyHistory;
  final List<String> currentMedications;
  final List<PreviousSurgery> previousSurgeries;
  final EmergencyContact? emergencyContact;
  final String? medicalCardNumber;
  final int? totalVisits;
  final DateTime? lastVisitDate;
}

@immutable
class PreviousSurgery {
  const PreviousSurgery({
    required this.surgeryName,
    this.surgeryDate,
    this.hospital,
    this.notes,
  });

  factory PreviousSurgery.fromJson(Map<String, dynamic> json) =>
      PreviousSurgery(
        surgeryName: json['surgeryName'] as String,
        surgeryDate: json['surgeryDate'] == null
            ? null
            : DateTime.parse(json['surgeryDate'] as String),
        hospital: json['hospital'] as String?,
        notes: json['notes'] as String?,
      );

  final String surgeryName;
  final DateTime? surgeryDate;
  final String? hospital;
  final String? notes;
}

@immutable
class EmergencyContact {
  const EmergencyContact({
    required this.name,
    required this.relationship,
    required this.phoneNumber,
    this.alternativePhoneNumber,
  });

  factory EmergencyContact.fromJson(Map<String, dynamic> json) =>
      EmergencyContact(
        name: json['name'] as String,
        relationship: json['relationship'] as String,
        phoneNumber: json['phoneNumber'] as String,
        alternativePhoneNumber: json['alternativePhoneNumber'] as String?,
      );

  final String name;
  final String relationship;
  final String phoneNumber;
  final String? alternativePhoneNumber;
}
