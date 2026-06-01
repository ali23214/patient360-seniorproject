import 'package:flutter/foundation.dart';

import '../../../core/utils/logger.dart';
import 'ai_condition.dart';
import 'ai_prediction.dart';
import 'emergency_location.dart';
import 'severity_level.dart';

/// One row in the `emergency_reports` collection. The mobile app submits
/// new reports and lists past ones — never edits or deletes after the fact
/// (the schema is append-only for v1).
///
/// ─── BACKEND FIELD-NAME TOLERANCE ────────────────────────────────────────
/// The current backend (controllers/emergencyController.js) uses two
/// non-canonical field names that drift from patient360_db_final.js:
///
///   Schema says           Backend writes        We accept
///   ────────────          ─────────────         ─────────
///   aiConfidence          aiConfidenceScore     both ✓
///   voiceNoteUrl          audioUrl              both ✓
///
/// This way the mobile model works against:
///   * the current backend (writes drift fields),
///   * a future fixed backend (writes canonical fields),
///   * the FastAPI proxy version of the response.
///
/// ─── RICH AI PAYLOAD (matches the web ResultCard contract) ───────────────
/// In addition to the seven legacy fields, the backend (when proxying
/// the FastAPI service) emits an enriched response with:
///
///   ambiguityLevel       — `confident | uncertain | very_ambiguous |
///                          multi | out_of_scope | low_confidence_image`
///   diseaseClass         — backend label, e.g. `"Heart_Attack"`
///   diseaseNameAr        — Arabic localized name, e.g. `"نوبة قلبية"`
///   domain               — `emergency | wound | eye | medical`
///   secondaryClass       — alternate diagnosis label
///   secondaryNameAr      — alternate diagnosis Arabic name
///   secondaryConfidence  — 0..1 confidence of the alternate
///   clarifyingQuestions  — list of follow-up questions for the patient
///   topPredictions       — top-5 candidate classes with probabilities
///   conditions           — present only for `multi` mode
///   outOfScopeMessage    — message_ar for `out_of_scope` mode
///
/// All of these are nullable / default-empty so the model continues to
/// work against the legacy minimal payload (no enriched fields).
@immutable
class EmergencyReport {
  const EmergencyReport({
    required this.id,
    required this.reportedAt,
    required this.inputType,
    required this.aiRiskLevel,
    required this.aiFirstAid,
    required this.ambulanceCalled,
    required this.ambulanceStatus,
    required this.status,
    this.patientPersonId,
    this.patientChildId,
    this.textDescription,
    this.imageUrl,
    this.voiceNoteUrl,
    this.voiceTranscript,
    this.aiAssessment,
    this.aiConfidence,
    this.aiRawResponse,
    this.aiModelVersion,
    this.aiProcessedAt,
    this.recommendAmbulance,
    this.location,
    this.ambulanceCalledAt,
    this.resolvedAt,
    this.ambiguityLevel,
    this.diseaseClass,
    this.diseaseNameAr,
    this.domain,
    this.secondaryClass,
    this.secondaryNameAr,
    this.secondaryConfidence,
    this.clarifyingQuestions = const <String>[],
    this.topPredictions = const <AiPrediction>[],
    this.conditions = const <AiCondition>[],
    this.outOfScopeMessage,
  });

