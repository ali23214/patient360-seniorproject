import 'package:flutter/foundation.dart';

import 'child.dart';
import 'patient_profile.dart';
import 'person.dart';
import 'user.dart';

/// Top-level in-memory representation of a logged-in patient.
///
/// Exactly one of [person] / [child] is populated. Not JSON-serialized —
/// assembled from the login response ([jwt] + [user]) plus GET
/// `/api/patient/profile` ([person] or [child], and [patient]).
@immutable
class AuthSession {
  const AuthSession({
    required this.jwt,
    required this.user,
    required this.patient,
    required this.isMinor,
    this.person,
    this.child,
  });

  final String jwt;
  final User user;
  final PatientProfile patient;
  final bool isMinor;
  final Person? person;
  final Child? child;

  /// Resolved patient ObjectId in whichever identity collection applies.
  String? get identityId => isMinor ? child?.id : person?.id;
}
