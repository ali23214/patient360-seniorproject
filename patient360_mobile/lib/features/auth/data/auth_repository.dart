import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../core/utils/logger.dart';
import '../domain/auth_session.dart';
import '../domain/child.dart';
import '../domain/patient_profile.dart';
import '../domain/person.dart';
import '../domain/user.dart';

const String _patientRole = 'patient';

class AuthRepository {
  AuthRepository({required Dio dio, required SecureStorage storage})
    : _dio = dio,
      _storage = storage;

  final Dio _dio;
  final SecureStorage _storage;

  /// POSTs `/api/auth/login`. On success, caches JWT + user in secure
  /// storage and returns a fully-populated [AuthSession].
  ///
  /// Throws [ApiException.unauthorized] if the returned [User.roles] does
  /// not contain `'patient'` — this is a patient-only app.
  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    try {
      final Response<dynamic> response = await _dio.post<dynamic>(
        '/auth/login',
        data: <String, dynamic>{'email': email, 'password': password},
      );

      final Map<String, dynamic> body = (response.data as Map<dynamic, dynamic>)
          .cast<String, dynamic>();
      final String? token = body['token'] as String?;
      final Map<String, dynamic>? userJson =
          (body['user'] as Map<dynamic, dynamic>?)?.cast<String, dynamic>();

      if (token == null || userJson == null) {
        throw const ApiException.server(500, 'استجابة تسجيل الدخول غير صالحة');
      }

      final User user = User.fromJson(userJson);

      if (!user.roles.contains(_patientRole)) {
        appLogger.w('Login rejected: account is not a patient');
        throw const ApiException.unauthorized(
          message: 'هذا التطبيق مخصص للمرضى فقط. الرجاء استخدام بوابة الويب.',
        );
      }

      await _storage.write(SecureStorageKeys.jwt, token);
      await _storage.write(SecureStorageKeys.user, jsonEncode(user.toJson()));

      return _buildSession(jwt: token, user: user);
    } on DioException catch (e, st) {
      appLogger.e('login failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('login unknown error', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }

  /// Reads the cached JWT; if present, calls GET `/api/patient/profile` and
  /// returns an [AuthSession]. Returns `null` if no JWT is stored.
  Future<AuthSession?> getCurrentSession() async {
    final String? token = await _storage.read(SecureStorageKeys.jwt);
    if (token == null || token.isEmpty) return null;

    final String? userJsonStr = await _storage.read(SecureStorageKeys.user);
    if (userJsonStr == null || userJsonStr.isEmpty) return null;

    try {
      final User user = User.fromJson(
        (jsonDecode(userJsonStr) as Map<dynamic, dynamic>)
            .cast<String, dynamic>(),
      );
      return _buildSession(jwt: token, user: user);
    } on DioException catch (e, st) {
      appLogger.e('getCurrentSession failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('getCurrentSession unknown error', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }

  Future<void> logout() async {
    await _storage.clearAuth();
  }

  /// POSTs `/api/auth/forgot-password` with `{ email }`.
  Future<void> requestPasswordResetOtp(String email) async {
    try {
      await _dio.post<dynamic>(
        '/auth/forgot-password',
        data: <String, dynamic>{'email': email},
      );
    } on DioException catch (e, st) {
      appLogger.e('requestPasswordResetOtp failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } catch (e, st) {
      appLogger.e('requestPasswordResetOtp unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }

  /// POSTs `/api/auth/reset-password` with `{ email, otp, newPassword }`.
  ///
  /// The backend validates the OTP and sets the new password in one call,
  /// so this single method covers both steps of the reset flow.
  Future<void> verifyPasswordResetOtp({
    required String email,
    required String otp,
    required String newPassword,
  }) async {
    try {
      await _dio.post<dynamic>(
        '/auth/reset-password',
        data: <String, dynamic>{
          'email': email,
          'otp': otp,
          'newPassword': newPassword,
        },
      );
    } on DioException catch (e, st) {
      appLogger.e('verifyPasswordResetOtp failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } catch (e, st) {
      appLogger.e('verifyPasswordResetOtp unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }

  /// Fetches the patient-side profile from `/api/patient/profile` and
  /// assembles an [AuthSession].
  Future<AuthSession> _buildSession({
    required String jwt,
    required User user,
  }) async {
    final Response<dynamic> response = await _dio.get<dynamic>(
      '/patient/profile',
    );

    final Map<String, dynamic> body = (response.data as Map<dynamic, dynamic>)
        .cast<String, dynamic>();

    final bool isMinor = (body['isMinor'] as bool?) ?? (user.childId != null);

    final Map<String, dynamic>? personJson =
        (body['person'] as Map<dynamic, dynamic>?)?.cast<String, dynamic>();
    final Map<String, dynamic>? childJson =
        (body['child'] as Map<dynamic, dynamic>?)?.cast<String, dynamic>();
    final Map<String, dynamic> patientJson =
        (body['patient'] as Map<dynamic, dynamic>).cast<String, dynamic>();

    return AuthSession(
      jwt: jwt,
      user: user,
      patient: PatientProfile.fromJson(patientJson),
      isMinor: isMinor,
      person: personJson == null ? null : Person.fromJson(personJson),
      child: childJson == null ? null : Child.fromJson(childJson),
    );
  }
}

final Provider<AuthRepository> authRepositoryProvider =
    Provider<AuthRepository>(
      (Ref ref) => AuthRepository(
        dio: ref.watch(dioProvider),
        storage: ref.watch(secureStorageProvider),
      ),
    );
