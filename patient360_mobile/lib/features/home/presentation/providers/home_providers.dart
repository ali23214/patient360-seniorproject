import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../auth/domain/auth_session.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/overview_repository.dart';
import '../../domain/overview.dart';

/// Loads the home dashboard overview. Caches inside the Riverpod container
/// so the UI can `.refresh` it on pull-to-refresh without replumbing state.
final FutureProvider<Overview> dashboardOverviewProvider =
    FutureProvider<Overview>((Ref ref) async {
  final OverviewRepository repo = ref.watch(overviewRepositoryProvider);
  return repo.getDashboardOverview();
});

/// Exposes the logged-in [AuthSession]. Throws if the user is not signed in;
/// the shell redirects before any consumer can see that state in practice.
final Provider<AuthSession> currentSessionProvider = Provider<AuthSession>(
  (Ref ref) {
    final AsyncValue<AuthSession?> authState =
        ref.watch(authControllerProvider);
    final AuthSession? session = authState.value;
    if (session == null) {
      throw StateError('currentSessionProvider read before sign-in completed');
    }
    return session;
  },
);
