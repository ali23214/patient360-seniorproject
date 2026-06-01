import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/adherence_stats.dart';
import '../providers/medications_providers.dart';

/// Top card on the schedule sub-tab. Shows today's progress as
/// "X من Y جرعات اليوم" with a horizontal bar, plus the rolling 7-day
/// adherence rate to the right.
class AdherenceSummaryCard extends ConsumerWidget {
  const AdherenceSummaryCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final DateTime now = ref.watch(nowProvider);
    final DateTime today = DateTime(now.year, now.month, now.day);
    final DateTime tomorrow = today.add(const Duration(days: 1));
    final DateTime weekStart = today.subtract(const Duration(days: 6));

    final AdherenceStats todayStats =
        ref.watch(adherenceStatsProvider((from: today, to: tomorrow)));
    final double weekRate = ref
        .watch(adherenceStatsProvider((from: weekStart, to: tomorrow)))
        .rate;

    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;

    final double progress = todayStats.expectedDoses == 0
        ? 0
        : (todayStats.takenDoses / todayStats.expectedDoses).clamp(0.0, 1.0);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: AppColors.action.withValues(alpha: 0.18),
                  borderRadius: AppRadii.radiusMd,
                ),
                alignment: Alignment.center,
                child: const Icon(
                  LucideIcons.activity,
                  size: 20,
                  color: AppColors.action,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'الالتزام بالأدوية',
                      style: text.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      _todayLabel(
                          todayStats.takenDoses, todayStats.expectedDoses),
                      style: text.bodySmall
                          ?.copyWith(color: scheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              _WeekRatePill(rate: weekRate),
            ],
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: AppRadii.radiusSm,
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 8,
              backgroundColor: scheme.outline.withValues(alpha: 0.30),
              valueColor:
                  const AlwaysStoppedAnimation<Color>(AppColors.action),
            ),
          ),
        ],
      ),
    );
  }

  static String _todayLabel(int taken, int expected) {
    if (expected == 0) return 'لا توجد جرعات مجدولة اليوم';
    return '$taken من $expected جرعات اليوم';
  }
}

class _WeekRatePill extends StatelessWidget {
  const _WeekRatePill({required this.rate});
  final double rate;

  @override
  Widget build(BuildContext context) {
    final int pct = (rate * 100).round();
    final Color color = _colorFor(rate);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: AppRadii.radiusMd,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          Text(
            '$pct٪',
            textDirection: TextDirection.ltr,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w700,
              fontSize: 14,
              height: 1.0,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'آخر ٧ أيام',
            style: TextStyle(
              color: color,
              fontSize: 10,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  static Color _colorFor(double rate) {
    if (rate >= 0.85) return AppColors.success;
    if (rate >= 0.5) return AppColors.warning;
    return AppColors.error;
  }
}
