// ============================================================================
// RiskLevel - Patient 360 mobile (drug-risk feature)
// ----------------------------------------------------------------------------
// Mirrors the Arabic risk strings produced by Kinan's FastAPI rule-based
// pipeline. The backend stores them verbatim in `DrugRiskCheck.result.riskLevelAr`
// (Mongoose enum allows: مرتفع | متوسط | منخفض | غير مؤكد | غير معروف | null).
//
// We map all of these to a 4-state enum because the UI only needs to render
// 4 distinct visual variants (red / amber / green / gray). The Arabic
// distinction between "غير مؤكد" (uncertain) and "غير معروف" (out-of-scope) is
// preserved at the `DrugRiskCheck.isOutOfScope` boolean level, not here.
// ============================================================================

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';

/// Visual severity tier for a drug-risk check. Drives card color, icon, and
/// the urgency animation used in [DrugCheckResultCard].
enum RiskLevel { high, medium, low, unknown }

extension RiskLevelInfo on RiskLevel {
  /// Short Arabic label shown on the result badge ("خطر مرتفع" etc.).
  String get arabicLabel {
    switch (this) {
      case RiskLevel.high:
        return 'خطر مرتفع';
      case RiskLevel.medium:
        return 'خطر متوسط';
      case RiskLevel.low:
        return 'آمن نسبياً';
      case RiskLevel.unknown:
        return 'غير محدد';
    }
  }

  /// Card border / header background color. Pulls from the Teal Medica
  /// semantic tokens so dark mode auto-adapts.
  Color get color {
    switch (this) {
      case RiskLevel.high:
        return AppColors.error;
      case RiskLevel.medium:
        return AppColors.warning;
      case RiskLevel.low:
        return AppColors.success;
      case RiskLevel.unknown:
        return AppColors.action;
    }
  }

  /// Lucide icon shown at the top-left of the result card. Matches the
  /// icon set used on the web in DoctorDashboard's DrugRiskOverlay.
  IconData get icon {
    switch (this) {
      case RiskLevel.high:
        return LucideIcons.octagonAlert;
      case RiskLevel.medium:
        return LucideIcons.triangleAlert;
      case RiskLevel.low:
        return LucideIcons.circleCheck;
      case RiskLevel.unknown:
        return LucideIcons.info;
    }
  }

  /// True for [high] / [medium] — the UI uses this to thicken the card
  /// border, surface the warning section more prominently, and disable
  /// subtle animations for accessibility.
  bool get isUrgent => this == RiskLevel.high || this == RiskLevel.medium;
}

/// Parse the Arabic risk string the backend stores in
/// `DrugRiskCheck.result.riskLevelAr`. Tolerant of leading/trailing whitespace
/// and falls back to [RiskLevel.unknown] for any value the enum doesn't
/// recognize (including null and the empty string).
///
/// Recognized inputs:
///   * 'مرتفع'    -> high
///   * 'متوسط'    -> medium
///   * 'منخفض'    -> low
///   * 'غير مؤكد' -> unknown
///   * 'غير معروف' -> unknown  (out-of-scope short-circuit)
///   * anything else (incl. null) -> unknown
RiskLevel riskLevelFromArabic(String? raw) {
  if (raw == null) return RiskLevel.unknown;
  final String s = raw.trim();
  if (s == 'مرتفع') return RiskLevel.high;
  if (s == 'متوسط') return RiskLevel.medium;
  if (s == 'منخفض') return RiskLevel.low;
  return RiskLevel.unknown;
}
