import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/utils/logger.dart';
import '../domain/appointment.dart';
import '../domain/availability_slot.dart';
import '../domain/doctor_summary.dart';

class AppointmentsRepository {
  const AppointmentsRepository(this._dio);

  final Dio _dio;

  /// GET `/api/patient/appointments`. Optional [statusGroup] lets the backend
  /// pre-filter (`upcoming` | `past` | `cancelled`); when null, the list is
  /// grouped client-side.
  Future<List<Appointment>> getAppointments({String? statusGroup}) async {
    return _wrap<List<Appointment>>(
      label: 'getAppointments',
      call: () async {
        final Response<dynamic> res = await _dio.get<dynamic>(
          '/patient/appointments',
          queryParameters: <String, dynamic>{
            if (statusGroup != null) 'statusGroup': statusGroup,
          },
        );
        return _readListOfMaps(res.data, 'appointments')
            .map(Appointment.fromJson)
            .toList();
      },
    );
  }

  /// GET `/api/patient/doctors`. Backend supports filtering by
  /// specialization + governorate + city + isAvailable; we forward whatever
  /// is supplied here.
  Future<List<DoctorSummary>> searchDoctors({
    String? specialization,
    String? governorate,
    String? city,
    bool? isAvailable,
  }) async {
    return _wrap<List<DoctorSummary>>(
      label: 'searchDoctors',
      call: () async {
        final Response<dynamic> res = await _dio.get<dynamic>(
          '/patient/doctors',
          queryParameters: <String, dynamic>{
            if (specialization != null && specialization.isNotEmpty)
              'specialization': specialization,
            if (governorate != null && governorate.isNotEmpty)
              'governorate': governorate,
            if (city != null && city.isNotEmpty) 'city': city,
            if (isAvailable != null) 'isAvailable': isAvailable,
          },
        );
        return _readListOfMaps(res.data, 'doctors')
            .map(DoctorSummary.fromJson)
            .toList();
      },
    );
  }

  /// GET `/api/patient/doctors/:id/slots`. Returns only slots the doctor has
  /// open (the backend filters `isBooked` already, but callers should guard
  /// against [AvailabilitySlot.isBooked] too).
  Future<List<AvailabilitySlot>> getDoctorSlots(String doctorId) async {
    return _wrap<List<AvailabilitySlot>>(
      label: 'getDoctorSlots',
      call: () async {
        final Response<dynamic> res =
            await _dio.get<dynamic>('/patient/doctors/$doctorId/slots');
        return _readListOfMaps(res.data, 'slots')
            .map(AvailabilitySlot.fromJson)
            .toList();
      },
    );
  }

  /// POST `/api/patient/appointments`. Patient identity is resolved
  /// server-side from the JWT, so the payload deliberately does not include
  /// patientPersonId / patientChildId.
  Future<Appointment> bookAppointment(BookAppointmentDto dto) async {
    return _wrap<Appointment>(
      label: 'bookAppointment',
      call: () async {
        final Response<dynamic> res = await _dio.post<dynamic>(
          '/patient/appointments',
          data: dto.toJson(),
        );
        return Appointment.fromJson(
          _readMap(res.data, 'appointment'),
        );
      },
    );
  }

  /// PATCH `/api/patient/appointments/:id/cancel`. Uses PATCH (not POST) to
  /// match the web client — see `frontend/src/services/api.js`.
  Future<Appointment> cancelAppointment(
    String id, {
    required String cancellationReason,
  }) async {
    return _wrap<Appointment>(
      label: 'cancelAppointment',
      call: () async {
        final Response<dynamic> res = await _dio.patch<dynamic>(
          '/patient/appointments/$id/cancel',
          data: <String, dynamic>{
            'cancellationReason': cancellationReason,
          },
        );
        return Appointment.fromJson(
          _readMap(res.data, 'appointment'),
        );
      },
    );
  }

  // ───────── private helpers ─────────

  Future<T> _wrap<T>({
    required String label,
    required Future<T> Function() call,
  }) async {
    try {
      return await call();
    } on DioException catch (e, st) {
      appLogger.e('$label failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('$label unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }

  static Map<String, dynamic> _readMap(Object? data, String key) {
    final Map<String, dynamic> body =
        (data as Map<dynamic, dynamic>).cast<String, dynamic>();
    final Object? inner = body[key];
    if (inner is Map) return inner.cast<String, dynamic>();
    throw const ApiException.server(500, 'استجابة غير متوقعة من الخادم');
  }

  static List<Map<String, dynamic>> _readListOfMaps(
    Object? data,
    String key,
  ) {
    final Map<String, dynamic> body =
        (data as Map<dynamic, dynamic>).cast<String, dynamic>();
    final Object? raw = body[key];
    if (raw is! List) {
      throw const ApiException.server(500, 'استجابة غير متوقعة من الخادم');
    }
    return raw
        .whereType<Map<dynamic, dynamic>>()
        .map((Map<dynamic, dynamic> m) => m.cast<String, dynamic>())
        .toList();
  }
}

final Provider<AppointmentsRepository> appointmentsRepositoryProvider =
    Provider<AppointmentsRepository>(
  (Ref ref) => AppointmentsRepository(ref.watch(dioProvider)),
);
