import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../storage/secure_storage.dart';

/// Events emitted by the network layer that feature code may observe.
enum AuthEvent { expired }

/// Broadcasts auth-related events (currently just token expiry on 401).
///
/// Kept as a singleton stream controller so the interceptor can fire events
/// without holding a Ref.
class AuthEventBus {
  AuthEventBus()
      : _controller = StreamController<AuthEvent>.broadcast();

  final StreamController<AuthEvent> _controller;

  Stream<AuthEvent> get stream => _controller.stream;

  void emit(AuthEvent event) => _controller.add(event);

  void dispose() => unawaited(_controller.close());
}

final Provider<AuthEventBus> authEventsProvider = Provider<AuthEventBus>(
  (Ref ref) {
    final AuthEventBus bus = AuthEventBus();
    ref.onDispose(bus.dispose);
    return bus;
  },
);

/// Attaches `Authorization: Bearer <jwt>` to outgoing requests and reacts to
/// 401 responses by wiping secure storage and emitting [AuthEvent.expired].
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required SecureStorage storage,
    required AuthEventBus eventBus,
  })  : _storage = storage,
        _eventBus = eventBus;

  final SecureStorage _storage;
  final AuthEventBus _eventBus;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final String? jwt = await _storage.read(SecureStorageKeys.jwt);
    if (jwt != null && jwt.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $jwt';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode == 401) {
      final bool isLoginCall =
          (err.requestOptions.path).contains('/auth/login');
      if (!isLoginCall) {
        await _storage.clearAuth();
        _eventBus.emit(AuthEvent.expired);
      }
    }
    handler.next(err);
  }
}
