import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/ai_assistant/presentation/ai_assistant_screen.dart';
import '../features/appointments/presentation/appointments_screen.dart';
import '../features/drug_risk/presentation/pages/drug_risk_check_page.dart';
import '../features/auth/domain/auth_session.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/providers/auth_provider.dart';
import '../features/home/presentation/home_screen.dart';
import '../features/prescriptions/domain/prescription.dart';
import '../features/prescriptions/presentation/prescription_detail_screen.dart';
import '../features/splash/presentation/splash_screen.dart';
import '../features/visits/domain/visit.dart';
import '../features/visits/presentation/visit_detail_screen.dart';
import '../features/lab_results/domain/lab_test.dart';
import '../features/lab_results/presentation/lab_result_detail_screen.dart';
import '../features/lab_results/presentation/lab_results_screen.dart';
import '../features/medications/presentation/medications_screen.dart';
import '../features/notifications/presentation/notifications_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../features/reviews/presentation/reviews_screen.dart';
import '../features/visits/presentation/visits_screen.dart';
import '../shared/widgets/app_shell.dart';
import 'route_names.dart';

/// Top-level go_router configuration wired up as a Riverpod provider so it
/// can react to auth state via [refreshListenable].
///
/// Layout:
///   /login  — standalone
///   /home   + 4 other primary routes, and 4 secondary routes, all nested
///             inside a single [ShellRoute] so the bottom nav and drawer
///             stay alive across tab switches.
final Provider<GoRouter> appRouterProvider = Provider<GoRouter>((Ref ref) {
  final _AuthListenable refreshListenable = _AuthListenable(ref);
  ref.onDispose(refreshListenable.dispose);

  return GoRouter(
    // Boot order:
    //   1) /splash  — branded splash for ~1.6s (no auth checks)
    //   2) /splash signals onComplete → navigates to /home
    //   3) redirect callback then sends user to /login if no session,
    //      otherwise lets them land on /home
    initialLocation: '/splash',
    refreshListenable: refreshListenable,
    redirect: (BuildContext context, GoRouterState state) {
      final AsyncValue<AuthSession?> authState = ref.read(
        authControllerProvider,
      );
      if (authState.isLoading) return null;

      final bool loggedIn = authState.value != null;
      final bool goingToLogin = state.matchedLocation == RouteNames.login;
      final bool goingToSplash = state.matchedLocation == '/splash';

      // The splash is a standalone intro screen; never redirect away from
      // it — it self-navigates to /home when its hold timer finishes, and
      // the redirect logic below kicks in on that next route.
      if (goingToSplash) return null;

      if (!loggedIn && !goingToLogin) return RouteNames.login;
      if (loggedIn && goingToLogin) return RouteNames.home;
      return null;
    },
    routes: <RouteBase>[
      // ─── Splash (standalone, no shell, no auth) ──────────────────────
      GoRoute(
        path: '/splash',
        builder: (BuildContext context, GoRouterState state) =>
            SplashScreen(onComplete: () => context.go(RouteNames.home)),
      ),
      GoRoute(
        path: RouteNames.login,
        builder: (BuildContext context, GoRouterState state) =>
            const LoginScreen(),
      ),
      ShellRoute(
        builder: (BuildContext context, GoRouterState state, Widget child) =>
            AppShell(child: child),
        routes: <RouteBase>[
          GoRoute(
            path: RouteNames.home,
            builder: (_, __) => const HomeScreen(),
          ),
          GoRoute(
            path: RouteNames.appointments,
            builder: (_, __) => const AppointmentsScreen(),
          ),
          GoRoute(
            path: RouteNames.medications,
            builder: (_, __) => const MedicationsScreen(),
          ),
          GoRoute(
            path: RouteNames.lab,
            builder: (_, __) => const LabResultsScreen(),
          ),
          GoRoute(
            path: '/visits/:id',
            builder: (BuildContext context, GoRouterState state) {
              final String id = state.pathParameters['id'] ?? '';
              final Visit? initial = state.extra is Visit
                  ? state.extra as Visit
                  : null;
              return VisitDetailScreen(visitId: id, initialVisit: initial);
            },
          ),
          GoRoute(
            path: '/prescriptions/:id',
            builder: (BuildContext context, GoRouterState state) {
              final String id = state.pathParameters['id'] ?? '';
              final Prescription? initial = state.extra is Prescription
                  ? state.extra as Prescription
                  : null;
              return PrescriptionDetailScreen(
                prescriptionId: id,
                initialPrescription: initial,
              );
            },
          ),
          GoRoute(
            path: '/lab-results/:id',
            builder: (BuildContext context, GoRouterState state) {
              final String id = state.pathParameters['id'] ?? '';
              final LabTest? initialTest = state.extra is LabTest
                  ? state.extra as LabTest
                  : null;
              return LabResultDetailScreen(
                testId: id,
                initialTest: initialTest,
              );
            },
          ),
          GoRoute(
            path: RouteNames.profile,
            builder: (_, __) => const ProfileScreen(),
          ),
          GoRoute(
            path: RouteNames.visits,
            builder: (_, __) => const VisitsScreen(),
          ),
          GoRoute(
            path: RouteNames.ai,
            builder: (_, __) => const AIAssistantScreen(),
          ),
          GoRoute(
            path: RouteNames.drugRisk,
            builder: (_, __) => const DrugRiskCheckPage(),
          ),
          GoRoute(
            path: RouteNames.reviews,
            builder: (_, __) => const ReviewsScreen(),
          ),
          GoRoute(
            path: RouteNames.notifications,
            builder: (_, __) => const NotificationsScreen(),
          ),
        ],
      ),
    ],
  );
});

/// Bridges Riverpod's [authControllerProvider] changes onto a [Listenable]
/// so that GoRouter re-evaluates [redirect] whenever the auth state flips.
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(Ref ref) {
    _sub = ref.listen<AsyncValue<AuthSession?>>(
      authControllerProvider,
      (AsyncValue<AuthSession?>? _, AsyncValue<AuthSession?> __) =>
          notifyListeners(),
      fireImmediately: false,
    );
  }

  // ignore: unused_field
  late final ProviderSubscription<AsyncValue<AuthSession?>> _sub;

  @override
  void dispose() {
    _sub.close();
    super.dispose();
  }
}
