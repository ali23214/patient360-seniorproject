import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../router/route_names.dart';
import '../../../prescriptions/presentation/providers/active_reminder_today_provider.dart';

/// Teal Medica hero banner. Renders a time-aware greeting, the patient's
/// first name, the welcome copy, and (when there's one due in the next 60
/// minutes) an inline "next dose" pill.
class HeroCard extends ConsumerWidget {
  const HeroCard({required this.firstName, super.key});

  /// Pass the patient's first name (or `null` while the profile is loading).
  final String? firstName;

  static const String _subtitle =
      'نتمنى لك يوماً صحياً. يمكنك متابعة مواعيدك ووصفاتك ونتائج الفحوصات من هنا.';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String greeting = _greetingForHour(DateTime.now().hour);
    final List<UpcomingDose>? doses =
        ref.watch(activeReminderTodayProvider).value;
    final UpcomingDose? next =
        (doses == null || doses.isEmpty) ? null : doses.first;

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: <Color>[AppColors.primary, AppColors.action],
        ),
        borderRadius: AppRadii.radiusLg,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text.rich(
                  TextSpan(
                    children: <InlineSpan>[
                      TextSpan(text: greeting),
                      if (firstName != null && firstName!.isNotEmpty)
                        TextSpan(text: '، $firstName'),
                    ],
                  ),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  _subtitle,
                  style: TextStyle(
                    color: Color(0xCCFFFFFF),
                    fontSize: 13,
                    height: 1.5,
                  ),
                ),
                if (next != null) ...<Widget>[
                  const SizedBox(height: 12),
                  _UpcomingDoseChip(dose: next),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.20),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: const Icon(
              LucideIcons.heartPulse,
              size: 48,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  static String _greetingForHour(int hour) {
    if (hour >= 5 && hour < 12) return 'صباح الخير';
    return 'مساء الخير';
  }
}

class _UpcomingDoseChip extends StatelessWidget {
  const _UpcomingDoseChip({required this.dose});
  final UpcomingDose dose;

  @override
  Widget build(BuildContext context) {
    final bool late = dose.isLate;
    final Color background = late
        ? AppColors.warning.withValues(alpha: 0.30)
        : Colors.white.withValues(alpha: 0.18);
    final Color border = late
        ? const Color(0xFFFFD54F)
        : Colors.white.withValues(alpha: 0.40);
    final String label = late
        ? 'الجرعة القادمة: ${dose.schedule.medicationName} — متأخر بـ ${dose.minutesLate} دقيقة'
        : 'الجرعة القادمة: ${dose.schedule.medicationName} خلال ${dose.minutesUntil} دقيقة';

    return InkWell(
      borderRadius: AppRadii.radiusMd,
      onTap: () =>
          context.go('${RouteNames.medications}?tab=schedule'),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 8,
        ),
        decoration: BoxDecoration(
          color: background,
          borderRadius: AppRadii.radiusMd,
          border: Border.all(color: border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(
              LucideIcons.pill,
              size: 16,
              color: Colors.white,
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
                textDirection: TextDirection.rtl,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
