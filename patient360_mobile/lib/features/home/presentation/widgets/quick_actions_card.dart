import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../router/route_names.dart';

class _QuickAction {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.target,
  });

  final IconData icon;
  final String label;
  final String target;
}

/// 2×2 grid of quick-access shortcuts. Mirrors the web renderHome's
/// quickActions section.
class QuickActionsCard extends StatelessWidget {
  const QuickActionsCard({super.key});

  static const List<_QuickAction> _actions = <_QuickAction>[
    _QuickAction(
      icon: LucideIcons.plus,
      label: 'حجز موعد جديد',
      target: RouteNames.appointments,
    ),
    _QuickAction(
      icon: LucideIcons.pill,
      label: 'عرض الوصفات',
      target: '${RouteNames.medications}?tab=prescriptions',
    ),
    _QuickAction(
      icon: LucideIcons.sparkles,
      label: 'المساعد الذكي',
      target: RouteNames.ai,
    ),
    _QuickAction(
      icon: LucideIcons.user,
      label: 'ملفي الشخصي',
      target: RouteNames.profile,
    ),
  ];

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
                Icon(LucideIcons.sparkles, size: 18, color: scheme.primary),
                const SizedBox(width: 8),
                Text(
                  'إجراءات سريعة',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.all(12),
            child: GridView.count(
              crossAxisCount: 2,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 2.2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: <Widget>[
                for (final _QuickAction a in _actions)
                  _QuickActionTile(action: a),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickActionTile extends StatelessWidget {
  const _QuickActionTile({required this.action});

  final _QuickAction action;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Material(
      color: scheme.surface,
      borderRadius: AppRadii.radiusMd,
      child: InkWell(
        borderRadius: AppRadii.radiusMd,
        onTap: () => context.go(action.target),
        child: Container(
          padding: const EdgeInsetsDirectional.fromSTEB(12, 10, 10, 10),
          decoration: BoxDecoration(
            border: Border.all(color: scheme.outline),
            borderRadius: AppRadii.radiusMd,
          ),
          child: Row(
            children: <Widget>[
              Icon(action.icon, size: 22, color: AppColors.action),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  action.label,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Icon(
                LucideIcons.chevronLeftDir,
                size: 16,
                color: scheme.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
