import 'package:flutter/foundation.dart';

import 'emergency_location.dart';
import 'severity_level.dart';

/// One row in the `emergency_reports` collection. The mobile app submits
/// new reports and lists past ones — never edits or deletes after the fact
/// (the schema is append-only for v1).
///
/// ─── BACKEND FIELD-NAME TOLERANCE ─────────────────────────────────────
/// The current backend (controllers/emergencyController.js) uses two
/// non-canonical field names that drift from patient360_db_final.js:
///
///   Schema says           Backend writes        We accept
///   ────────────          ──────────────        ─────────
///   aiConfidence          aiConfidenceScore     both ✓
///   voiceNoteUrl          audioUrl              both ✓
///
/// This way the mobile model works against:
///   * the current backend (writes drift fields),
///   * a future fixed backend (writes canonical fields),
///   * the FastAPI proxy version from the (ممنوع اللمس) chat.
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
      voiceTranscript: json['voiceTranscript'] as String?,
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
    );
  }

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

  /// Free-text Arabic prose summary from the AI (e.g. "الحالة حرجة وتتطلب
  /// تدخلاً فورياً..."). Optional — current Node mock returns it; the
  /// FastAPI variant may not.
  final String? aiAssessment;

  /// 0.0..1.0 — drives the gradient on the confidence bar.
  final double? aiConfidence;
  final String? aiRawResponse;
  final String? aiModelVersion;
  final DateTime? aiProcessedAt;

  /// AI's recommendation flag — true for high/critical assessments. Used
  /// to prompt the patient with the "Call Ambulance" CTA without forcing
  /// the dial.
  final bool? recommendAmbulance;

  final EmergencyLocation? location;
  final bool ambulanceCalled;
  final DateTime? ambulanceCalledAt;
  final String ambulanceStatus;

  /// One of: `active | resolved | false_alarm | referred_to_hospital`.
  final String status;
  final DateTime? resolvedAt;
}