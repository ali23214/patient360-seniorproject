import 'package:flutter/foundation.dart';

import 'time_of_day_dto.dart';

/// Local-only reminder configuration for a single medication on a single
/// prescription. Persisted to shared_preferences and used by
/// [NotificationScheduler] to plan a sliding 7-day window of OS notifications.
@immutable
class ReminderSchedule {
  const ReminderSchedule({
    required this.id,
    required this.prescriptionId,
    required this.medicationIndex,
    required this.medicationName,
    required this.dosage,
    required this.times,
    required this.startDate,
    required this.endDate,
    required this.isEnabled,
    required this.createdAt,
    required this.updatedAt,
  });

  factory ReminderSchedule.fromJson(Map<String, dynamic> json) {
    final List<TimeOfDayDto> times =
        (json['times'] as List<dynamic>?)
                ?.map(
                  (dynamic e) => TimeOfDayDto.fromJson(
                    (e as Map<dynamic, dynamic>).cast<String, dynamic>(),
                  ),
                )
                .toList() ??
            const <TimeOfDayDto>[];
    return ReminderSchedule(
      id: json['id'] as String,
      prescriptionId: json['prescriptionId'] as String,
      medicationIndex: (json['medicationIndex'] as num).toInt(),
      medicationName: (json['medicationName'] as String?) ?? '',
      dosage: (json['dosage'] as String?) ?? '',
      times: times,
      startDate: DateTime.parse(json['startDate'] as String),
      endDate: DateTime.parse(json['endDate'] as String),
      isEnabled: (json['isEnabled'] as bool?) ?? true,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  final String id;
  final String prescriptionId;
  final int medicationIndex;
  final String medicationName;
  final String dosage;
  final List<TimeOfDayDto> times;
  final DateTime startDate;

  /// Exclusive — schedules dose firings up to (but not on) `endDate`.
  final DateTime endDate;
  final bool isEnabled;
  final DateTime createdAt;
  final DateTime updatedAt;

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'prescriptionId': prescriptionId,
        'medicationIndex': medicationIndex,
        'medicationName': medicationName,
        'dosage': dosage,
        'times': times
            .map((TimeOfDayDto t) => t.toJson())
            .toList(growable: false),
        'startDate': startDate.toIso8601String(),
        'endDate': endDate.toIso8601String(),
        'isEnabled': isEnabled,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
      };

  ReminderSchedule copyWith({
    List<TimeOfDayDto>? times,
    DateTime? startDate,
    DateTime? endDate,
    bool? isEnabled,
    DateTime? updatedAt,
  }) {
    return ReminderSchedule(
      id: id,
      prescriptionId: prescriptionId,
      medicationIndex: medicationIndex,
      medicationName: medicationName,
      dosage: dosage,
      times: times ?? this.times,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      isEnabled: isEnabled ?? this.isEnabled,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}
