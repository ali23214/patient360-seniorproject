import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../router/route_names.dart';
import '../../domain/overview.dart';
import 'shimmer_box.dart';

enum KpiVariant { info, success, warning, accent }

class _KpiConfig {
  const _KpiConfig({
    required this.icon,
    required this.label,
    required this.navigateTo,
    required this.variant,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String navigateTo;
  final KpiVariant variant;
  final int value;
}

/// 2×2 grid of KPI tiles. Each tile is a tap target that navigates to the
/// corresponding primary tab. While [isLoading] is true each tile renders a
/// shimmer placeholder in place of its numeric value.
class KpiGrid extends StatelessWidget {
  const KpiGrid({required this.overview, required this.isLoading, super.key});

  final Overview overview;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final List<_KpiConfig> tiles = <_KpiConfig>[
      _KpiConfig(
        icon: LucideIcons.calendar,
        label: 'مواعيد قادمة',
        navigateTo: RouteNames.appointments,
        variant: KpiVariant.info,
        value: overview.upcomingAppointments,
      ),
      _KpiConfig(
        icon: LucideIcons.pill,
        label: 'وصفات نشطة',
        navigateTo: '${RouteNames.medications}?tab=prescriptions',
        variant: KpiVariant.success,
        value: overview.activePrescriptions,
      ),
      _KpiConfig(
        icon: LucideIcons.flaskConical,
        label: 'نتائج مختبر بانتظار',
        navigateTo: RouteNames.lab,
        variant: KpiVariant.warning,
        value: overview.pendingLabResults,
      ),
      _KpiConfig(
        icon: LucideIcons.bell,
        label: 'إشعارات غير مقروءة',
        navigateTo: RouteNames.notifications,
        variant: KpiVariant.accent,
        value: overview.unreadNotifications,
      ),
    ];

    return GridView.count(
      crossAxisCount: 2,
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.25,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      children: <Widget>[
        for (final _KpiConfig t in tiles)
          _KpiTile(config: t, loading: isLoading),
      ],
    );
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({required this.config, required this.loading});

  final _KpiConfig config;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final Color variantColor = _colorFor(config.variant);
    final TextTheme text = Theme.of(context).textTheme;
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Semantics(
      label: '${config.label}: ${config.value}',
      button: true,
      child: Material(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        child: InkWell(
          borderRadius: AppRadii.radiusLg,
          onTap: () => context.go(config.navigateTo),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: AppRadii.radiusLg,
              border: Border.all(color: scheme.outline),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: <Widget>[
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: variantColor.withValues(alpha: 0.18),
                    borderRadius: AppRadii.radiusMd,
                  ),
                  alignment: Alignment.center,
                  child: Icon(config.icon, size: 22, color: variantColor),
                ),
                if (loading)
                  const ShimmerBox(width: 54, height: 28)
                else
                  Text(
                    _formatNumber(config.value),
                    style: text.headlineMedium?.copyWith(
                      color: variantColor,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                Text(
                  config.label,
                  style: text.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static Color _colorFor(KpiVariant v) => switch (v) {
        KpiVariant.info => AppColors.action,
        KpiVariant.success => AppColors.success,
        KpiVariant.warning => AppColors.warning,
        KpiVariant.accent => AppColors.accent,
      };

  static String _formatNumber(int n) {
    if (n > 99) return '99+';
    return n.toString();
  }
}
