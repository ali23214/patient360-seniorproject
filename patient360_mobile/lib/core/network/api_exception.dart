import 'package:dio/dio.dart';

/// Unified error shape surfaced to feature code.
///
/// Implemented as a native Dart 3 sealed class so callers get exhaustive
/// pattern matching. Construct transport-layer errors via
/// [ApiException.fromDioError]; everywhere else, hand-pick a subtype.
sealed class ApiException implements Exception {
  const ApiException();

  const factory ApiException.network() = NetworkApiException;
  const factory ApiException.timeout() = TimeoutApiException;
  const factory ApiException.unauthorized({String? message}) =
      UnauthorizedApiException;
  const factory ApiException.server(int status, String? message) =
      ServerApiException;
  const factory ApiException.unknown(Object error) = UnknownApiException;

  factory ApiException.fromDioError(DioException error) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return const ApiException.timeout();
      case DioExceptionType.connectionError:
      case DioExceptionType.badCertificate:
        return const ApiException.network();
      case DioExceptionType.cancel:
      case DioExceptionType.unknown:
        return ApiException.unknown(error);
      case DioExceptionType.badResponse:
        final int status = error.response?.statusCode ?? 0;
        final String? message = _extractMessage(error.response?.data);
        if (status == 401) {
          return ApiException.unauthorized(message: message);
        }
        return ApiException.server(status, message);
    }
  }

  /// Arabic message suitable for display in SnackBars / dialogs.
  String toDisplayMessage() {
    return switch (this) {
      NetworkApiException() => 'تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت.',
      TimeoutApiException() => 'انتهت مهلة الاتصال بالخادم.',
      UnauthorizedApiException(:final String? message) =>
        message ?? 'انتهت صلاحية الجلسة. الرجاء تسجيل الدخول مجدداً.',
      ServerApiException(:final int status, :final String? message) =>
        message ?? 'خطأ في الخادم ($status).',
      UnknownApiException() => 'حدث خطأ غير متوقع.',
    };
  }
}

final class NetworkApiException extends ApiException {
  const NetworkApiException();
}

final class TimeoutApiException extends ApiException {
  const TimeoutApiException();
}

final class UnauthorizedApiException extends ApiException {
  const UnauthorizedApiException({this.message});
  final String? message;
}

final class ServerApiException extends ApiException {
  const ServerApiException(this.status, this.message);
  final int status;
  final String? message;
}

final class UnknownApiException extends ApiException {
  const UnknownApiException(this.error);
  final Object error;
}

String? _extractMessage(Object? data) {
  if (data is Map<String, dynamic>) {
    final Object? raw = data['message'];
    if (raw is String && raw.isNotEmpty) return raw;
  }
  return null;
}