  factory EmergencyReport.fromJson(Map<String, dynamic> json) {
    DateTime asDate(Object? v, {DateTime? fallback}) {
      if (v is String && v.isNotEmpty) return DateTime.parse(v);
      return fallback ?? DateTime.fromMillisecondsSinceEpoch(0);
    }

    DateTime? asDateOrNull(Object? v) =>
        v is String && v.isNotEmpty ? DateTime.parse(v) : null;

    final List<String> firstAid =
        (json['aiFirstAid'] as List<dynamic>?)
                ?.map((dynamic e) => e.toString())
                .where((String s) => s.isNotEmpty)
                .toList() ??
            const <String>[];

    EmergencyLocation? loc;
    final Object? rawLoc = json['location'];
    if (rawLoc is Map) {
      loc = EmergencyLocation.fromJson(rawLoc.cast<String, dynamic>());
    }

    // Confidence may arrive as `aiConfidence` (canonical / FastAPI) or
    // `aiConfidenceScore` (current Node mock). Read whichever is present.
    final num? confidenceRaw =
        (json['aiConfidence'] as num?) ?? (json['aiConfidenceScore'] as num?);

    // Voice URL may arrive as `voiceNoteUrl` (canonical) or `audioUrl`
    // (current Node mock). Same tolerance pattern.
    final String? voiceUrlRaw =
        (json['voiceNoteUrl'] as String?) ?? (json['audioUrl'] as String?);

    return EmergencyReport(
      id: (json['_id'] ?? json['id']).toString(),
      patientPersonId: json['patientPersonId'] as String?,
      patientChildId: json['patientChildId'] as String?,
      reportedAt: asDate(json['reportedAt'], fallback: DateTime.now()),
      inputType: (json['inputType'] as String?) ?? 'text',
      textDescription: json['textDescription'] as String?,
      imageUrl: json['imageUrl'] as String?,
      voiceNoteUrl: voiceUrlRaw,
      voiceTranscript:
          (json['voiceTranscript'] as String?) ??
              (json['transcription'] as String?),
      aiRiskLevel: severityFromWire(json['aiRiskLevel'] as String?),
      aiFirstAid: firstAid,
      aiAssessment: json['aiAssessment'] as String?,
      aiConfidence: confidenceRaw?.toDouble(),
      aiRawResponse: json['aiRawResponse'] as String?,
      aiModelVersion: json['aiModelVersion'] as String?,
      aiProcessedAt: asDateOrNull(json['aiProcessedAt']),
      recommendAmbulance: json['recommendAmbulance'] as bool?,
      location: loc,
      ambulanceCalled: (json['ambulanceCalled'] as bool?) ?? false,
      ambulanceCalledAt: asDateOrNull(json['ambulanceCalledAt']),
      ambulanceStatus: (json['ambulanceStatus'] as String?) ?? 'not_called',
      status: (json['status'] as String?) ?? 'active',
      resolvedAt: asDateOrNull(json['resolvedAt']),
      // ── Rich AI payload (all nullable / empty-defaulted) ──────────────
      ambiguityLevel:
          (json['ambiguityLevel'] as String?) ??
              (json['ambiguity_level'] as String?),
      diseaseClass:
          (json['diseaseClass'] as String?) ?? (json['class'] as String?),
      diseaseNameAr:
          (json['diseaseNameAr'] as String?) ?? (json['name_ar'] as String?),
      domain: json['domain'] as String?,
      secondaryClass:
          (json['secondaryClass'] as String?) ??
              (json['class_2nd'] as String?),
      secondaryNameAr:
          (json['secondaryNameAr'] as String?) ??
              (json['name_ar_2nd'] as String?),
      secondaryConfidence: _readSecondaryConfidence(
        (json['secondaryConfidence']) ?? (json['conf_2nd']),
      ),
      clarifyingQuestions: _readClarifyingQuestions(
        json['clarifyingQuestions'] ?? json['clarifying_questions'],
      ),
      topPredictions: _readTopPredictions(
        json['topPredictions'] ?? json['top5'],
      ),
      conditions: _readConditions(json['conditions']),
      outOfScopeMessage:
          (json['outOfScopeMessage'] as String?) ??
              (json['message_ar'] as String?),
    );
  }

  // ── Core fields ─────────────────────────────────────────────────────────
  final String id;
  final String? patientPersonId;
  final String? patientChildId;
  final DateTime reportedAt;

  /// One of: `text | image | voice | combined`.
  final String inputType;
  final String? textDescription;
  final String? imageUrl;
  final String? voiceNoteUrl;
  final String? voiceTranscript;

  final SeverityLevel aiRiskLevel;
  final List<String> aiFirstAid;

  /// Free-text Arabic prose summary from the AI.
  final String? aiAssessment;

  /// 0.0..1.0 — drives the gradient on the confidence bar.
  final double? aiConfidence;
  final String? aiRawResponse;
  final String? aiModelVersion;
  final DateTime? aiProcessedAt;

  /// AI's recommendation flag — true for high/critical assessments.
  final bool? recommendAmbulance;

  final EmergencyLocation? location;
  final bool ambulanceCalled;
  final DateTime? ambulanceCalledAt;
  final String ambulanceStatus;

  /// One of: `active | resolved | false_alarm | referred_to_hospital`.
  final String status;
  final DateTime? resolvedAt;

