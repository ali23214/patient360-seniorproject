// ════════════════════════════════════════════════════════════════════════════
//  ai_prediction.dart  —  Patient 360° (mobile)
//  ──────────────────────────────────────────────────────────────────────────
//  Immutable value object for ONE prediction returned by the FastAPI
//  emergency-triage service. The same shape is used in three contexts:
//
//    1. Top-5 predictions (`topPredictions` / `top5` array)
//    2. Secondary diagnosis (`class_2nd` + `name_ar_2nd` + `conf_2nd`)
//    3. Per-condition predictions inside a multi-condition response
//
//  WIRE FORMAT
//  ───────────
//  The FastAPI service returns probabilities in three inconsistent shapes:
//    • "85.3%"  (string with percent sign)
//    • 85.3     (number 0..100)
//    • 0.853    (normalized 0..1)
//
//  We normalize every reading into the 0..1 range at parse time so
//  consumers don't have to. The web ResultCard uses the same approach
//  via its `parseProb()` helper.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/foundation.dart' show immutable;

/// One AI prediction — a class label, its localized name, and its
/// probability normalized to 0..1.
@immutable
class AiPrediction {
  const AiPrediction({
    required this.className,
    required this.probability,
    this.nameAr,
  });

  /// Build a prediction from a raw FastAPI prediction map. Tolerates every
  /// known shape variation: `prob`/`confidence`, percentage strings, ints,
  /// doubles, and missing fields. Returns null when the input is so
  /// malformed that no useful display can be derived.
  static AiPrediction? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final Map<String, dynamic> m = raw is Map<String, dynamic>
        ? raw
        : Map<String, dynamic>.from(raw);

    final String? cls =
        (m['class'] as String?) ?? (m['className'] as String?);
    if (cls == null || cls.isEmpty) return null;

    return AiPrediction(
      className: cls,
      nameAr: (m['name_ar'] as String?) ?? (m['nameAr'] as String?),
      probability: _parseProb(m['prob'] ?? m['confidence']),
    );
  }

  /// Backend class label, e.g. `"Heart_Attack"`, `"skin_abrasion"`.
  /// Pipe through [humanizeClass] before showing to the user.
  final String className;

  /// Optional Arabic localized name, e.g. `"نوبة قلبية"`.
  final String? nameAr;

  /// Normalized probability 0.0..1.0.
  final double probability;

  /// Percentage as a one-decimal string, e.g. `"85.3%"`. Mirrors the web's
  /// `formatPct()` helper.
  String get percentageLabel =>
      '${(probability * 100).toStringAsFixed(1)}%';

  /// Display name preferring Arabic, falling back to the humanized class.
  String get displayName {
    if (nameAr != null && nameAr!.isNotEmpty) return nameAr!;
    return humanizeClass(className);
  }
}

/// Map a raw class string (`"Heart_Attack"`, `"skin_abrasion"`) to a
/// clean display form (`"Heart Attack"`, `"Skin abrasion"`). Mirrors
/// `humanizeClass()` in the web ResultCard 1:1.
String humanizeClass(String? raw) {
  if (raw == null || raw.isEmpty) return '';
  return raw
      .replaceAll(RegExp(r'[_\-]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

/// Coerce a probability that might arrive as `"85.3%"`, `0.853`, or
/// `85.3` into the 0..1 range. Identical contract to the web's
/// `parseProb()`. Always returns a finite value in [0, 1].
double _parseProb(Object? prob) {
  if (prob is num) {
    if (!prob.isFinite) return 0.0;
    final double v = prob.toDouble();
    return (v > 1 ? v / 100 : v).clamp(0.0, 1.0);
  }
  if (prob is String) {
    final String cleaned = prob.replaceAll('%', '').trim();
    final double? n = double.tryParse(cleaned);
    if (n == null || !n.isFinite) return 0.0;
    return (n > 1 ? n / 100 : n).clamp(0.0, 1.0);
  }
  return 0.0;
}

/// Public-facing version of [_parseProb] for callers that hold a raw
/// numeric/string probability and want the same normalization.
double parseProbability(Object? prob) => _parseProb(prob);

/// Format a probability/confidence value as a percentage with one
/// decimal place. Mirrors the web's `formatPct()` helper.
String formatPercentage(Object? prob) =>
    '${(_parseProb(prob) * 100).toStringAsFixed(1)}%';
