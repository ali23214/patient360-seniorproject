import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/theme/app_colors.dart';
import '../../../router/route_names.dart';

/// Visual signature for one notification type — Arabic label + Lucide
/// icon + tint color. Mirrors `NOTIFICATION_TYPE_META` in
/// PatientDashboard.jsx so a notification rendered in the web dashboard
/// looks identical here.
@immutable
class NotificationTypeMeta {
  const NotificationTypeMeta({
    required this.arabicLabel,
    required this.icon,
    required this.color,
  });

  final String arabicLabel;
  final IconData icon;
  final Color color;

  /// Lookup with a safe default for unknown types — falls back to a
  /// generic system-announcement style instead of throwing, so a new
  /// backend type degrades gracefully.
  static NotificationTypeMeta metaFor(String type) {
    return _byType[type] ?? const NotificationTypeMeta(
      arabicLabel: 'إشعار',
      icon: LucideIcons.bell,
      color: AppColors.action,
    );
  }
}

const Map<String, NotificationTypeMeta> _byType =
    <String, NotificationTypeMeta>{
  'appointment_reminder': NotificationTypeMeta(
    arabicLabel: 'تذكير بموعد',
    icon: LucideIcons.calendarDays,
    color: AppColors.action,
  ),
  'appointment_confirmation': NotificationTypeMeta(
    arabicLabel: 'تأكيد موعد',
    icon: LucideIcons.calendarCheck,
    color: AppColors.success,
  ),
  'appointment_cancellation': NotificationTypeMeta(
    arabicLabel: 'إلغاء موعد',
    icon: LucideIcons.calendarX,
    color: AppColors.error,
  ),
  'lab_result_ready': NotificationTypeMeta(
    arabicLabel: 'نتيجة مختبر جاهزة',
    icon: LucideIcons.flaskConical,
    color: AppColors.success,
  ),
  'critical_lab_result': NotificationTypeMeta(
    arabicLabel: 'نتيجة مختبر حرجة',
    icon: LucideIcons.octagonAlert,
    color: AppColors.error,
  ),
  'prescription_ready': NotificationTypeMeta(
    arabicLabel: 'وصفة جاهزة',
    icon: LucideIcons.pill,
    color: AppColors.success,
  ),
  'prescription_dispensed': NotificationTypeMeta(
    arabicLabel: 'تم صرف الوصفة',
    icon: LucideIcons.pill,
    color: AppColors.action,
  ),
  'medication_reminder': NotificationTypeMeta(
    arabicLabel: 'تذكير بدواء',
    icon: LucideIcons.bellRing,
    color: AppColors.warning,
  ),
  'visit_summary_ready': NotificationTypeMeta(
    arabicLabel: 'تقرير زيارة',
    icon: LucideIcons.fileText,
    color: AppColors.action,
  ),
  'emergency_response': NotificationTypeMeta(
    arabicLabel: 'استجابة طوارئ',
    icon: LucideIcons.siren,
    color: AppColors.error,
  ),
  'review_reminder': NotificationTypeMeta(
    arabicLabel: 'تذكير بالتقييم',
    icon: LucideIcons.star,
    color: AppColors.warning,
  ),
  'review_response': NotificationTypeMeta(
    arabicLabel: 'رد على تقييمك',
    icon: LucideIcons.messageSquare,
    color: AppColors.action,
  ),
  'system_announcement': NotificationTypeMeta(
    arabicLabel: 'إعلان عام',
    icon: LucideIcons.megaphone,
    color: AppColors.action,
  ),
  'account_security': NotificationTypeMeta(
    arabicLabel: 'حالة الحساب',
    icon: LucideIcons.shieldAlert,
    color: AppColors.warning,
  ),
};

/// Maps the `relatedType` on a notification to the in-app route the
/// patient should be deep-linked to when they tap that notification. Lifts
/// directly from the web's `RELATED_TYPE_TO_SECTION`.
const Map<String, String> relatedTypeToRoute = <String, String>{
  'appointments': RouteNames.appointments,
  'visits': RouteNames.visits,
  'prescriptions': '${RouteNames.medications}?tab=prescriptions',
  'lab_tests': RouteNames.lab,
  'emergency_reports': RouteNames.ai,
};

String? routeForRelatedType(String? relatedType) =>
    relatedType == null ? null : relatedTypeToRoute[relatedType];