  // ── Rich AI payload (enriched FastAPI response) ─────────────────────────

  /// Discriminator that selects which ResultCard branch to render:
  ///   `confident | uncertain | very_ambiguous | multi | out_of_scope |
  ///    low_confidence_image`
  ///
  /// Null on legacy reports — UI falls back to the standard single-result
  /// branch in that case.
  final String? ambiguityLevel;

  /// Backend class label for the primary diagnosis, e.g. `"Heart_Attack"`.
  final String? diseaseClass;

  /// Arabic localized primary diagnosis name, e.g. `"نوبة قلبية"`.
  final String? diseaseNameAr;

  /// One of: `emergency | wound | eye | medical` — drives the [DomainBadge]
  /// theme.
  final String? domain;

  /// Backend class label for the alternate diagnosis.
  final String? secondaryClass;

  /// Arabic localized alternate diagnosis name.
  final String? secondaryNameAr;

  /// Confidence of the alternate diagnosis, normalized 0..1.
  final double? secondaryConfidence;

  /// Follow-up questions the AI suggests asking the patient. Used only
  /// for `uncertain` / `very_ambiguous` branches.
  final List<String> clarifyingQuestions;

  /// Top-N candidate classes with probabilities. Almost always length 5
  /// when present.
  final List<AiPrediction> topPredictions;

  /// Multi-symptom mode payload. Empty for single-condition responses;
  /// non-empty triggers the `multi` branch in ResultCard.
  final List<AiCondition> conditions;

  /// Localized message for `out_of_scope` and `low_confidence_image`
  /// branches. Falls back to `message_ar` from the FastAPI service.
  final String? outOfScopeMessage;

  // ── Convenience accessors ───────────────────────────────────────────────

  /// True iff the report carries a non-empty `conditions[]` array.
  /// Selects the multi branch in ResultCard.
  bool get isMulti => conditions.isNotEmpty;

  /// True iff [ambiguityLevel] is `out_of_scope`.
  bool get isOutOfScope => ambiguityLevel == 'out_of_scope';

  /// True iff [ambiguityLevel] is `low_confidence_image`.
  bool get isLowConfidenceImage => ambiguityLevel == 'low_confidence_image';
}

// ────────────────────────────────────────────────────────────────────────────
// Parsing helpers (file-private)
// ────────────────────────────────────────────────────────────────────────────

double? _readSecondaryConfidence(Object? raw) {
  if (raw == null) return null;
  if (raw is num && raw == 0) return null;
  if (raw is String && raw.trim().isEmpty) return null;
  return parseProbability(raw);
}

List<String> _readClarifyingQuestions(Object? raw) {
  if (raw is! List) return const <String>[];
  final List<String> out = <String>[];
  for (final Object? entry in raw) {
    if (entry == null) continue;
    if (entry is String) {
      final String s = entry.trim();
      if (s.isNotEmpty) out.add(s);
      continue;
    }
    // Some FastAPI variants emit `{ question: "..." }` objects.
    if (entry is Map) {
      final Object? q = entry['question'] ?? entry['q'] ?? entry['text'];
      if (q is String && q.trim().isNotEmpty) out.add(q.trim());
    }
  }
  return List<String>.unmodifiable(out);
}

List<AiPrediction> _readTopPredictions(Object? raw) {
  if (raw is! List) return const <AiPrediction>[];
  final List<AiPrediction> out = <AiPrediction>[];
  for (final Object? entry in raw) {
    try {
      final AiPrediction? p = AiPrediction.fromJson(entry);
      if (p != null) out.add(p);
    } catch (e, st) {
      appLogger.w(
        'EmergencyReport topPredictions parse failed',
        error: e,
        stackTrace: st,
      );
    }
  }
  return List<AiPrediction>.unmodifiable(out);
}

List<AiCondition> _readConditions(Object? raw) {
  if (raw is! List) return const <AiCondition>[];
  final List<AiCondition> out = <AiCondition>[];
  for (final Object? entry in raw) {
    try {
      final AiCondition? c = AiCondition.fromJson(entry);
      if (c != null) out.add(c);
    } catch (e, st) {
      appLogger.w(
        'EmergencyReport conditions parse failed',
        error: e,
        stackTrace: st,
      );
    }
  }
  return List<AiCondition>.unmodifiable(out);
}
