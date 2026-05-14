/// Centralized route path constants referenced by the go_router config.
///
/// Primary (bottom-nav) and secondary (drawer-only) routes all share the
/// same [ShellRoute] so the persistent chrome keeps state across tabs.
final class RouteNames {
  const RouteNames._();

  // Standalone.
  static const String login = '/login';

  // Primary (bottom nav).
  static const String home = '/home';
  static const String appointments = '/appointments';
  static const String medications = '/medications';
  static const String lab = '/lab';
  static const String profile = '/profile';

  // Secondary (drawer only).
  static const String visits = '/visits';
  static const String ai = '/ai';
  static const String reviews = '/reviews';
  static const String notifications = '/notifications';

  static const List<String> primary = <String>[
    home,
    appointments,
    medications,
    lab,
    profile,
  ];
}
