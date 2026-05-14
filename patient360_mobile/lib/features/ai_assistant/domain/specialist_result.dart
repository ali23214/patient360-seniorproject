import 'package:flutter/foundation.dart';

/// AI specialist-recommender output. The mobile app never persists this —
/// it's purely an ephemeral suggestion tied to one user query.
@immutable
class SpecialistResult {
  const SpecialistResult({
    required this.specialization,
    required this.arabicSpecialization,
    required this.reasoning,
    required this.confidence,
    this.diseaseGuess,
    this.arabicDisease,
  });

  factory SpecialistResult.fromJson(Map<String, dynamic> json) {
    return SpecialistResult(
      specialization: (json['specialization'] as String?) ?? '',
      arabicSpecialization:
          (json['arabicSpecialization'] as String?) ?? '',
      reasoning: (json['reasoning'] as String?) ?? '',
      confidence: (json['confidence'] as num?)?.toDouble() ?? 0,
      diseaseGuess: json['diseaseGuess'] as String?,
      arabicDisease: json['arabicDisease'] as String?,
    );
  }

  final String specialization;
  final String arabicSpecialization;
  final String reasoning;

  /// 0.0..1.0 — drives the gradient on [ConfidenceBar].
  final double confidence;
  final String? diseaseGuess;
  final String? arabicDisease;
}
