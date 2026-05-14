import 'package:flutter/foundation.dart';

/// One row in the `notifications` collection. Renamed to [AppNotification]
/// to avoid colliding with `flutter_local_notifications` plugin classes.
@immutable
class AppNotification {
  const AppNotification({
    required this.id,
    required this.recipientId,
    required this.recipientType,
    required this.type,
    required this.title,
    required this.message,
    required this.status,
    required this.priority,
    required this.channels,
    required this.createdAt,
    this.relatedId,
    this.relatedType,
    this.sentAt,
    this.readAt,
    this.expiresAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    DateTime asDate(Object? v, {DateTime? fallback}) {
      if (v is String && v.isNotEmpty) return DateTime.parse(v);
      return fallback ?? DateTime.fromMillisecondsSinceEpoch(0);
    }

    DateTime? asDateOrNull(Object? v) =>
        v is String && v.isNotEmpty ? DateTime.parse(v) : null;

    final List<String> channels = (json['channels'] as List<dynamic>?)
            ?.map((dynamic e) => e.toString())
            .toList() ??
        const <String>[];

    return AppNotification(
      id: (json['_id'] ?? json['id']).toString(),
      recipientId: (json['recipientId'] as String?) ?? '',
      recipientType: (json['recipientType'] as String?) ?? '',
      type: (json['type'] as String?) ?? 'system_announcement',
      title: (json['title'] as String?) ?? '',
      message: (json['message'] as String?) ?? '',
      status: (json['status'] as String?) ?? 'pending',
      priority: (json['priority'] as String?) ?? 'medium',
      channels: channels,
      relatedId: json['relatedId'] as String?,
      relatedType: json['relatedType'] as String?,
      sentAt: asDateOrNull(json['sentAt']),
      readAt: asDateOrNull(json['readAt']),
      expiresAt: asDateOrNull(json['expiresAt']),
      createdAt: asDate(json['createdAt'], fallback: DateTime.now()),
    );
  }

  final String id;
  final String recipientId;
  final String recipientType;

  /// One of 14 type strings — see [NotificationTypeMeta.metaFor].
  final String type;
  final String title;
  final String message;

  /// `pending | sent | delivered | read | failed`. The patient flow only
  /// distinguishes `read` vs everything else.
  final String status;
  final String priority;
  final List<String> channels;
  final String? relatedId;
  final String? relatedType;
  final DateTime? sentAt;
  final DateTime? readAt;
  final DateTime? expiresAt;
  final DateTime createdAt;

  bool get isRead => status == 'read' || readAt != null;

  AppNotification copyWith({
    String? status,
    DateTime? readAt,
  }) {
    return AppNotification(
      id: id,
      recipientId: recipientId,
      recipientType: recipientType,
      type: type,
      title: title,
      message: message,
      status: status ?? this.status,
      priority: priority,
      channels: channels,
      relatedId: relatedId,
      relatedType: relatedType,
      sentAt: sentAt,
      readAt: readAt ?? this.readAt,
      expiresAt: expiresAt,
      createdAt: createdAt,
    );
  }
}
