import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radii.dart';
import '../../features/auth/domain/auth_session.dart';
import '../../features/auth/domain/child.dart';
import '../../features/auth/domain/person.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/notifications/presentation/providers/notifications_provider.dart';
import '../../router/route_names.dart';

/// Shell wrapping every route that renders inside the signed-in surface.
///
/// Provides a persistent bottom [NavigationBar] (Home / Appointments /
/// Medications / Lab / Profile) and a [Drawer] hosting secondary
/// destinations plus the logout entry. The Medications destination is the
/// landing route for the schedule + calendar + prescriptions sub-tabs.
class AppShell extends ConsumerWidget {
  const AppShell({required this.child, super.key});

  final Widget child;

  static const List<_Destination> _primary = <_Destination>[
    _Destination('الرئيسية', LucideIcons.house, RouteNames.home),
    _Destination('المواعيد', LucideIcons.calendar, RouteNames.appointments),
    _Destination('الأدوية', LucideIcons.pill, RouteNames.medications),
    _Destination('المختبر', LucideIcons.flaskConical, RouteNames.lab),
    _Destination('ملفي', LucideIcons.user, RouteNames.profile),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String location = GoRouterState.of(context).matchedLocation;
    final int primaryIndex = RouteNames.primary.indexOf(location);
    final bool onSecondary = primaryIndex < 0;

    final int selectedIndex = onSecondary ? 0 : primaryIndex;

    return Scaffold(
      drawer: const _AppDrawer(),
      body: child,
      bottomNavigationBar: NavigationBarTheme(
        data: NavigationBarThemeData(
          indicatorColor: onSecondary
              ? Colors.transparent
              : AppColors.action.withValues(alpha: 0.18),
          labelTextStyle: WidgetStateProperty.resolveWith<TextStyle?>(
            (Set<WidgetState> states) {
              final bool selected = states.contains(WidgetState.selected);
              return TextStyle(
                fontSize: 11,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected && !onSecondary
                    ? AppColors.action
                    : Theme.of(context).colorScheme.onSurfaceVariant,
              );
            },
          ),
          iconTheme: WidgetStateProperty.resolveWith<IconThemeData?>(
            (Set<WidgetState> states) {
              final bool selected = states.contains(WidgetState.selected);
              return IconThemeData(
                size: 22,
                color: selected && !onSecondary
                    ? AppColors.action
                    : Theme.of(context).colorScheme.onSurfaceVariant,
              );
            },
          ),
        ),
        child: NavigationBar(
          height: 64,
          selectedIndex: selectedIndex,
          onDestinationSelected: (int index) =>
              context.go(_primary[index].path),
          destinations: <NavigationDestination>[
            for (final _Destination d in _primary)
              NavigationDestination(
                icon: Icon(d.icon),
                label: d.label,
              ),
          ],
        ),
      ),
    );
  }
}

class _Destination {
  const _Destination(this.label, this.icon, this.path);
  final String label;
  final IconData icon;
  final String path;
}

// ═══════════════════════════════════════════════════════════════════════════
// Drawer
// ═══════════════════════════════════════════════════════════════════════════

class _AppDrawer extends ConsumerWidget {
  const _AppDrawer();

