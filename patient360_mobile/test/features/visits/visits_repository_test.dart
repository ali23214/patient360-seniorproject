import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:patient360_mobile/core/network/api_exception.dart';
import 'package:patient360_mobile/features/visits/data/visits_repository.dart';
import 'package:patient360_mobile/features/visits/domain/visit.dart';

class _MockDio extends Mock implements Dio {}

class _FakeRequestOptions extends Fake implements RequestOptions {}

void main() {
  setUpAll(() {
    registerFallbackValue(_FakeRequestOptions());
  });

  late _MockDio dio;
  late VisitsRepository repo;

  setUp(() {
    dio = _MockDio();
    repo = VisitsRepository(dio);
  });

  Map<String, dynamic> visitJson({
    required String id,
    required String date,
    String visitType = 'regular',
    String status = 'completed',
    String? diagnosis,
  }) {
    return <String, dynamic>{
      '_id': id,
      'visitType': visitType,
      'visitDate': date,
      'status': status,
      'chiefComplaint': 'كحة وحرارة',
      'paymentStatus': 'paid',
      'createdAt': date,
      if (diagnosis != null) 'diagnosis': diagnosis,
    };
  }

  test('getVisits returns the list sorted by visitDate descending',
      () async {
    when(
      () => dio.get<dynamic>(
        '/patient/visits',
        queryParameters:
            any<Map<String, dynamic>?>(named: 'queryParameters'),
        options: any<Options?>(named: 'options'),
        cancelToken: any<CancelToken?>(named: 'cancelToken'),
        onReceiveProgress:
            any<ProgressCallback?>(named: 'onReceiveProgress'),
      ),
    ).thenAnswer(
      (_) async => Response<Map<String, dynamic>>(
        data: <String, dynamic>{
          'success': true,
          'count': 3,
          'visits': <Map<String, dynamic>>[
            visitJson(id: 'v-mid', date: '2026-03-01T00:00:00.000Z'),
            visitJson(id: 'v-newest', date: '2026-04-15T00:00:00.000Z'),
            visitJson(id: 'v-oldest', date: '2026-01-10T00:00:00.000Z'),
          ],
        },
        statusCode: 200,
        requestOptions: RequestOptions(path: '/patient/visits'),
      ),
    );

    final List<Visit> result = await repo.getVisits();
    expect(result.map((Visit v) => v.id).toList(),
        <String>['v-newest', 'v-mid', 'v-oldest']);
  });

  test('getVisits surfaces 401 as ApiException.unauthorized', () async {
    when(
      () => dio.get<dynamic>(
        '/patient/visits',
        queryParameters:
            any<Map<String, dynamic>?>(named: 'queryParameters'),
        options: any<Options?>(named: 'options'),
        cancelToken: any<CancelToken?>(named: 'cancelToken'),
        onReceiveProgress:
            any<ProgressCallback?>(named: 'onReceiveProgress'),
      ),
    ).thenThrow(
      DioException(
        requestOptions: RequestOptions(path: '/patient/visits'),
        response: Response<Map<String, dynamic>>(
          statusCode: 401,
          data: <String, dynamic>{'message': 'expired'},
          requestOptions: RequestOptions(path: '/patient/visits'),
        ),
        type: DioExceptionType.badResponse,
      ),
    );

    await expectLater(
      repo.getVisits(),
      throwsA(isA<UnauthorizedApiException>()),
    );
  });
}
