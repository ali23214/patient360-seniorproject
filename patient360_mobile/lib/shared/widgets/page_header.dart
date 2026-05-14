import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/theme_controller.dart';
import '../../features/notifications/presentation/providers/notifications_provider.dart';
import '../../router/route_names.dart';

/// Reusable AppBar used by every feature screen inside the shell.
///
/// Leading: hamburger that opens the nearest [Scaffold]'s drawer.
/// Actions:
///  - theme toggle (sun when in dark mode, moon otherwise) — cycles via
///    [ThemeController.toggle];
///  - bell → `/notifications` with an unread-count badge that collapses at
///    99+.
class PageHeader extends ConsumerWidget implements PreferredSizeWidget {
  const PageHeader({
    required this.title,
    this.subtitle,
    this.unreadCount,
    super.key,
  });

  final String title;
  final String? subtitle;

  /// Override the bell badge count for tests / surfaces that have a
  /// pre-resolved value. When `null` the header subscribes to
  /// [unreadNotificationsCountProvider] so the badge stays live across
  /// every screen.
  final int? unreadCount;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight + 18);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ThemeMode themeMode = ref.watch(themeControllerProvider);
    final int badgeCount =
        unreadCount ?? ref.watch(unreadNotificationsCountProvider);
    final Brightness platformBrightness =
        MediaQuery.platformBrightnessOf(context);
    final bool isDark = themeMode == ThemeMode.dark ||
        (themeMode == ThemeMode.system &&
            platformBrightness == Brightness.dark);

    return AppBar(
      elevation: 0,
      centerTitle: false,
      leading: Builder(
        builder: (BuildContext ctx) => IconButton(
          icon: const Icon(LucideIcons.menu),
          tooltip: 'فتح القائمة',
          onPressed: () => Scaffold.of(ctx).openDrawer(),
        ),
      ),
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Text(
            title,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          if (subtitle != null)
            Text(
              subtitle!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
        ],
      ),
      actions: <Widget>[
        IconButton(
          icon: Icon(isDark ? LucideIcons.sun : LucideIcons.moon),
          tooltip: isDark ? 'الوضع النهاري' : 'الوضع الليلي',
          onPressed: () =>
              ref.read(themeControllerProvider.notifier).toggle(),
        ),
        _NotificationsBell(
          unreadCount: badgeCount,
          onPressed: () => context.go(RouteNames.notifications),
        ),
        const SizedBox(width: 4),
      ],
    );
  }
}

class _NotificationsBell extends StatelessWidget {
  const _NotificationsBell({
    required this.unreadCount,
    required this.onPressed,
  });

  final int unreadCount;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final String? label = _badgeLabel(unreadCount);

    return Stack(
      clipBehavior: Clip.none,
      alignment: AlignmentDirectional.center,
      children: <Widget>[
        IconButton(
          icon: const Icon(LucideIcons.bell),
          tooltip: unreadCount > 0
              ? 'الإشعارات ($unreadCount غير مقروءة)'
              : 'الإشعارات',
          onPressed: onPressed,
        ),
        if (label != null)
          PositionedDirectional(
            top: 6,
            end: 4,
            child: IgnorePointer(
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 5,
                  vertical: 1,
                ),
                constraints: const BoxConstraints(
                  minWidth: 16,
                  minHeight: 16,
                ),
                decoration: const BoxDecoration(
                  color: AppColors.error,
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(
                  label,
                  textDirection: TextDirection.ltr,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    height: 1.0,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  static String? _badgeLabel(int count) {
    if (count <= 0) return null;
    if (count > 99) return '99+';
    return count.toString();
  }
}
