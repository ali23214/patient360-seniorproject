import 'package:flutter/foundation.dart';

/// Enumerates the discriminator values for the recent-activity feed, matching
/// the strings the backend emits under `recentActivity[*].type`.
enum RecentActivityType {
  appointment,
  visit,
  prescription,
  labTest,
  notification,
  unknown;

  static RecentActivityType fromJson(String? raw) {
    return switch (raw) {
      'appointment' => appointment,
      'visit' => visit,
      'prescription' => prescription,
      'lab_test' => labTest,
      'notification' => notification,
      _ => unknown,
    };
  }
}

@immutable
class RecentActivity {
  const RecentActivity({
    required this.id,
    required this.type,
    required this.occurredAt,
    this.title,
    this.subtitle,
    this.relatedId,
  });

  factory RecentActivity.fromJson(Map<String, dynamic> json) {
    final String id =
        (json['_id'] ?? json['id'] ?? '').toString();
    return RecentActivity(
      id: id,
      type: RecentActivityType.fromJson(json['type'] as String?),
      title: json['title'] as String?,
      subtitle: json['subtitle'] as String?,
      occurredAt: DateTime.parse(json['occurredAt'] as String),
      relatedId: json['relatedId'] as String?,
    );
  }

  final String id;
  final RecentActivityType type;
  final String? title;
  final String? subtitle;
  final DateTime occurredAt;
  final String? relatedId;
}
