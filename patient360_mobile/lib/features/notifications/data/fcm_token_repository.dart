import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_client.dart';
import '../../../core/utils/logger.dart';

/// Thin wire-layer over `POST/DELETE /api/auth/fcm-token`. The endpoints
/// are documented in `PATIENT360_MOBILE_APP_BRIEF.md` Part B.2 and are
/// **backend-owned**. We tolerate 404 here because the backend rollout
/// may lag behind the mobile release — a missing endpoint must NOT
/// prevent the patient from using the rest of the app.
class FcmTokenRepository {
  const FcmTokenRepository(this._dio);

  final Dio _dio;

  /// Idempotent on the server — a re-POST of the same token simply
  /// refreshes the `lastUsedAt` timestamp on the matching entry inside
  /// `accounts.pushNotificationTokens[]`.
  Future<void> registerToken({
    required String token,
    required String platform,
    String? deviceName,
    String? appVersion,
  }) async {
    try {
      await _dio.post<dynamic>(
        '/auth/fcm-token',
        data: <String, dynamic>{
          'token': token,
          'platform': platform,
          if (deviceName != null && deviceName.isNotEmpty)
            'deviceName': deviceName,
          if (appVersion != null && appVersion.isNotEmpty)
            'appVersion': appVersion,
        },
      );
    } on DioException catch (e) {
      _handleSoftFailure('register', e);
    } catch (e, st) {
      appLogger.w('register fcm token unknown', error: e, stackTrace: st);
    }
  }

  /// Called inside the logout flow before the JWT is wiped — using the
  /// stale JWT is fine because the interceptor still has it in memory.
  Future<void> unregisterToken({required String token}) async {
    try {
      await _dio.delete<dynamic>(
        '/auth/fcm-token',
        data: <String, dynamic>{'token': token},
      );
    } on DioException catch (e) {
      _handleSoftFailure('unregister', e);
    } catch (e, st) {
      appLogger.w('unregister fcm token unknown', error: e, stackTrace: st);
    }
  }

  /// 4xx/5xx responses on this surface are *non-fatal* — the worst case
  /// is the patient briefly receives no pushes. Logging is informational
  /// only; never re-throws.
  void _handleSoftFailure(String op, DioException e) {
    final int status = e.response?.statusCode ?? 0;
    if (status == 404) {
      appLogger.w(
          '[$op] /api/auth/fcm-token returned 404 — backend endpoint not '
          'yet live. Token state retained locally for retry next session.');
      return;
    }
    appLogger.w('[$op] fcm token call failed (status=$status)', error: e);
  }
}

final Provider<FcmTokenRepository> fcmTokenRepositoryProvider =
    Provider<FcmTokenRepository>(
  (Ref ref) => FcmTokenRepository(ref.watch(dioProvider)),
);
