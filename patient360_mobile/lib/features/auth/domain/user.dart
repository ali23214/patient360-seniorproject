import 'package:flutter/foundation.dart';

/// Credentials-side view of an authenticated account.
///
/// Shape matches the `user` object returned by POST `/api/auth/login` and
/// GET `/api/auth/verify` (see backend/controllers/authController.js
/// `buildUserResponse`). The backend uses `accountId` rather than `_id`.
@immutable
class User {
  const User({
    required this.id,
    required this.email,
    this.roles = const <String>[],
    this.isActive = true,
    this.isVerified = false,
    this.personId,
    this.childId,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: (json['accountId'] ?? json['_id'] ?? json['id']).toString(),
      email: json['email'] as String,
      roles: (json['roles'] as List<dynamic>?)
              ?.map((dynamic e) => e.toString())
              .toList() ??
          const <String>[],
      isActive: (json['isActive'] as bool?) ?? true,
      isVerified: (json['isVerified'] as bool?) ?? false,
      personId: json['personId'] as String?,
      childId: json['childId'] as String?,
    );
  }

  final String id;
  final String email;
  final List<String> roles;
  final bool isActive;
  final bool isVerified;
  final String? personId;
  final String? childId;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'accountId': id,
        'email': email,
        'roles': roles,
        'isActive': isActive,
        'isVerified': isVerified,
        if (personId != null) 'personId': personId,
        if (childId != null) 'childId': childId,
      };
}
