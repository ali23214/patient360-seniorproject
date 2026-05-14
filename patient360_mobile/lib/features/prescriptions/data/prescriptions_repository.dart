import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/utils/logger.dart';
import '../domain/prescription.dart';

class PrescriptionsRepository {
  const PrescriptionsRepository(this._dio);

  final Dio _dio;

  /// GET `/api/patient/prescriptions`. Backend resolves the patient from the
  /// JWT and returns `{ success, prescriptions: [...] }`.
  Future<List<Prescription>> getPrescriptions() async {
    try {
      final Response<dynamic> res =
          await _dio.get<dynamic>('/patient/prescriptions');
      final Map<String, dynamic> body =
          (res.data as Map<dynamic, dynamic>).cast<String, dynamic>();
      final List<dynamic> raw =
          (body['prescriptions'] as List<dynamic>?) ?? const <dynamic>[];
      final List<Prescription> list = raw
          .whereType<Map<dynamic, dynamic>>()
          .map((Map<dynamic, dynamic> m) => m.cast<String, dynamic>())
          .map(Prescription.fromJson)
          .toList()
        ..sort(
          (Prescription a, Prescription b) =>
              b.prescriptionDate.compareTo(a.prescriptionDate),
        );
      return list;
    } on DioException catch (e, st) {
      appLogger.e('getPrescriptions failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('getPrescriptions unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }
}

final Provider<PrescriptionsRepository> prescriptionsRepositoryProvider =
    Provider<PrescriptionsRepository>(
  (Ref ref) => PrescriptionsRepository(ref.watch(dioProvider)),
);
