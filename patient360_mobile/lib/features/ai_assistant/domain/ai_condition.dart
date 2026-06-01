// ════════════════════════════════════════════════════════════════════════════
//  ai_condition.dart  —  Patient 360° (mobile)
//  ──────────────────────────────────────────────────────────────────────────
//  Immutable value object for ONE condition entry in the FastAPI
//  emergency-triage `conditions[]` array (multi-symptom mode).
//
//  When the AI service detects multiple symptoms in a single patient
//  text, it returns a `conditions` array instead of a flat single
//  diagnosis. Each entry has its own severity, confidence, first-aid
//  steps, and top-5 predictions — they render as stacked cards in the
//  ResultCard's multi branch.
//
//  WIRE FORMAT — example FastAPI payload
//  ─────────────────────────────────────
//  {
//    "class":           "Heart_Attack",
//    "name_ar":         "نوبة قلبية",
//    "domain":          "emergency",
//    "severity":        "critical",
//    "is_emergency":    true,
//    "call_ambulance":  true,
//    "confidence":      "92.5%",
//    "steps_ar":        ["...", "...", "..."],
//    "top5":            [{ class, name_ar, prob }, ...]
//  }
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/foundation.dart' show immutable;

import '../../../core/utils/logger.dart';
import 'ai_prediction.dart';
import 'severity_level.dart';

/// One condition in a multi-condition triage response.
@immutable
class AiCondition {
  const AiCondition({
    required this.className,
    required this.severity,
    required this.callAmbulance,
    required this.isEmergency,
    required this.firstAidSteps,
    required this.topPredictions,
    this.nameAr,
    this.domain,
    this.confidence,
  });

  /// Parse one condition entry. Returns null when the entry has no
  /// usable identification (no class AND no Arabic name).
  static AiCondition? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final Map<String, dynamic> m = raw is Map<String, dynamic>
        ? raw
        : Map<String, dynamic>.from(raw);

    final String? cls = (m['class'] as String?) ?? (m['className'] as String?);
    final String? nameAr =
        (m['name_ar'] as String?) ?? (m['nameAr'] as String?);

    if ((cls == null || cls.isEmpty) && (nameAr == null || nameAr.isEmpty)) {
      return null;
    }

    final bool callAmbulance = (m['call_ambulance'] as bool?) ??
        (m['callAmbulance'] as bool?) ??
        false;
    final bool isEmergency =
        (m['is_emergency'] as bool?) ?? (m['isEmergency'] as bool?) ?? false;

    return AiCondition(
      className: cls ?? '',
      nameAr: nameAr,
      domain: (m['domain'] as String?),
      severity: _severityFromCondition(
        rawSeverity: m['severity'] as String?,
        isEmergency: isEmergency,
        callAmbulance: callAmbulance,
      ),
      callAmbulance: callAmbulance,
      isEmergency: isEmergency,
      confidence: _readConfidence(m['confidence'] ?? m['conf_str']),
      firstAidSteps: _readSteps(m['steps_ar']),
      topPredictions: _readTopPredictions(m['top5']),
    );
  }

  /// Backend class label, e.g. `"Heart_Attack"`. May be empty when the
  /// FastAPI service only provided the Arabic name.
  final String className;

  /// Optional Arabic localized condition name, e.g. `"نوبة قلبية"`.
  final String? nameAr;

  /// One of: `emergency | wound | eye | medical` — drives the
  /// [DomainBadge] color theme.
  final String? domain;

  /// Mapped severity for the [SeverityBadge] shown on this card.
  final SeverityLevel severity;

  /// `true` ⇒ shows the inline pulsing red emergency banner on this card.
  final bool callAmbulance;

  /// FastAPI's own emergency flag. Almost always coincides with
  /// [callAmbulance] but kept distinct because they're different signals
  /// on the backend (severity classification vs. dispatch recommendation).
  final bool isEmergency;

  /// Normalized confidence 0..1. Null when the FastAPI service didn't
  /// emit a per-condition confidence score.
  final double? confidence;

  /// Numbered list of Arabic first-aid instructions for this condition.
  final List<String> firstAidSteps;

  /// Top-5 predictions ranked by probability — fed to
  /// [TopPredictionsAccordion].
  final List<AiPrediction> topPredictions;

  /// Display name preferring Arabic, falling back to the humanized class.
  String get displayName {
    if (nameAr != null && nameAr!.isNotEmpty) return nameAr!;
    return humanizeClass(className);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Parsing helpers (private to this library)
// ────────────────────────────────────────────────────────────────────────────

/// Mirror of the web's `mapSeverityFromCondition()` helper. Reads three
/// signals — explicit severity string, `is_emergency` flag, and
/// `call_ambulance` flag — and produces a [SeverityLevel] for the UI.
SeverityLevel _severityFromCondition({
  required String? rawSeverity,
  required bool isEmergency,
  required bool callAmbulance,
}) {
  if (callAmbulance || isEmergency) return SeverityLevel.critical;

  final String sev = (rawSeverity ?? '').toLowerCase();
  if (sev.contains('critical') || sev.contains('حرج')) {
    return SeverityLevel.critical;
  }
  if (sev.contains('high') || sev.contains('شديد')) {
    return SeverityLevel.high;
  }
  if (sev.contains('moderate') || sev.contains('متوسط')) {
    return SeverityLevel.moderate;
  }
  return SeverityLevel.low;
}

double? _readConfidence(Object? raw) {
  if (raw == null) return null;
  final double parsed = parseProbability(raw);
  // parseProbability returns 0 for un-parseable input. Distinguish a
  // legitimate 0% (which we treat as null for display purposes) from a
  // small but real value.
  if (parsed == 0 && raw is! num) {
    final String s = raw.toString().trim();
    if (s.isEmpty) return null;
  }
  return parsed;
}

List<String> _readSteps(Object? raw) {
  if (raw is! List) return const <String>[];
  return raw
      .map((Object? e) => e?.toString().trim() ?? '')
      .where((String s) => s.isNotEmpty)
      .toList(growable: false);
}

List<AiPrediction> _readTopPredictions(Object? raw) {
  if (raw is! List) return const <AiPrediction>[];
  final List<AiPrediction> out = <AiPrediction>[];
  for (final Object? entry in raw) {
    try {
      final AiPrediction? p = AiPrediction.fromJson(entry);
      if (p != null) out.add(p);
    } catch (e, st) {
      // One malformed entry should not poison the whole list. Log and
      // skip — the UI tolerates partial top-N lists.
      appLogger.w('AiPrediction parse failed', error: e, stackTrace: st);
    }
  }
  return List<AiPrediction>.unmodifiable(out);
}
