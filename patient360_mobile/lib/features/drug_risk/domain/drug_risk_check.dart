// ============================================================================
// DrugRiskCheck - Patient 360 mobile (drug-risk feature)
// ----------------------------------------------------------------------------
// One document in the drug_risk_checks collection. The mobile app receives
// these in two shapes:
//
//   A) POST /api/drug-risk/check returns a minimal projection:
//      { _id, result, isOutOfScope, isHighRisk, createdAt }
//
//   B) GET /api/drug-risk/my-history returns the full document with extras:
//      { _id, patientPersonId, initiatedBy, inputText, profileSnapshot,
//        result, isOutOfScope, isHighRisk, createdAt, updatedAt }
//
// fromJson() handles both shapes — fields not present in the minimal shape
// are simply left null. This way the same model serves both endpoints.
// ============================================================================

import 'package:flutter/foundation.dart';

import 'drug_check_result.dart';

@immutable
class DrugRiskCheck {
  const DrugRiskCheck({
    required this.id,
    required this.result,
    required this.isOutOfScope,
    required this.isHighRisk,
    required this.createdAt,
    this.patientPersonId,
    this.patientChildId,
    this.initiatedBy,
    this.doctorId,
    this.inputText,
    this.profileSnapshot,
    this.updatedAt,
  });

  /// Parse a single check from either the create or history endpoint
  /// response shape. See class-level docstring for the two shapes.
  factory DrugRiskCheck.fromJson(Map<String, dynamic> json) {
    DateTime parseDate(Object? v, {DateTime? fallback}) {
      if (v is String && v.isNotEmpty) {
        return DateTime.tryParse(v) ?? fallback ?? DateTime.now();
      }
      return fallback ?? DateTime.now();
    }

    DateTime? parseDateOrNull(Object? v) {
      if (v is String && v.isNotEmpty) return DateTime.tryParse(v);
      return null;
    }

    DrugCheckResult result;
    final Object? rawResult = json['result'];
    if (rawResult is Map) {
      result = DrugCheckResult.fromJson(rawResult.cast<String, dynamic>());
    } else {
      result = DrugCheckResult.empty();
    }

    DrugProfileSnapshot? snapshot;
    final Object? rawSnapshot = json['profileSnapshot'];
    if (rawSnapshot is Map) {
      snapshot = DrugProfileSnapshot.fromJson(
        rawSnapshot.cast<String, dynamic>(),
      );
    }

    return DrugRiskCheck(
      id: (json['_id'] ?? json['id']).toString(),
      patientPersonId: json['patientPersonId']?.toString(),
      patientChildId: json['patientChildId']?.toString(),
      initiatedBy: json['initiatedBy'] as String?,
      doctorId: json['doctorId']?.toString(),
      inputText: json['inputText'] as String?,
      profileSnapshot: snapshot,
      result: result,
      isOutOfScope: (json['isOutOfScope'] as bool?) ?? false,
      isHighRisk: (json['isHighRisk'] as bool?) ?? false,
      createdAt: parseDate(json['createdAt']),
      updatedAt: parseDateOrNull(json['updatedAt']),
    );
  }

  final String id;

  /// Polymorphic patient reference — exactly one of these is set on real
  /// documents. Both null on the minimal create response.
  final String? patientPersonId;
  final String? patientChildId;

  /// 'patient' for self-inquiries, 'doctor' for doctor-initiated screens.
  /// Null on the minimal create response.
  final String? initiatedBy;
  final String? doctorId;

  /// Raw text the user typed. Only present on history responses (the create
  /// response trims it out to save bandwidth).
  final String? inputText;

  /// Snapshot of the patient profile at the time the check ran. Only present
  /// on history responses.
  final DrugProfileSnapshot? profileSnapshot;

  /// The actual FastAPI/pipeline result. Always present.
  final DrugCheckResult result;

  /// True when the drug was outside the supported categories (painkillers,
  /// respiratory, digestive). Drives the "transparent out-of-scope" message.
  final bool isOutOfScope;

  /// True for مرتفع / متوسط OR when an interaction warning is present.
  /// The UI uses this to escalate the card visual.
  final bool isHighRisk;

  final DateTime createdAt;
  final DateTime? updatedAt;
}

// ============================================================================
// DrugProfileSnapshot — frozen-in-time view of the patient profile that
// drove a given check. Lets the history list explain "this result was
// computed against THIS profile, which may have since changed".
// ============================================================================

@immutable
class DrugProfileSnapshot {
  const DrugProfileSnapshot({
    this.allergies = const <String>[],
    this.chronicDiseases = const <String>[],
    this.geneticDiseases = const <String>[],
    this.currentMedications = const <String>[],
  });

  factory DrugProfileSnapshot.fromJson(Map<String, dynamic> json) {
    List<String> asStringList(Object? raw) {
      if (raw is List) {
        return raw
            .whereType<dynamic>()
            .map((dynamic e) => e?.toString() ?? '')
            .where((String s) => s.isNotEmpty)
            .toList(growable: false);
      }
      return const <String>[];
    }

    return DrugProfileSnapshot(
      allergies: asStringList(json['allergies']),
      chronicDiseases: asStringList(json['chronicDiseases']),
      geneticDiseases: asStringList(json['geneticDiseases']),
      currentMedications: asStringList(json['currentMedications']),
    );
  }

  final List<String> allergies;
  final List<String> chronicDiseases;
  final List<String> geneticDiseases;
  final List<String> currentMedications;
}
