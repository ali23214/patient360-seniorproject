import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radii.dart';
import '../../core/theme/theme_controller.dart';
import '../../features/auth/domain/auth_session.dart';
import '../../features/auth/domain/child.dart';
import '../../features/auth/domain/person.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../router/route_names.dart';

/// القائمة الجانبية الرئيسية للتطبيق.
///
/// تظهر عند الضغط على أيقونة (☰) في [PageHeader].
/// تحتوي على:
///   • معلومات المستخدم (الاسم، البريد، صورة افتراضية)
///   • روابط التنقل لكل أقسام التطبيق
///   • زر تبديل الوضع الليلي/النهاري
///   • زر تسجيل الخروج (مع تأكيد)
class AppDrawer extends ConsumerWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<AuthSession?> async = ref.watch(authControllerProvider);
    final ThemeMode themeMode = ref.watch(themeControllerProvider);
    final Brightness platformBrightness = MediaQuery.platformBrightnessOf(
      context,
    );
    final bool isDark =
        themeMode == ThemeMode.dark ||
        (themeMode == ThemeMode.system &&
            platformBrightness == Brightness.dark);

    return Drawer(
      child: SafeArea(
        child: Column(
          children: <Widget>[
            // ── Header — معلومات المستخدم ──────────────────────────
            _DrawerHeader(session: async.value),

            // ── Navigation Items — قائمة الأقسام ───────────────────
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: <Widget>[
                  const SizedBox(height: 8),
                  _NavItem(
                    icon: LucideIcons.house,
                    label: 'الرئيسية',
                    route: RouteNames.home,
                  ),
                  _NavItem(
                    icon: LucideIcons.calendar,
                    label: 'المواعيد',
                    route: RouteNames.appointments,
                  ),
                  _NavItem(
                    icon: LucideIcons.pill,
                    label: 'الأدوية',
                    route: RouteNames.medications,
                  ),
                  _NavItem(
                    icon: LucideIcons.flaskConical,
                    label: 'نتائج المختبر',
                    route: RouteNames.lab,
                  ),
                  _NavItem(
                    icon: LucideIcons.user,
                    label: 'الملف الشخصي',
                    route: RouteNames.profile,
                  ),
                  const _DrawerDivider(),
                  _NavItem(
                    icon: LucideIcons.bell,
                    label: 'الإشعارات',
                    route: RouteNames.notifications,
                  ),
                  _NavItem(
                    icon: LucideIcons.stethoscope,
                    label: 'الزيارات الطبية',
                    route: RouteNames.visits,
                  ),
                  _NavItem(
                    icon: LucideIcons.bot,
                    label: 'المساعد الذكي',
                    route: RouteNames.ai,
                  ),
                  _NavItem(
                    icon: LucideIcons.star,
                    label: 'التقييمات',
                    route: RouteNames.reviews,
                  ),
                  const _DrawerDivider(),

                  // ── Theme toggle — تبديل الوضع ───────────────────
                  _NavItem(
                    icon: isDark ? LucideIcons.sun : LucideIcons.moon,
                    label: isDark ? 'الوضع النهاري' : 'الوضع الليلي',
                    onTap: () {
                      ref.read(themeControllerProvider.notifier).toggle();
                    },
                  ),
                ],
              ),
            ),

            // ── Logout button — زر تسجيل الخروج ────────────────────
            const _DrawerDivider(),
            _LogoutButton(),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Header — معلومات المستخدم
// ═══════════════════════════════════════════════════════════════════════

class _DrawerHeader extends StatelessWidget {
  const _DrawerHeader({required this.session});
  final AuthSession? session;

  @override
  Widget build(BuildContext context) {
    final Person? person = session?.person;
    final Child? child = session?.child;
    final String fullName = person?.fullName ?? child?.fullName ?? 'مستخدم';
    final String email = session?.user.email ?? '—';
    final String initial = fullName.trim().isEmpty
        ? '?'
        : fullName.trim().substring(0, 1);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: <Color>[
            AppColors.action,
            AppColors.action.withValues(alpha: 0.8),
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // Avatar circle
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.25),
              shape: BoxShape.circle,
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.4),
                width: 2,
              ),
            ),
            alignment: Alignment.center,
            child: Text(
              initial,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 28,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            fullName,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Text(
            email,
            textDirection: TextDirection.ltr,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.9),
              fontSize: 12,
              fontFamily: 'Inter',
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Nav Item — عنصر قائمة قابل للضغط
// ═══════════════════════════════════════════════════════════════════════

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.label,
    this.route,
    this.onTap,
  }) : assert(route != null || onTap != null, 'يجب تمرير route أو onTap');

  final IconData icon;
  final String label;
  final String? route;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final String currentRoute = GoRouterState.of(context).matchedLocation;
    final bool isSelected = route != null && currentRoute == route;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          // Close the drawer first
          Navigator.of(context).pop();

          if (onTap != null) {
            onTap!();
          } else if (route != null && route != currentRoute) {
            context.go(route!);
          }
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          decoration: BoxDecoration(
            color: isSelected
                ? AppColors.action.withValues(alpha: 0.12)
                : Colors.transparent,
            border: BorderDirectional(
              start: BorderSide(
                color: isSelected ? AppColors.action : Colors.transparent,
                width: 3,
              ),
            ),
          ),
          child: Row(
            children: <Widget>[
              Icon(
                icon,
                size: 22,
                color: isSelected ? AppColors.action : scheme.onSurfaceVariant,
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                    color: isSelected ? AppColors.action : scheme.onSurface,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Divider — فاصل بسيط
// ═══════════════════════════════════════════════════════════════════════

class _DrawerDivider extends StatelessWidget {
  const _DrawerDivider();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 20),
      child: Divider(
        height: 1,
        thickness: 1,
        color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.4),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Logout Button — زر تسجيل الخروج (مع تأكيد)
// ═══════════════════════════════════════════════════════════════════════

class _LogoutButton extends ConsumerWidget {
  Future<void> _confirmAndLogout(BuildContext context, WidgetRef ref) async {
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.radiusLg),
        icon: Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: AppColors.error.withValues(alpha: 0.16),
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: const Icon(
            LucideIcons.logOut,
            color: AppColors.error,
            size: 28,
          ),
        ),
        title: const Text(
          'تسجيل الخروج',
          textAlign: TextAlign.center,
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        content: const Text(
          'هل أنت متأكد من رغبتك بتسجيل الخروج من حسابك؟',
          textAlign: TextAlign.center,
        ),
        actionsAlignment: MainAxisAlignment.spaceEvenly,
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('إلغاء'),
          ),
          ElevatedButton.icon(
            onPressed: () => Navigator.of(ctx).pop(true),
            icon: const Icon(LucideIcons.logOut, size: 16),
            label: const Text('تسجيل الخروج'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    if (!context.mounted) return;

    // Show loading indicator
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext ctx) =>
          const Center(child: CircularProgressIndicator()),
    );

    try {
      await ref.read(authControllerProvider.notifier).logout();
    } finally {
      if (context.mounted) {
        // Close loading dialog
        Navigator.of(context).pop();
        // Navigate to login (replaces entire stack)
        context.go(RouteNames.login);
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _confirmAndLogout(context, ref),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          child: Row(
            children: <Widget>[
              const Icon(LucideIcons.logOut, size: 22, color: AppColors.error),
              const SizedBox(width: 16),
              const Expanded(
                child: Text(
                  'تسجيل الخروج',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: AppColors.error,
                  ),
                ),
              ),
              Icon(
                LucideIcons.chevronLeft,
                size: 18,
                color: AppColors.error.withValues(alpha: 0.6),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
