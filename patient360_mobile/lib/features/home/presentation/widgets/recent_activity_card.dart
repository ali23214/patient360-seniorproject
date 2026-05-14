import 'package:flutter/material.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../shared/widgets/empty_state.dart';
import '../../domain/recent_activity.dart';
import 'shimmer_box.dart';

/// Card listing up to the last five entries from the recent-activity feed.
///
/// Maps the discriminator [RecentActivityType] to icon + Arabic label,
/// with a neutral fallback so unknown backend values never break the UI.
class RecentActivityCard extends StatelessWidget {
  const RecentActivityCard({
    required this.activities,
    required this.isLoading,
    super.key,
  });

  final List<RecentActivity> activities;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return _HomeCard(
      title: 'النشاط الأخير',
      icon: LucideIcons.clock,
      child: _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (isLoading) {
      return Column(
        children: <Widget>[
          for (int i = 0; i < 3; i++) const _ActivityRowSkeleton(),
        ],
      );
    }
    if (activities.isEmpty) {
      return const EmptyState(
        icon: LucideIcons.clock,
        title: 'لا يوجد نشاط حديث',
        subtitle: 'سيظهر هنا آخر نشاطاتك الطبية.',
      );
    }
    final List<RecentActivity> shown = activities.take(5).toList();
    return Column(
      children: <Widget>[
        for (int i = 0; i < shown.length; i++) ...<Widget>[
          if (i > 0) const Divider(height: 1),
          _ActivityRow(activity: shown[i]),
        ],
      ],
    );
  }
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({required this.activity});

  final RecentActivity activity;

  @override
  Widget build(BuildContext context) {
    final _TypeMeta meta = _metaFor(activity.type);
    final TextTheme text = Theme.of(context).textTheme;
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: meta.color.withValues(alpha: 0.18),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Icon(meta.icon, size: 18, color: meta.color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  meta.label,
                  style: text.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  activity.title ?? '—',
                  style: text.bodyMedium,
                  textDirection: TextDirection.rtl,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (activity.subtitle != null) ...<Widget>[
                  const SizedBox(height: 2),
                  Text(
                    activity.subtitle!,
                    style: text.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            _formatDateTime(activity.occurredAt),
            textDirection: TextDirection.ltr,
            style: text.bodySmall?.copyWith(
              color: scheme.onSurfaceVariant,
              fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

class _ActivityRowSkeleton extends StatelessWidget {
  const _ActivityRowSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: <Widget>[
          ShimmerBox(
            width: 36,
            height: 36,
            borderRadius: BorderRadius.all(Radius.circular(18)),
          ),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                ShimmerBox(width: 64, height: 10),
                SizedBox(height: 8),
                ShimmerBox(width: 180, height: 14),
              ],
            ),
          ),
          SizedBox(width: 8),
          ShimmerBox(width: 54, height: 12),
        ],
      ),
    );
  }
}

class _HomeCard extends StatelessWidget {
  const _HomeCard({
    required this.title,
    required this.icon,
    required this.child,
  });

  final String title;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 12),
            child: Row(
              children: <Widget>[
                Icon(icon, size: 18, color: scheme.primary),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          child,
        ],
      ),
    );
  }
}

class _TypeMeta {
  const _TypeMeta(this.icon, this.label, this.color);
  final IconData icon;
  final String label;
  final Color color;
}

_TypeMeta _metaFor(RecentActivityType t) {
  return switch (t) {
    RecentActivityType.appointment =>
      const _TypeMeta(LucideIcons.calendar, 'موعد', AppColors.action),
    RecentActivityType.visit =>
      const _TypeMeta(LucideIcons.stethoscope, 'زيارة', AppColors.primary),
    RecentActivityType.prescription =>
      const _TypeMeta(LucideIcons.pill, 'وصفة طبية', AppColors.success),
    RecentActivityType.labTest =>
      const _TypeMeta(
        LucideIcons.flaskConical,
        'تحليل مخبري',
        AppColors.warning,
      ),
    RecentActivityType.notification =>
      const _TypeMeta(LucideIcons.bell, 'إشعار', AppColors.accent),
    RecentActivityType.unknown =>
      const _TypeMeta(LucideIcons.circle, 'نشاط', AppColors.action),
  };
}

String _formatDateTime(DateTime dt) {
  // ar-SY locale gives Western Arabic numerals; stays LTR for the date block
  // per the web convention.
  final intl.DateFormat formatter =
      intl.DateFormat('yyyy-MM-dd HH:mm', 'ar');
  return formatter.format(dt.toLocal());
}