  static const List<_Destination> _secondary = <_Destination>[
    _Destination('الزيارات السابقة', LucideIcons.stethoscope, RouteNames.visits),
    _Destination('المساعد الذكي', LucideIcons.sparkles, RouteNames.ai),
    _Destination('التقييمات', LucideIcons.star, RouteNames.reviews),
    _Destination('الإشعارات', LucideIcons.bell, RouteNames.notifications),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final Brightness brightness = Theme.of(context).brightness;
    final Color drawerBg = brightness == Brightness.dark
        ? AppColors.drawerDark
        : AppColors.drawer;

    final AsyncValue<AuthSession?> authState =
        ref.watch(authControllerProvider);
    final AuthSession? session = authState.value;

    final int unread = ref.watch(unreadNotificationsCountProvider);

    final String currentLocation = GoRouterState.of(context).matchedLocation;

    return Drawer(
      backgroundColor: drawerBg,
      shape: const RoundedRectangleBorder(),
      child: SafeArea(
        child: Column(
          children: <Widget>[
            const _BrandBlock(),
            _UserBlock(session: session),
            const Divider(color: Color(0x26FFFFFF), height: 1),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(vertical: 12),
                children: <Widget>[
                  for (final _Destination d in _secondary)
                    _DrawerItem(
                      label: d.label,
                      icon: d.icon,
                      selected: currentLocation == d.path,
                      badgeCount: d.path == RouteNames.notifications
                          ? unread
                          : 0,
                      onTap: () {
                        Navigator.of(context).pop();
                        context.go(d.path);
                      },
                    ),
                ],
              ),
            ),
            const Divider(color: Color(0x26FFFFFF), height: 1),
            _DrawerItem(
              label: 'تسجيل الخروج',
              icon: LucideIcons.logOut,
              isDanger: true,
              onTap: () async {
                Navigator.of(context).pop();
                final bool confirmed = await _confirmLogout(context);
                if (!confirmed) return;
                await ref.read(authControllerProvider.notifier).logout();
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class _BrandBlock extends StatelessWidget {
  const _BrandBlock();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(20, 24, 20, 16),
      child: Row(
        children: <Widget>[
          Container(
            width: 40,
            height: 40,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: <Color>[AppColors.primary, AppColors.action],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: AppRadii.radiusMd,
            ),
            alignment: Alignment.center,
            child: const Icon(
              LucideIcons.heartPulse,
              color: Colors.white,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'مريض 360°',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const Text(
                  'لوحة المريض',
                  style: TextStyle(
                    color: Color(0xFF90A4AE),
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _UserBlock extends StatelessWidget {
  const _UserBlock({required this.session});

  final AuthSession? session;

  @override
  Widget build(BuildContext context) {
    final Person? person = session?.person;
    final Child? child = session?.child;
    final String? firstName = person?.firstName ?? child?.firstName;
    final String fullName = person?.fullName ?? child?.fullName ?? 'مريض';
    final String? medicalCardNumber = session?.patient.medicalCardNumber;
    final bool isMinor = session?.isMinor ?? false;
    final String initial =
        (firstName != null && firstName.isNotEmpty) ? firstName[0] : 'م';

    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(20, 8, 20, 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: AppColors.action.withValues(alpha: 0.28),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              initial,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 18,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  fullName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (medicalCardNumber != null) ...<Widget>[
                  const SizedBox(height: 4),
                  Row(
                    children: <Widget>[
                      const Icon(
                        LucideIcons.creditCard,
                        size: 12,
                        color: Color(0xFF90A4AE),
                      ),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          medicalCardNumber,
                          textDirection: TextDirection.ltr,
                          style: const TextStyle(
                            color: Color(0xFF90A4AE),
                            fontSize: 12,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
                if (isMinor) ...<Widget>[
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.warning.withValues(alpha: 0.25),
                      borderRadius: AppRadii.radiusSm,
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: <Widget>[
                        Icon(
                          LucideIcons.baby,
                          size: 12,
                          color: Color(0xFFFFD54F),
                        ),
                        SizedBox(width: 4),
                        Text(
                          'قاصر',
                          style: TextStyle(
                            color: Color(0xFFFFD54F),
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DrawerItem extends StatelessWidget {
  const _DrawerItem({
    required this.label,
    required this.icon,
    required this.onTap,
    this.selected = false,
    this.isDanger = false,
    this.badgeCount = 0,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool selected;
  final bool isDanger;
  final int badgeCount;

  @override
  Widget build(BuildContext context) {
    final Color baseColor = isDanger
        ? const Color(0xFFEF9A9A)
        : (selected ? Colors.white : const Color(0xFFE0F2F1));
    final Color? bg = selected ? AppColors.action : null;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: AppRadii.radiusMd,
          ),
          child: Row(
            children: <Widget>[
              Icon(icon, size: 20, color: baseColor),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    color: baseColor,
                    fontSize: 14,
                    fontWeight:
                        selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ),
              if (badgeCount > 0)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  decoration: const BoxDecoration(
                    color: AppColors.error,
                    borderRadius: AppRadii.radiusSm,
                  ),
                  child: Text(
                    badgeCount > 99 ? '99+' : badgeCount.toString(),
                    textDirection: TextDirection.ltr,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
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

/// Confirms the logout action via an [AlertDialog]. Returns `true` only
/// when the user explicitly taps "تأكيد" — closing the dialog or tapping
/// outside is treated as a cancel. We require an explicit confirmation
/// because logging out wipes scheduled medication reminders for this user.
Future<bool> _confirmLogout(BuildContext context) async {
  final bool? answer = await showDialog<bool>(
    context: context,
    builder: (BuildContext ctx) => AlertDialog(
      title: const Text('تسجيل الخروج'),
      content: const Text(
        'هل أنت متأكد من رغبتك في تسجيل الخروج؟',
        style: TextStyle(height: 1.5),
      ),
      actions: <Widget>[
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('إلغاء'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.error,
            foregroundColor: Colors.white,
          ),
          child: const Text('تأكيد'),
        ),
      ],
    ),
  );
  return answer == true;
}
