import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pretty_dio_logger/pretty_dio_logger.dart';

import '../config/env.dart';
import '../storage/secure_storage.dart';
import 'auth_interceptor.dart';

/// Singleton [Dio] wired with the Teal Medica backend base URL, JSON headers,
/// 15 second timeouts, the [AuthInterceptor], and a pretty request logger.
final Provider<Dio> dioProvider = Provider<Dio>((Ref ref) {
  final SecureStorage storage = ref.watch(secureStorageProvider);
  final AuthEventBus eventBus = ref.watch(authEventsProvider);

  final Dio dio = Dio(
    BaseOptions(
      baseUrl: Env.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: <String, String>{
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Client': 'p360-mobile',
      },
    ),
  );

  dio.interceptors.add(
    AuthInterceptor(storage: storage, eventBus: eventBus),
  );
  dio.interceptors.add(
    PrettyDioLogger(
      requestHeader: false,
      requestBody: false,
      responseHeader: false,
      responseBody: false,
      error: true,
      compact: true,
    ),
  );

  return dio;
});
