// ============================================================================
// DrugRiskRepository - Patient 360 mobile (drug-risk feature)
// ----------------------------------------------------------------------------
// All drug-risk network access flows through this repository so the UI stays
// Dio-agnostic and unit tests can swap in a fake.
//
// LOCKED BACKEND CONTRACT (verified against routes/drugRisk/drugRisk.js)
// Mounted at /api/drug-risk
//   POST   /check            patient self-inquiry             { text }
//   GET    /my-history       patient's check history          ?page=1&limit=20
//   GET    /health           FastAPI reachability probe       (debug)
//
// The /check-for-patient and /:id/acknowledge endpoints are doctor-only and
// not exposed here — the mobile app is patient-only.
//
// CONTRACT: response shape
//   POST /check  -> { success: true, check: { _id, result, isOutOfScope,
//                                              isHighRisk, createdAt } }
//   GET  /my-history -> { success: true, page, limit, total, checks: [...] }
//
// Error mapping:
//   * 400 / 404 / 500 / 503 -> ApiException with Arabic message from backend
//   * Network failure       -> ApiException.fromDioError
// ============================================================================

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/utils/logger.dart';
import '../domain/drug_risk_check.dart';

class DrugRiskRepository {
  const DrugRiskRepository(this._dio);

  final Dio _dio;

  // -- Patient self-inquiry --------------------------------------------------

  /// POST `/api/drug-risk/check` with `{ text }`. Returns the freshly-created
  /// [DrugRiskCheck] from the backend (which already includes the FastAPI
  /// pipeline's result wrapped + persisted).
  ///
  /// Throws [ApiException] on failure. The backend returns 503 when Kinan's
  /// FastAPI is unreachable; we forward that as a user-friendly Arabic
  /// message via [ApiException.fromDioError].
  ///
  /// Typical latency:
  ///   * In-scope drug    : 50-200ms  (FastAPI rule-based pipeline)
  ///   * Out-of-scope drug: 10-30ms   (Node short-circuit, no FastAPI call)
  Future<DrugRiskCheck> checkDrug({required String text}) async {
    try {
      final Response<dynamic> res = await _dio.post<dynamic>(
        '/drug-risk/check',
        data: <String, dynamic>{'text': text},
      );

      final Map<String, dynamic> body = (res.data as Map<dynamic, dynamic>)
          .cast<String, dynamic>();

      final Object? rawCheck = body['check'];
      if (rawCheck is! Map) {
        // Wrap a stable Exception object so ApiException.unknown wraps it
        // safely — matches the (Object e) signature used throughout the
        // codebase (see ai_repository.dart).
        throw ApiException.unknown(
          Exception('Unexpected response shape: missing "check" field'),
        );
      }
      return DrugRiskCheck.fromJson(rawCheck.cast<String, dynamic>());
    } on DioException catch (e, st) {
      appLogger.e('checkDrug failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('checkDrug unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }

  // -- History ---------------------------------------------------------------

  /// GET `/api/drug-risk/my-history?page=1&limit=20`. Returns the patient's
  /// past checks newest-first. v1 only loads the first page; pagination
  /// lands in a later prompt.
  ///
  /// The backend caps `limit` at 50 server-side.
  Future<List<DrugRiskCheck>> getMyHistory({
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final Response<dynamic> res = await _dio.get<dynamic>(
        '/drug-risk/my-history',
        queryParameters: <String, dynamic>{'page': page, 'limit': limit},
      );

      final Map<String, dynamic> body = (res.data as Map<dynamic, dynamic>)
          .cast<String, dynamic>();

      final List<dynamic> raw =
          (body['checks'] as List<dynamic>?) ?? const <dynamic>[];

      return raw
          .whereType<Map<dynamic, dynamic>>()
          .map((Map<dynamic, dynamic> m) => m.cast<String, dynamic>())
          .map(DrugRiskCheck.fromJson)
          .toList(growable: false)
        ..sort(
          (DrugRiskCheck a, DrugRiskCheck b) =>
              b.createdAt.compareTo(a.createdAt),
        );
    } on DioException catch (e, st) {
      appLogger.e('getMyHistory failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('getMyHistory unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }

  // -- Health probe (debug) --------------------------------------------------

  /// GET `/api/drug-risk/health`. Used to verify Node <-> FastAPI connectivity
  /// from a debug screen. Not surfaced in the user-facing UI.
  ///
  /// Returns true when FastAPI is reachable, false otherwise. Never throws —
  /// any error is interpreted as "unhealthy".
  Future<bool> probeHealth() async {
    try {
      final Response<dynamic> res = await _dio.get<dynamic>(
        '/drug-risk/health',
      );
      final Map<String, dynamic> body = (res.data as Map<dynamic, dynamic>)
          .cast<String, dynamic>();
      return (body['success'] as bool?) ?? false;
    } catch (e, st) {
      appLogger.w(
        'probeHealth failed (FastAPI likely down)',
        error: e,
        stackTrace: st,
      );
      return false;
    }
  }
}

final Provider<DrugRiskRepository> drugRiskRepositoryProvider =
    Provider<DrugRiskRepository>(
      (Ref ref) => DrugRiskRepository(ref.watch(dioProvider)),
    );
