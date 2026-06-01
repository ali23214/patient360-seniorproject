import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:patient360_mobile/core/network/api_exception.dart';
import 'package:patient360_mobile/core/storage/secure_storage.dart';
import 'package:patient360_mobile/features/auth/data/auth_repository.dart';

class _MockDio extends Mock implements Dio {}

class _MockSecureStorage extends Mock implements SecureStorage {}

class _FakeRequestOptions extends Fake implements RequestOptions {}

void main() {
  setUpAll(() {
    registerFallbackValue(_FakeRequestOptions());
  });

  late _MockDio dio;
  late _MockSecureStorage storage;
  late AuthRepository repo;

  setUp(() {
    dio = _MockDio();
    storage = _MockSecureStorage();
    repo = AuthRepository(dio: dio, storage: storage);

    // By default, writes / deletes succeed silently.
    when(() => storage.write(any(), any())).thenAnswer((_) async {});
    when(() => storage.delete(any())).thenAnswer((_) async {});
    when(() => storage.clearAuth()).thenAnswer((_) async {});
  });

  Response<Map<String, dynamic>> jsonResponse(
    Map<String, dynamic> body, {
    int status = 200,
    String path = '/',
  }) {
    return Response<Map<String, dynamic>>(
      data: body,
      statusCode: status,
      requestOptions: RequestOptions(path: path),
    );
  }

  Map<String, dynamic> loginBody({required List<String> roles}) {
    return <String, dynamic>{
      'success': true,
      'token': 'jwt.test.token',
      'user': <String, dynamic>{
        'accountId': 'acc-1',
        'email': 'patient@example.com',
        'roles': roles,
        'isActive': true,
        'personId': 'person-1',
      },
    };
  }

  test('login rejects accounts without the "patient" role', () async {
    when(
      () => dio.post<dynamic>(
        '/auth/login',
        data: any<Object?>(named: 'data'),
        options: any<Options?>(named: 'options'),
        queryParameters: any<Map<String, dynamic>?>(named: 'queryParameters'),
        cancelToken: any<CancelToken?>(named: 'cancelToken'),
        onSendProgress: any<ProgressCallback?>(named: 'onSendProgress'),
        onReceiveProgress: any<ProgressCallback?>(named: 'onReceiveProgress'),
      ),
    ).thenAnswer(
      (_) async => jsonResponse(loginBody(roles: <String>['doctor'])),
    );

    await expectLater(
      repo.login(email: 'doc@example.com', password: 'Passw0rd!'),
      throwsA(isA<UnauthorizedApiException>()),
    );

    // Must never have cached a JWT for a non-patient account.
    verifyNever(() => storage.write(SecureStorageKeys.jwt, any()));
  });

  test('getCurrentSession returns null when no JWT is stored', () async {
    when(() => storage.read(SecureStorageKeys.jwt))
        .thenAnswer((_) async => null);

    final session = await repo.getCurrentSession();

    expect(session, isNull);
    verifyNever(() => dio.get<dynamic>(any()));
  });

  test('login surfaces a 401 response as ApiException.unauthorized', () async {
    final DioException err = DioException(
      requestOptions: RequestOptions(path: '/auth/login'),
      response: Response<Map<String, dynamic>>(
        statusCode: 401,
        data: <String, dynamic>{'message': 'بيانات الاعتماد غير صحيحة'},
        requestOptions: RequestOptions(path: '/auth/login'),
      ),
      type: DioExceptionType.badResponse,
    );

    when(
      () => dio.post<dynamic>(
        '/auth/login',
        data: any<Object?>(named: 'data'),
        options: any<Options?>(named: 'options'),
        queryParameters: any<Map<String, dynamic>?>(named: 'queryParameters'),
        cancelToken: any<CancelToken?>(named: 'cancelToken'),
        onSendProgress: any<ProgressCallback?>(named: 'onSendProgress'),
        onReceiveProgress: any<ProgressCallback?>(named: 'onReceiveProgress'),
      ),
    ).thenThrow(err);

    await expectLater(
      repo.login(email: 'bad@example.com', password: 'wrong'),
      throwsA(isA<UnauthorizedApiException>()),
    );
  });
}
