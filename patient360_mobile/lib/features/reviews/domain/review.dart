import 'package:flutter/foundation.dart';

/// One row in the `reviews` collection. Patient → care provider rating.
@immutable
class Review {
  const Review({
    required this.id,
    required this.rating,
    required this.status,
    required this.isAnonymous,
    required this.createdAt,
    this.reviewerPersonId,
    this.reviewerChildId,
    this.doctorId,
    this.dentistId,
    this.laboratoryId,
    this.pharmacyId,
    this.hospitalId,
    this.reviewText,
    this.adminNote,
  });

  factory Review.fromJson(Map<String, dynamic> json) {
    DateTime asDate(Object? v, {DateTime? fallback}) {
      if (v is String && v.isNotEmpty) return DateTime.parse(v);
      return fallback ?? DateTime.fromMillisecondsSinceEpoch(0);
    }

    return Review(
      id: (json['_id'] ?? json['id']).toString(),
      reviewerPersonId: json['reviewerPersonId'] as String?,
      reviewerChildId: json['reviewerChildId'] as String?,
      doctorId: json['doctorId'] as String?,
      dentistId: json['dentistId'] as String?,
      laboratoryId: json['laboratoryId'] as String?,
      pharmacyId: json['pharmacyId'] as String?,
      hospitalId: json['hospitalId'] as String?,
      rating: (json['rating'] as num?)?.toInt() ?? 0,
      reviewText: json['reviewText'] as String?,
      status: (json['status'] as String?) ?? 'pending',
      isAnonymous: (json['isAnonymous'] as bool?) ?? false,
      adminNote: json['adminNote'] as String?,
      createdAt: asDate(json['createdAt'], fallback: DateTime.now()),
    );
  }

  final String id;
  final String? reviewerPersonId;
  final String? reviewerChildId;
  final String? doctorId;
  final String? dentistId;
  final String? laboratoryId;
  final String? pharmacyId;
  final String? hospitalId;

  /// 1..5. Validated client-side at submit time; the schema enforces the
  /// same range with a JSON Schema `minimum`/`maximum`.
  final int rating;
  final String? reviewText;

  /// `pending | approved | rejected | flagged`.
  final String status;
  final bool isAnonymous;
  final String? adminNote;
  final DateTime createdAt;

  /// Resolves which target collection the review points at + its id. Only
  /// one of the five reference fields is populated per row.
  ReviewTargetRef? get target {
    if (doctorId != null) {
      return ReviewTargetRef(type: ReviewTargetType.doctor, id: doctorId!);
    }
    if (dentistId != null) {
      return ReviewTargetRef(type: ReviewTargetType.dentist, id: dentistId!);
    }
    if (laboratoryId != null) {
      return ReviewTargetRef(
          type: ReviewTargetType.laboratory, id: laboratoryId!);
    }
    if (pharmacyId != null) {
      return ReviewTargetRef(type: ReviewTargetType.pharmacy, id: pharmacyId!);
    }
    if (hospitalId != null) {
      return ReviewTargetRef(type: ReviewTargetType.hospital, id: hospitalId!);
    }
    return null;
  }
}

enum ReviewTargetType { doctor, dentist, laboratory, pharmacy, hospital }

extension ReviewTargetTypeInfo on ReviewTargetType {
  String get arabicLabel => switch (this) {
        ReviewTargetType.doctor => 'طبيب',
        ReviewTargetType.dentist => 'طبيب أسنان',
        ReviewTargetType.laboratory => 'مختبر',
        ReviewTargetType.pharmacy => 'صيدلية',
        ReviewTargetType.hospital => 'مستشفى',
      };

  /// JSON field name on the request body — matches the schema.
  String get fieldName => switch (this) {
        ReviewTargetType.doctor => 'doctorId',
        ReviewTargetType.dentist => 'dentistId',
        ReviewTargetType.laboratory => 'laboratoryId',
        ReviewTargetType.pharmacy => 'pharmacyId',
        ReviewTargetType.hospital => 'hospitalId',
      };
}

@immutable
class ReviewTargetRef {
  const ReviewTargetRef({required this.type, required this.id});
  final ReviewTargetType type;
  final String id;
}

/// Outgoing payload assembled by [ReviewSubmitSheet] and sent through
/// [ReviewsRepository.submitReview].
@immutable
class ReviewSubmitDto {
  const ReviewSubmitDto({
    required this.targetType,
    required this.targetId,
    required this.rating,
    required this.isAnonymous,
    this.reviewText,
  });

  final ReviewTargetType targetType;
  final String targetId;
  final int rating;
  final bool isAnonymous;
  final String? reviewText;

  Map<String, dynamic> toJson() => <String, dynamic>{
        targetType.fieldName: targetId,
        'rating': rating,
        'isAnonymous': isAnonymous,
        if (reviewText != null && reviewText!.isNotEmpty)
          'reviewText': reviewText,
      };
}
