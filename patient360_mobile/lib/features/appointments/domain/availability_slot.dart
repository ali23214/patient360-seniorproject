import 'package:flutter/foundation.dart';

/// Mirrors the `availability_slots` collection. The patient-facing API
/// sometimes collapses several fields into a single `isBooked` flag and
/// renames `date` → `slotDate`; we tolerate both shapes so the domain layer
/// doesn't drift when the backend is updated.
@immutable
class AvailabilitySlot {
  const AvailabilitySlot({
    required this.id,
    required this.date,
    required this.startTime,
    required this.endTime,
    this.maxBookings = 1,
    this.currentBookings = 0,
    this.isAvailable = true,
    this.status = 'open',
    this.duration,
  });

  factory AvailabilitySlot.fromJson(Map<String, dynamic> json) {
    final String id = (json['_id'] ?? json['id']).toString();
    final String rawDate =
        (json['date'] ?? json['slotDate']) as String;

    // Two input shapes: DB-native (maxBookings/currentBookings/isAvailable)
    // and API-simplified (isBooked). Coerce to DB-native.
    final bool? apiIsBooked = json['isBooked'] as bool?;
    final int maxBookings = (json['maxBookings'] as num?)?.toInt() ?? 1;
    final int currentBookings =
        (json['currentBookings'] as num?)?.toInt() ??
            (apiIsBooked == true ? maxBookings : 0);
    final bool isAvailable = (json['isAvailable'] as bool?) ?? true;

    return AvailabilitySlot(
      id: id,
      date: DateTime.parse(rawDate),
      startTime: (json['startTime'] as String?) ?? '',
      endTime: (json['endTime'] as String?) ?? '',
      maxBookings: maxBookings,
      currentBookings: currentBookings,
      isAvailable: isAvailable,
      status: (json['status'] as String?) ?? 'open',
      duration: (json['duration'] as num?)?.toInt(),
    );
  }

  final String id;
  final DateTime date;
  final String startTime;
  final String endTime;
  final int maxBookings;
  final int currentBookings;
  final bool isAvailable;
  final String status;
  final int? duration;

  bool get isBooked =>
      currentBookings >= maxBookings || !isAvailable;
}
