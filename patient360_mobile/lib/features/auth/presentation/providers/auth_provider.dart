import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../core/network/auth_interceptor.dart';
import '../../../../core/utils/logger.dart';
import '../../../notifications/fcm_handler.dart';
import '../../../prescriptions/data/notification_scheduler.dart';
import '../../../prescriptions/data/reminder_local_store.dart';
import '../../data/auth_repository.dart';
import '../../domain/auth_session.dart';

/// Top-level auth state. Kept alive for the app's lifetime so feature code
/// can rely on a single source of truth without re-resolving providers.
class AuthController extends AsyncNotifier<AuthSession?> {
  StreamSubscription<AuthEvent>? _eventSub;

  @override
  Future<AuthSession?> build() async {
    ref.keepAlive();

    unawaited(_eventSub?.cancel());
    _eventSub = ref.watch(authEventsProvider).stream.listen((AuthEvent event) {
      if (event == AuthEvent.expired) {
        unawaited(_handleExpired());
      }
    });
    ref.onDispose(() {
      unawaited(_eventSub?.cancel());
    });

    try {
      final AuthSession? restored =
          await ref.read(authRepositoryProvider).getCurrentSession();
      if (restored != null) {
        // Fire-and-forget — FCM init is best-effort and must never block
        // session restore. Failures degrade silently per FcmHandler docs.
        // ignore: unawaited_futures
        ref.read(fcmHandlerProvider).initialize();
      }
      return restored;
    } on ApiException catch (e, st) {
      appLogger.w('initial session restore failed', error: e, stackTrace: st);
      return null;
    }
  }

  Future<void> login({
    required String email,
    required String password,
  }) async {
    state = const AsyncValue<AuthSession?>.loading();
    state = await AsyncValue.guard<AuthSession?>(
      () => ref.read(authRepositoryProvider).login(
            email: email,
            password: password,
          ),
    );
    if (state.value != null) {
      // ignore: unawaited_futures
      ref.read(fcmHandlerProvider).initialize();
    }
  }

  Future<void> logout() async {
    // Unregister the push token *before* the JWT is wiped — the auth
    // interceptor still has the token in memory at this point.
    try {
      await ref.read(fcmHandlerProvider).unregister();
    } catch (e, st) {
      appLogger.w('fcm unregister on logout failed',
          error: e, stackTrace: st);
    }
    await ref.read(authRepositoryProvider).logout();
    await _wipeReminders();
    state = const AsyncValue<AuthSession?>.data(null);
  }

  /// Replaces the in-memory [AuthSession] without re-issuing a JWT. Used
  /// after `PATCH /api/patient/profile` so every consumer that reads the
  /// session sees the patched person/patient/child triple immediately.
  void applySessionUpdate(AuthSession next) {
    state = AsyncValue<AuthSession?>.data(next);
  }

  Future<void> _handleExpired() async {
    try {
      await ref.read(fcmHandlerProvider).unregister();
    } catch (e, st) {
      appLogger.w('fcm unregister on expiry failed',
          error: e, stackTrace: st);
    }
    await ref.read(authRepositoryProvider).logout();
    await _wipeReminders();
    state = const AsyncValue<AuthSession?>.data(null);
  }

  /// Cancels every scheduled local notification and clears the local
  /// reminder store. Prevents another patient on the same device from
  /// seeing a previous user's medication reminders after a logout.
  Future<void> _wipeReminders() async {
    try {
      await ref.read(notificationSchedulerProvider).cancelAll();
      await ref.read(reminderLocalStoreProvider).clearAll();
    } catch (e, st) {
      appLogger.w('reminder wipe on logout failed',
          error: e, stackTrace: st);
    }
  }
}

final AsyncNotifierProvider<AuthController, AuthSession?> authControllerProvider =
    AsyncNotifierProvider<AuthController, AuthSession?>(AuthController.new);
