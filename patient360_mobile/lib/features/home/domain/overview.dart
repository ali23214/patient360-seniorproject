import 'package:flutter/foundation.dart';

import 'recent_activity.dart';

/// Aggregate counters + recent activity feed backing the home dashboard.
///
/// Mirrors the response shape of `GET /api/patient/overview` (see
/// frontend/src/services/api.js `patientAPI.getDashboardOverview`).
@immutable
class Overview {
  const Overview({
    this.upcomingAppointments = 0,
    this.activePrescriptions = 0,
    this.pendingLabResults = 0,
    this.unreadNotifications = 0,
    this.recentActivity = const <RecentActivity>[],
  });

  factory Overview.fromJson(Map<String, dynamic> json) {
    int asInt(Object? v) => (v as num?)?.toInt() ?? 0;

    return Overview(
      upcomingAppointments: asInt(json['upcomingAppointments']),
      activePrescriptions: asInt(json['activePrescriptions']),
      pendingLabResults: asInt(json['pendingLabResults']),
      unreadNotifications: asInt(json['unreadNotifications']),
      recentActivity: (json['recentActivity'] as List<dynamic>?)
              ?.map(
                (dynamic e) => RecentActivity.fromJson(
                  (e as Map<dynamic, dynamic>).cast<String, dynamic>(),
                ),
              )
              .toList() ??
          const <RecentActivity>[],
    );
  }

  static const Overview empty = Overview();

  final int upcomingAppointments;
  final int activePrescriptions;
  final int pendingLabResults;
  final int unreadNotifications;
  final List<RecentActivity> recentActivity;
}
