import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:patient360_mobile/core/network/api_exception.dart';
import 'package:patient360_mobile/features/appointments/data/appointments_repository.dart';
import 'package:patient360_mobile/features/appointments/domain/appointment.dart';

class _MockDio extends Mock implements Dio {}

class _FakeRequestOptions extends Fake implements RequestOptions {}

void main() {
  setUpAll(() {
    registerFallbackValue(_FakeRequestOptions());
  });

  late _MockDio dio;
  late AppointmentsRepository repo;

  setUp(() {
    dio = _MockDio();
    repo = AppointmentsRepository(dio);
  });

  Response<Map<String, dynamic>> okJson(Map<String, dynamic> body) {
    return Response<Map<String, dynamic>>(
      data: body,
      statusCode: 200,
      requestOptions: RequestOptions(path: '/'),
    );
  }

  Map<String, dynamic> appointmentJson({String status = 'scheduled'}) {
    return <String, dynamic>{
      '_id': 'a-1',
      'appointmentType': 'doctor',
      'appointmentDate': '2026-05-01T00:00:00.000Z',
      'appointmentTime': '10:30',
      'reasonForVisit': 'فحص',
      'status': status,
      'bookingMethod': 'mobile_app',
      'priority': 'routine',
      'paymentStatus': 'pending',
      'createdAt': '2026-04-20T00:00:00.000Z',
      'updatedAt': '2026-04-20T00:00:00.000Z',
    };
  }

  test('getAppointments parses the list response', () async {
    when(
      () => dio.get<dynamic>(
        '/patient/appointments',
        queryParameters: any<Map<String, dynamic>?>(named: 'queryParameters'),
        options: any<Options?>(named: 'options'),
        cancelToken: any<CancelToken?>(named: 'cancelToken'),
        onReceiveProgress: any<ProgressCallback?>(named: 'onReceiveProgress'),
      ),
    ).thenAnswer(
      (_) async => okJson(<String, dynamic>{
        'success': true,
        'count': 2,
        'appointments': <Map<String, dynamic>>[
          appointmentJson(),
          appointmentJson(status: 'completed'),
        ],
      }),
    );

    final List<Appointment> result = await repo.getAppointments();
    expect(result, hasLength(2));
    expect(result.first.status, 'scheduled');
    expect(result.last.status, 'completed');
  });

  test('searchDoctors forwards specialization + governorate params',
      () async {
    when(
      () => dio.get<dynamic>(
        '/patient/doctors',
        queryParameters: any<Map<String, dynamic>?>(named: 'queryParameters'),
        options: any<Options?>(named: 'options'),
        cancelToken: any<CancelToken?>(named: 'cancelToken'),
        onReceiveProgress: any<ProgressCallback?>(named: 'onReceiveProgress'),
      ),
    ).thenAnswer(
      (_) async => okJson(<String, dynamic>{
        'success': true,
        'doctors': <Map<String, dynamic>>[
          <String, dynamic>{
            '_id': 'd-1',
            'firstName': 'سامي',
            'lastName': 'المصري',
            'specialization': 'cardiology',
          },
        ],
      }),
    );

    final result = await repo.searchDoctors(
      specialization: 'cardiology',
      governorate: 'damascus',
    );

    expect(result, hasLength(1));
    expect(result.first.displayName, 'د. سامي المصري');

    final Map<String, dynamic> params = verify(
      () => dio.get<dynamic>(
        '/patient/doctors',
        queryParameters: captureAny<Map<String, dynamic>?>(named: 'queryParameters'),
        options: any<Options?>(named: 'options'),
        cancelToken: any<CancelToken?>(named: 'cancelToken'),
        onReceiveProgress: any<ProgressCallback?>(named: 'onReceiveProgress'),
      ),
    ).captured.single as Map<String, dynamic>;
    expect(params['specialization'], 'cardiology');
    expect(params['governorate'], 'damascus');
  });

  test('getDoctorSlots hits the nested path', () async {
    when(
      () => dio.get<dynamic>(
        '/patient/doctors/d-1/slots',
        queryParameters: any<Map<String, dynamic>?>(named: 'queryParameters'),
        options: any<Options?>(named: 'options'),
        cancelToken: any<CancelToken?>(named: 'cancelToken'),
        onReceiveProgress: any<ProgressCallback?>(named: 'onReceiveProgress'),
      ),
    ).thenAnswer(
      (_) async => okJson(<String, dynamic>{
        'success': true,
        'slots': <Map<String, dynamic>>[
          <String, dynamic>{
            '_id': 's-1',
            'date': '2026-05-01T00:00:00.000Z',
            'startTime': '10:00',
            'endTime': '10:30',
            'isBooked': false,
          },
        ],
      }),
    );

    final result = await repo.getDoctorSlots('d-1');
    expect(result.single.id, 's-1');
    expect(result.single.isBooked, isFalse);
  });

  test('bookAppointment POSTs the DTO and returns the appointment',
      () async {
    when(
      () => dio.post<dynamic>(
        '/patient/appointments',
        data: any<Object?>(named: 'data'),
        options: any<Options?>(named: 'options'),
        queryParameters: any<Map<String, dynamic>?>(named: 'queryParameters'),
        cancelToken: any<CancelToken?>(named: 'cancelToken'),
        onSendProgress: any<ProgressCallback?>(named: 'onSendProgress'),
        onReceiveProgress: any<ProgressCallback?>(named: 'onReceiveProgress'),
      ),
    ).thenAnswer(
      (_) async => okJson(<String, dynamic>{
        'success': true,
        'appointment': appointmentJson(),
      }),
    );

    final Appointment a = await repo.bookAppointment(
      const BookAppointmentDto(
        slotId: 's-1',
        appointmentType: 'doctor',
        reasonForVisit: 'فحص',
      ),
    );
    expect(a.id, 'a-1');
  });

  test('cancelAppointment PATCHes with the reason and surfaces 4xx',
      () async {
    when(
      () => dio.patch<dynamic>(
        '/patient/appointments/a-1/cancel',
        data: any<Object?>(named: 'data'),
        options: any<Options?>(named: 'options'),
        queryParameters: any<Map<String, dynamic>?>(named: 'queryParameters'),
        cancelToken: any<CancelToken?>(named: 'cancelToken'),
        onSendProgress: any<ProgressCallback?>(named: 'onSendProgress'),
        onReceiveProgress: any<ProgressCallback?>(named: 'onReceiveProgress'),
      ),
    ).thenAnswer(
      (_) async => okJson(<String, dynamic>{
        'success': true,
        'appointment': appointmentJson(status: 'cancelled'),
      }),
    );

    final Appointment a = await repo.cancelAppointment(
      'a-1',
      cancellationReason: 'patient_request',
    );
    expect(a.status, 'cancelled');

    // Error path — 500 should surface as ApiException.server.
    when(
      () => dio.patch<dynamic>(
        '/patient/appointments/a-2/cancel',
        data: any<Object?>(named: 'data'),
        options: any<Options?>(named: 'options'),
        queryParameters: any<Map<String, dynamic>?>(named: 'queryParameters'),
        cancelToken: any<CancelToken?>(named: 'cancelToken'),
        onSendProgress: any<ProgressCallback?>(named: 'onSendProgress'),
        onReceiveProgress: any<ProgressCallback?>(named: 'onReceiveProgress'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/patient/appointments/a-2/cancel'),
        response: Response<Map<String, dynamic>>(
          statusCode: 500,
          data: <String, dynamic>{'message': 'boom'},
          requestOptions:
              RequestOptions(path: '/patient/appointments/a-2/cancel'),
        ),
        type: DioExceptionType.badResponse,
      ),
    );

    await expectLater(
      repo.cancelAppointment('a-2', cancellationReason: 'other'),
      throwsA(isA<ServerApiException>()),
    );
  });
}
