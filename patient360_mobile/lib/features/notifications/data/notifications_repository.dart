import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/utils/logger.dart';
import '../domain/app_notification.dart';

class NotificationsRepository {
  const NotificationsRepository(this._dio);

  final Dio _dio;

  /// GET `/api/patient/notifications`. Backend scopes by JWT.
  Future<List<AppNotification>> getNotifications() async {
    try {
      final Response<dynamic> res =
          await _dio.get<dynamic>('/patient/notifications');
      final Map<String, dynamic> body =
          (res.data as Map<dynamic, dynamic>).cast<String, dynamic>();
      final List<dynamic> raw =
          (body['notifications'] as List<dynamic>?) ?? const <dynamic>[];
      return raw
          .whereType<Map<dynamic, dynamic>>()
          .map((Map<dynamic, dynamic> m) => m.cast<String, dynamic>())
          .map(AppNotification.fromJson)
          .toList()
        ..sort((AppNotification a, AppNotification b) =>
            b.createdAt.compareTo(a.createdAt));
    } on DioException catch (e, st) {
      appLogger.e('getNotifications failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('getNotifications unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }

  /// POST `/api/patient/notifications/{id}/read`. Idempotent on the
  /// backend — re-marking is a no-op.
  Future<void> markNotificationRead(String id) async {
    try {
      await _dio.post<dynamic>('/patient/notifications/$id/read');
    } on DioException catch (e, st) {
      appLogger.e('markNotificationRead failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('markNotificationRead unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }
}

final Provider<NotificationsRepository> notificationsRepositoryProvider =
    Provider<NotificationsRepository>(
  (Ref ref) => NotificationsRepository(ref.watch(dioProvider)),
);
