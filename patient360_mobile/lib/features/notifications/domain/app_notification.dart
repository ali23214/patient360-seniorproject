import 'package:flutter/foundation.dart';

/// One row in the `notifications` collection. Renamed to [AppNotification]
/// to avoid colliding with `flutter_local_notifications` plugin classes.
///
/// JSON parsing is defensive: malformed timestamps fall back to `now`,
/// missing IDs become an empty string, and unknown enum values are mapped
/// to sensible defaults. The repository skips rows that throw — this
/// fromJson is intentionally hard to make throw.
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
    // ── Bulletproof date parsers ────────────────────────────────────────
    DateTime asDate(Object? v, {DateTime? fallback}) {
      if (v is String && v.isNotEmpty) {
        try {
          return DateTime.parse(v);
        } catch (_) {
          // Fall through to fallback
        }
      }
      return fallback ?? DateTime.now();
    }

    DateTime? asDateOrNull(Object? v) {
      if (v is String && v.isNotEmpty) {
        try {
          return DateTime.parse(v);
        } catch (_) {
          return null;
        }
      }
      return null;
    }

    // ── Channel list parser ─────────────────────────────────────────────
    final List<String> channels =
        (json['channels'] as List<dynamic>?)
            ?.map((dynamic e) => e.toString())
            .toList() ??
        const <String>[];

    // ── ID resolver — backend uses _id, some clients sent id ───────────
    final dynamic rawId = json['_id'] ?? json['id'] ?? '';

    // ── relatedId / relatedType normalizer — ObjectId can come back as
    // an object with $oid or as a plain string. We just toString it.
    String? optionalString(Object? v) {
      if (v == null) return null;
      if (v is String) return v.isEmpty ? null : v;
      if (v is Map && v['\$oid'] is String) return v['\$oid'] as String;
      return v.toString();
    }

    return AppNotification(
      id: rawId.toString(),
      recipientId: optionalString(json['recipientId']) ?? '',
      recipientType: (json['recipientType'] as String?) ?? 'patient',
      type: (json['type'] as String?) ?? 'general',
      title: (json['title'] as String?) ?? '',
      message: (json['message'] as String?) ?? '',
      status: (json['status'] as String?) ?? 'pending',
      priority: (json['priority'] as String?) ?? 'medium',
      channels: channels,
      relatedId: optionalString(json['relatedId']),
      relatedType: (json['relatedType'] as String?),
      sentAt: asDateOrNull(json['sentAt']),
      readAt: asDateOrNull(json['readAt']),
      expiresAt: asDateOrNull(json['expiresAt']),
      // createdAt is the timestamp shown in the UI — never null
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

  /// Returns true if the notification has any displayable content. Used by
  /// the screen to skip totally empty rows that would render as blank cards.
  bool get hasContent => title.isNotEmpty || message.isNotEmpty;

  AppNotification copyWith({String? status, DateTime? readAt}) {
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
