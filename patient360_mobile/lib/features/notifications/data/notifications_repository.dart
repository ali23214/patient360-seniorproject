import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/utils/logger.dart';
import '../domain/app_notification.dart';

/// Patient-facing notifications data source.
///
/// Hits:
///   GET  /patient/notifications         — list (newest first)
///   POST /patient/notifications/:id/read — mark single notification read
///
/// Response handling is defensive: the backend has been observed returning
/// the list under either `notifications` (current) or `data` (legacy), and
/// individual items occasionally arrive with missing fields after the
/// notification schema migrated. We accept both shapes and skip rows that
/// can't be parsed rather than failing the whole load.
class NotificationsRepository {
  const NotificationsRepository(this._dio);

  final Dio _dio;

  /// Fetch the patient's notifications, newest first.
  ///
  /// Tolerates two response envelopes:
  ///   1. `{ success: true, notifications: [...] }`  (current backend)
  ///   2. `{ success: true, data: [...] }`           (legacy)
  /// Also accepts a bare top-level array `[...]` for completeness.
  Future<List<AppNotification>> getNotifications() async {
    try {
      final Response<dynamic> res = await _dio.get<dynamic>(
        '/patient/notifications',
      );

      // Diagnostic: log envelope shape on every call so we can spot
      // regressions without redeploying. Drops to INFO so it's noisy
      // but harmless. Strip once stable.
      appLogger.i(
        '📬 notifications response status=${res.statusCode} '
        'keys=${res.data is Map ? (res.data as Map).keys.toList() : "<list>"}',
      );

      // Extract the raw list regardless of envelope shape
      final List<dynamic> raw = _extractList(res.data);

      // Map → AppNotification, skipping items that fail to parse so a
      // single bad row doesn't blank the entire screen.
      final List<AppNotification> parsed = <AppNotification>[];
      int skipped = 0;
      for (final dynamic item in raw) {
        if (item is! Map) {
          skipped++;
          continue;
        }
        try {
          final Map<String, dynamic> m = (item as Map<dynamic, dynamic>)
              .cast<String, dynamic>();
          parsed.add(AppNotification.fromJson(m));
        } catch (e) {
          skipped++;
          appLogger.w('⚠️  Failed to parse notification — skipping. error=$e');
        }
      }

      if (skipped > 0) {
        appLogger.w(
          '⚠️  Skipped $skipped malformed notifications out of ${raw.length}',
        );
      }

      // Sort newest first (defense in depth — backend should already do this)
      parsed.sort(
        (AppNotification a, AppNotification b) =>
            b.createdAt.compareTo(a.createdAt),
      );

      appLogger.i('✅ Loaded ${parsed.length} notifications');
      return parsed;
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

  /// Mark one notification as read. Idempotent — backend treats re-marks
  /// as no-ops so the optimistic-update flow in the provider is safe.
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

  /// Pull the notifications array from any of the supported response shapes.
  /// Returns an empty list if nothing usable is present — the caller treats
  /// that as "patient has no notifications" rather than an error.
  static List<dynamic> _extractList(dynamic body) {
    if (body is List) return body;
    if (body is Map) {
      // Most common shape today
      if (body['notifications'] is List) {
        return body['notifications'] as List<dynamic>;
      }
      // Legacy shape from earlier backend versions
      if (body['data'] is List) {
        return body['data'] as List<dynamic>;
      }
      // Some endpoints return { result: [...] }
      if (body['result'] is List) {
        return body['result'] as List<dynamic>;
      }
    }
    return const <dynamic>[];
  }
}

/// App-wide singleton — disposed automatically with the root ProviderScope.
final Provider<NotificationsRepository> notificationsRepositoryProvider =
    Provider<NotificationsRepository>(
      (Ref ref) => NotificationsRepository(ref.watch(dioProvider)),
    );
