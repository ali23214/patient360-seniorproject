import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/utils/logger.dart';
import '../domain/visit.dart';

class VisitsRepository {
  const VisitsRepository(this._dio);

  final Dio _dio;

  /// GET `/api/patient/visits`. Backend already scopes by the JWT's
  /// patientPersonId / patientChildId.
  Future<List<Visit>> getVisits() async {
    try {
      final Response<dynamic> res =
          await _dio.get<dynamic>('/patient/visits');
      final Map<String, dynamic> body =
          (res.data as Map<dynamic, dynamic>).cast<String, dynamic>();
      final List<dynamic> raw = (body['visits'] as List<dynamic>?) ??
          const <dynamic>[];
      final List<Visit> list = raw
          .whereType<Map<dynamic, dynamic>>()
          .map((Map<dynamic, dynamic> m) => m.cast<String, dynamic>())
          .map(Visit.fromJson)
          .toList()
        ..sort(
          (Visit a, Visit b) => b.visitDate.compareTo(a.visitDate),
        );
      return list;
    } on DioException catch (e, st) {
      appLogger.e('getVisits failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('getVisits unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }
}

final Provider<VisitsRepository> visitsRepositoryProvider =
    Provider<VisitsRepository>(
  (Ref ref) => VisitsRepository(ref.watch(dioProvider)),
);
