import 'package:flutter/foundation.dart';

/// Adult demographic profile — mirrors the `persons` collection.
@immutable
class Person {
  const Person({
    required this.nationalId,
    required this.firstName,
    required this.fatherName,
    required this.lastName,
    required this.motherName,
    required this.dateOfBirth,
    required this.gender,
    required this.governorate,
    required this.city,
    required this.address,
    required this.phoneNumber,
    this.id,
    this.alternativePhoneNumber,
    this.email,
    this.maritalStatus,
    this.occupation,
    this.education,
    this.district,
    this.street,
    this.building,
    this.profilePhoto,
  });

  factory Person.fromJson(Map<String, dynamic> json) {
    return Person(
      id: json['_id'] as String?,
      nationalId: json['nationalId'] as String,
      firstName: json['firstName'] as String,
      fatherName: json['fatherName'] as String,
      lastName: json['lastName'] as String,
      motherName: json['motherName'] as String,
      dateOfBirth: DateTime.parse(json['dateOfBirth'] as String),
      gender: json['gender'] as String,
      governorate: json['governorate'] as String,
      city: json['city'] as String,
      address: json['address'] as String,
      phoneNumber: json['phoneNumber'] as String,
      alternativePhoneNumber: json['alternativePhoneNumber'] as String?,
      email: json['email'] as String?,
      maritalStatus: json['maritalStatus'] as String?,
      occupation: json['occupation'] as String?,
      education: json['education'] as String?,
      district: json['district'] as String?,
      street: json['street'] as String?,
      building: json['building'] as String?,
      profilePhoto: json['profilePhoto'] == null
          ? null
          : ProfilePhoto.fromJson(
              (json['profilePhoto'] as Map<dynamic, dynamic>)
                  .cast<String, dynamic>(),
            ),
    );
  }

  final String? id;
  final String nationalId;
  final String firstName;
  final String fatherName;
  final String lastName;
  final String motherName;
  final DateTime dateOfBirth;
  final String gender;
  final String governorate;
  final String city;
  final String address;
  final String phoneNumber;
  final String? alternativePhoneNumber;
  final String? email;
  final String? maritalStatus;
  final String? occupation;
  final String? education;
  final String? district;
  final String? street;
  final String? building;
  final ProfilePhoto? profilePhoto;

  String get fullName => <String>[firstName, fatherName, lastName].join(' ');
}

@immutable
class ProfilePhoto {
  const ProfilePhoto({this.url, this.uploadedAt});

  factory ProfilePhoto.fromJson(Map<String, dynamic> json) => ProfilePhoto(
        url: json['url'] as String?,
        uploadedAt: json['uploadedAt'] == null
            ? null
            : DateTime.parse(json['uploadedAt'] as String),
      );

  final String? url;
  final DateTime? uploadedAt;
}
