// ============================================================================
// DrugCheckResult - Patient 360 mobile (drug-risk feature)
// ----------------------------------------------------------------------------
// The inner `result` object on a `DrugRiskCheck`. Maps exactly to the
// Mongoose sub-schema in models/drugRisk/DrugRiskCheck.js:
//
//   result: {
//     drugNameAr            (String)
//     normalizedDrug        (String)
//     riskLevelAr           (Arabic enum, see RiskLevel)
//     reasonAr              (String)
//     adviceAr              (String)
//     warningAr             (String)
//     interactionWarningAr  (String)
//   }
//
// All fields are nullable because the backend writes them as such for
// out-of-scope checks (where only reasonAr / adviceAr are set) and because
// FastAPI may omit interaction_warning_ar when there's no drug-drug match.
// ============================================================================

import 'package:flutter/foundation.dart';

import 'risk_level.dart';

@immutable
class DrugCheckResult {
  const DrugCheckResult({
    required this.riskLevel,
    this.drugNameAr,
    this.normalizedDrug,
    this.reasonAr,
    this.adviceAr,
    this.warningAr,
    this.interactionWarningAr,
    this.riskLevelArRaw,
  });

  /// Build from the JSON object the backend nests under `check.result`.
  /// Defensive: every field is read with `as ... ?` so an unexpected shape
  /// degrades to nulls instead of throwing.
  factory DrugCheckResult.fromJson(Map<String, dynamic> json) {
    final String? rawLevel = json['riskLevelAr'] as String?;
    return DrugCheckResult(
      drugNameAr: json['drugNameAr'] as String?,
      normalizedDrug: json['normalizedDrug'] as String?,
      riskLevelArRaw: rawLevel,
      riskLevel: riskLevelFromArabic(rawLevel),
      reasonAr: json['reasonAr'] as String?,
      adviceAr: json['adviceAr'] as String?,
      warningAr: json['warningAr'] as String?,
      interactionWarningAr: json['interactionWarningAr'] as String?,
    );
  }

  /// Empty placeholder used when the backend returns no `result` at all
  /// (defensive — currently the backend always sends one).
  factory DrugCheckResult.empty() =>
      const DrugCheckResult(riskLevel: RiskLevel.unknown);

  /// The drug name as it appeared in the user's text (e.g. "amoxicillin" or
  /// "بنادول"). May be null for out-of-scope inputs where no drug was
  /// identified.
  final String? drugNameAr;

  /// The canonical generic name the pipeline normalized to (e.g. "augmentin"
  /// -> "amoxicillin"). Useful for the doctor flow's audit log.
  final String? normalizedDrug;

  /// Visual severity tier driving card color & icon.
  final RiskLevel riskLevel;

  /// The original Arabic string from the backend, preserved so the UI can
  /// show the exact wording the backend chose (e.g. "غير معروف" vs "غير مؤكد")
  /// when nuance matters.
  final String? riskLevelArRaw;

  /// Why the pipeline returned this risk level. Always Arabic, full sentence.
  final String? reasonAr;

  /// Clinical recommendation (e.g. "يفضل عدم استخدام هذا الدواء دون استشارة طبية").
  final String? adviceAr;

  /// Safety alert (e.g. "إذا ظهرت علامات تحسس شديدة..."). Shown in a
  /// dedicated amber section to grab attention.
  final String? warningAr;

  /// Drug-drug interaction warning (e.g. interaction with currently-taken
  /// medications). Shown in a separate blue section when present.
  final String? interactionWarningAr;

  /// True when there is anything substantive to show in the result card —
  /// used to decide whether to render the body or just the header.
  bool get hasAnyContent =>
      (reasonAr != null && reasonAr!.isNotEmpty) ||
      (adviceAr != null && adviceAr!.isNotEmpty) ||
      (warningAr != null && warningAr!.isNotEmpty) ||
      (interactionWarningAr != null && interactionWarningAr!.isNotEmpty);
}
