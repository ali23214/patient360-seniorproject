import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/utils/logger.dart';
import '../domain/overview.dart';

class OverviewRepository {
  const OverviewRepository(this._dio);

  final Dio _dio;

  /// GET `/api/patient/overview`. Returns the parsed [Overview] on success;
  /// wraps transport + backend errors as [ApiException] so callers can
  /// pattern-match uniformly.
  Future<Overview> getDashboardOverview() async {
    try {
      final Response<dynamic> response =
          await _dio.get<dynamic>('/patient/overview');
      final Map<String, dynamic> body =
          (response.data as Map<dynamic, dynamic>).cast<String, dynamic>();
      return Overview.fromJson(body);
    } on DioException catch (e, st) {
      appLogger.e('getDashboardOverview failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } catch (e, st) {
      appLogger.e('getDashboardOverview unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }
}

final Provider<OverviewRepository> overviewRepositoryProvider =
    Provider<OverviewRepository>(
  (Ref ref) => OverviewRepository(ref.watch(dioProvider)),
);
