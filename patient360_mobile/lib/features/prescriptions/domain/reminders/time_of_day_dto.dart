import 'package:flutter/foundation.dart';

/// Plain-Dart 24-hour time-of-day, JSON-friendly. Used inside
/// [ReminderSchedule.times].
@immutable
class TimeOfDayDto implements Comparable<TimeOfDayDto> {
  const TimeOfDayDto({required this.hour, required this.minute})
      : assert(hour >= 0 && hour < 24, 'hour 0..23'),
        assert(minute >= 0 && minute < 60, 'minute 0..59');

  factory TimeOfDayDto.fromJson(Map<String, dynamic> json) {
    return TimeOfDayDto(
      hour: (json['hour'] as num).toInt(),
      minute: (json['minute'] as num).toInt(),
    );
  }

  /// Parses an "HH:MM" string. Throws [FormatException] on bad input.
  factory TimeOfDayDto.fromLabel(String label) {
    final List<String> parts = label.split(':');
    if (parts.length != 2) {
      throw FormatException('expected HH:MM, got "$label"');
    }
    return TimeOfDayDto(
      hour: int.parse(parts[0]),
      minute: int.parse(parts[1]),
    );
  }

  final int hour;
  final int minute;

  String get label =>
      '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';

  Map<String, dynamic> toJson() => <String, dynamic>{
        'hour': hour,
        'minute': minute,
      };

  /// Total minutes from midnight — useful for sorting and "next dose"
  /// calculations.
  int get minutesFromMidnight => hour * 60 + minute;

  @override
  int compareTo(TimeOfDayDto other) =>
      minutesFromMidnight.compareTo(other.minutesFromMidnight);

  @override
  bool operator ==(Object other) =>
      other is TimeOfDayDto &&
      other.hour == hour &&
      other.minute == minute;

  @override
  int get hashCode => Object.hash(hour, minute);
}
