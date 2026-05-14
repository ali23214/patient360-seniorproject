import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';

/// Risk level produced by the emergency-triage AI. Mirrors the schema enum
/// `aiRiskLevel` on `emergency_reports`.
enum SeverityLevel { low, moderate, high, critical }

extension SeverityLevelInfo on SeverityLevel {
  String get arabicLabel => switch (this) {
        SeverityLevel.low => 'منخفضة',
        SeverityLevel.moderate => 'متوسطة',
        SeverityLevel.high => 'عالية',
        SeverityLevel.critical => 'حرجة',
      };

  /// Lowercase serialized form sent over the wire.
  String get wireValue => switch (this) {
        SeverityLevel.low => 'low',
        SeverityLevel.moderate => 'moderate',
        SeverityLevel.high => 'high',
        SeverityLevel.critical => 'critical',
      };

  Color get color => switch (this) {
        SeverityLevel.low => AppColors.success,
        SeverityLevel.moderate => AppColors.warning,
        SeverityLevel.high => AppColors.error,
        SeverityLevel.critical => AppColors.error,
      };

  IconData get icon => switch (this) {
        SeverityLevel.low => LucideIcons.circleCheck,
        SeverityLevel.moderate => LucideIcons.triangleAlert,
        SeverityLevel.high => LucideIcons.triangleAlert,
        SeverityLevel.critical => LucideIcons.octagonAlert,
      };

  /// True for `high` + `critical` — UI uses this to escalate the badge
  /// border weight and skip subtle animations on accessibility devices.
  bool get isUrgent =>
      this == SeverityLevel.high || this == SeverityLevel.critical;
}

SeverityLevel severityFromWire(String? raw) {
  switch (raw) {
    case 'low':
      return SeverityLevel.low;
    case 'moderate':
      return SeverityLevel.moderate;
    case 'high':
      return SeverityLevel.high;
    case 'critical':
      return SeverityLevel.critical;
    default:
      return SeverityLevel.low;
  }
}
