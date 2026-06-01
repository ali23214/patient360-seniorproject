import 'package:flutter/foundation.dart';

import 'person.dart' show ProfilePhoto;

/// Profile for a child under 14 — mirrors the `children` collection.
@immutable
class Child {
  const Child({
    required this.childRegistrationNumber,
    required this.parentNationalId,
    required this.firstName,
    required this.fatherName,
    required this.lastName,
    required this.motherName,
    required this.dateOfBirth,
    required this.gender,
    required this.governorate,
    required this.city,
    required this.address,
    this.id,
    this.parentPersonId,
    this.phoneNumber,
    this.alternativePhoneNumber,
    this.district,
    this.street,
    this.building,
    this.guardianName,
    this.guardianRelationship,
    this.guardianPhoneNumber,
    this.schoolName,
    this.grade,
    this.nationalId,
    this.nationalIdReceivedAt,
    this.hasReceivedNationalId = false,
    this.migrationStatus = 'pending',
    this.profilePhoto,
  });

  factory Child.fromJson(Map<String, dynamic> json) {
    return Child(
      id: json['_id'] as String?,
      childRegistrationNumber: json['childRegistrationNumber'] as String,
      parentNationalId: (json['parentNationalId'] as String?) ?? '',
      parentPersonId: json['parentPersonId'] as String?,
      firstName: json['firstName'] as String,
      fatherName: json['fatherName'] as String,
      lastName: json['lastName'] as String,
      motherName: json['motherName'] as String,
      dateOfBirth: DateTime.parse(json['dateOfBirth'] as String),
      gender: json['gender'] as String,
      governorate: json['governorate'] as String,
      city: json['city'] as String,
      address: json['address'] as String,
      phoneNumber: json['phoneNumber'] as String?,
      alternativePhoneNumber: json['alternativePhoneNumber'] as String?,
      district: json['district'] as String?,
      street: json['street'] as String?,
      building: json['building'] as String?,
      guardianName: json['guardianName'] as String?,
      guardianRelationship: json['guardianRelationship'] as String?,
      guardianPhoneNumber: json['guardianPhoneNumber'] as String?,
      schoolName: json['schoolName'] as String?,
      grade: json['grade'] as String?,
      nationalId: json['nationalId'] as String?,
      nationalIdReceivedAt: json['nationalIdReceivedAt'] == null
          ? null
          : DateTime.parse(json['nationalIdReceivedAt'] as String),
      hasReceivedNationalId:
          (json['hasReceivedNationalId'] as bool?) ?? false,
      migrationStatus: (json['migrationStatus'] as String?) ?? 'pending',
      profilePhoto: json['profilePhoto'] == null
          ? null
          : ProfilePhoto.fromJson(
              (json['profilePhoto'] as Map<dynamic, dynamic>)
                  .cast<String, dynamic>(),
            ),
    );
  }

  final String? id;
  final String childRegistrationNumber;
  final String parentNationalId;
  final String? parentPersonId;
  final String firstName;
  final String fatherName;
  final String lastName;
  final String motherName;
  final DateTime dateOfBirth;
  final String gender;
  final String governorate;
  final String city;
  final String address;
  final String? phoneNumber;
  final String? alternativePhoneNumber;
  final String? district;
  final String? street;
  final String? building;
  final String? guardianName;
  final String? guardianRelationship;
  final String? guardianPhoneNumber;
  final String? schoolName;
  final String? grade;
  final String? nationalId;
  final DateTime? nationalIdReceivedAt;
  final bool hasReceivedNationalId;
  final String migrationStatus;
  final ProfilePhoto? profilePhoto;

  String get fullName => <String>[firstName, fatherName, lastName].join(' ');
}
