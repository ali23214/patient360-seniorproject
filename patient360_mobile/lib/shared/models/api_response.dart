import 'package:flutter/foundation.dart';

/// Envelope matching the `{ success, message, data, errors }` shape returned
/// by the Patient 360 backend.
///
/// The generic [T] payload is parsed by a caller-supplied [fromJsonT]
/// function (same pattern as json_serializable's `genericArgumentFactories`).
@immutable
class ApiResponse<T> {
  const ApiResponse({
    required this.success,
    this.message,
    this.data,
    this.errors,
  });

  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Object?) fromJsonT,
  ) {
    return ApiResponse<T>(
      success: (json['success'] as bool?) ?? false,
      message: json['message'] as String?,
      data: json['data'] == null ? null : fromJsonT(json['data']),
      errors: (json['errors'] as List<dynamic>?)
          ?.map((dynamic e) => e.toString())
          .toList(),
    );
  }

  final bool success;
  final String? message;
  final T? data;
  final List<String>? errors;
}
