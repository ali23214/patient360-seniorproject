import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/utils/logger.dart';
import '../domain/lab_test.dart';

class LabTestsRepository {
  const LabTestsRepository(this._dio);

  final Dio _dio;

  /// GET `/api/patient/lab-tests`. Backend scopes by JWT's
  /// patientPersonId / patientChildId (dual-patient model — see CLAUDE.md).
  /// Returns `{ success, labTests: [...] }`.
  Future<List<LabTest>> getLabTests() async {
    try {
      final Response<dynamic> res =
          await _dio.get<dynamic>('/patient/lab-tests');
      final Map<String, dynamic> body =
          (res.data as Map<dynamic, dynamic>).cast<String, dynamic>();
      final List<dynamic> raw =
          (body['labTests'] as List<dynamic>?) ?? const <dynamic>[];
      final List<LabTest> list = raw
          .whereType<Map<dynamic, dynamic>>()
          .map((Map<dynamic, dynamic> m) => m.cast<String, dynamic>())
          .map(LabTest.fromJson)
          .toList()
        ..sort((LabTest a, LabTest b) =>
            b.orderDate.compareTo(a.orderDate));
      return list;
    } on DioException catch (e, st) {
      appLogger.e('getLabTests failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('getLabTests unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }

  /// POST `/api/patient/lab-tests/{id}/viewed`. Idempotent on the backend —
  /// re-marking a viewed test simply refreshes `patientViewedAt`.
  Future<void> markLabTestViewed(String id) async {
    try {
      await _dio.post<dynamic>('/patient/lab-tests/$id/viewed');
    } on DioException catch (e, st) {
      appLogger.e('markLabTestViewed failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('markLabTestViewed unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }
}

final Provider<LabTestsRepository> labTestsRepositoryProvider =
    Provider<LabTestsRepository>(
  (Ref ref) => LabTestsRepository(ref.watch(dioProvider)),
);
