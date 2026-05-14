import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/utils/logger.dart';
import '../domain/review.dart';

class ReviewsRepository {
  const ReviewsRepository(this._dio);

  final Dio _dio;

  /// GET `/api/patient/reviews`. Backend scopes by JWT.
  Future<List<Review>> getMyReviews() async {
    try {
      final Response<dynamic> res =
          await _dio.get<dynamic>('/patient/reviews');
      final Map<String, dynamic> body =
          (res.data as Map<dynamic, dynamic>).cast<String, dynamic>();
      final List<dynamic> raw =
          (body['reviews'] as List<dynamic>?) ?? const <dynamic>[];
      return raw
          .whereType<Map<dynamic, dynamic>>()
          .map((Map<dynamic, dynamic> m) => m.cast<String, dynamic>())
          .map(Review.fromJson)
          .toList()
        ..sort((Review a, Review b) =>
            b.createdAt.compareTo(a.createdAt));
    } on DioException catch (e, st) {
      appLogger.e('getMyReviews failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('getMyReviews unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }

  /// POST `/api/patient/reviews`. Returns the freshly inserted [Review].
  Future<Review> submitReview(ReviewSubmitDto dto) async {
    try {
      final Response<dynamic> res = await _dio.post<dynamic>(
        '/patient/reviews',
        data: dto.toJson(),
      );
      final Map<String, dynamic> body =
          (res.data as Map<dynamic, dynamic>).cast<String, dynamic>();
      final Object? rawReview = body['review'] ?? body['data'];
      final Map<String, dynamic> reviewJson = rawReview is Map
          ? rawReview.cast<String, dynamic>()
          : body;
      return Review.fromJson(reviewJson);
    } on DioException catch (e, st) {
      appLogger.e('submitReview failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('submitReview unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }
}

final Provider<ReviewsRepository> reviewsRepositoryProvider =
    Provider<ReviewsRepository>(
  (Ref ref) => ReviewsRepository(ref.watch(dioProvider)),
);
