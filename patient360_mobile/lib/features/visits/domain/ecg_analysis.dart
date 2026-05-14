import 'package:flutter/foundation.dart';

/// Single class probability emitted by the ECG AI model.
@immutable
class EcgPrediction {
  const EcgPrediction({
    required this.className,
    this.confidence,
    this.arabicLabel,
    this.englishLabel,
  });

  factory EcgPrediction.fromJson(Map<String, dynamic> json) {
    return EcgPrediction(
      className: (json['class'] as String?) ?? '',
      confidence: (json['confidence'] as num?)?.toDouble(),
      arabicLabel: json['arabicLabel'] as String?,
      englishLabel: json['englishLabel'] as String?,
    );
  }

  /// Maps to the schema's reserved `class` keyword. Renamed locally because
  /// `class` cannot be used as an identifier in Dart.
  final String className;

  /// Probability in 0..100 (per the schema's percentage representation).
  final double? confidence;
  final String? arabicLabel;
  final String? englishLabel;

  /// Best label to show; falls back to className when no localization exists.
  String get displayLabel => arabicLabel ?? englishLabel ?? className;
}

@immutable
class EcgAnalysis {
  const EcgAnalysis({
    required this.analyzedAt,
    this.ecgImageUrl,
    this.topPrediction,
    this.recommendation,
    this.predictions = const <EcgPrediction>[],
    this.modelVersion,
  });

  factory EcgAnalysis.fromJson(Map<String, dynamic> json) {
    final String? at = json['analyzedAt'] as String?;
    return EcgAnalysis(
      analyzedAt: at == null ? DateTime.now() : DateTime.parse(at),
      ecgImageUrl: json['ecgImageUrl'] as String?,
      topPrediction: json['topPrediction'] as String?,
      recommendation: json['recommendation'] as String?,
      modelVersion: json['modelVersion'] as String?,
      predictions: (json['predictions'] as List<dynamic>?)
              ?.map(
                (dynamic e) => EcgPrediction.fromJson(
                  (e as Map<dynamic, dynamic>).cast<String, dynamic>(),
                ),
              )
              .toList() ??
          const <EcgPrediction>[],
    );
  }

  final DateTime analyzedAt;
  final String? ecgImageUrl;
  final String? topPrediction;
  final String? recommendation;
  final List<EcgPrediction> predictions;
  final String? modelVersion;
}
