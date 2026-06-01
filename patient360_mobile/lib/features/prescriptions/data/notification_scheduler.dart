import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../../../core/utils/logger.dart';
import '../domain/reminders/reminder_schedule.dart';

/// Notification channel + iOS soft cap. Single source of truth so other
/// surfaces (deep-link router, settings page) can reference these without
/// re-deriving them.
class NotificationConstants {
  const NotificationConstants._();
  static const String channelId = 'p360_meds';
  static const String channelName = 'تذكيرات الأدوية';
  static const String channelDescription =
      'إشعارات تذكير بأوقات تناول الأدوية الموصوفة.';
  static const int iosPendingSoftCap = 60;
}

/// Dispatched on the global pendingDeepLink stream when a notification tap
/// fires while the app is in foreground / resumes — see
/// [NotificationScheduler.deepLinkStream].
@immutable
class ReminderDeepLink {
  const ReminderDeepLink({
    required this.scheduleId,
    required this.medicationIndex,
    required this.scheduledAt,
  });
  final String scheduleId;
  final int medicationIndex;
  final DateTime scheduledAt;
}

/// Owns the OS-level scheduling of medication reminders.
///
/// Designed to be a no-op when notification permission is denied: every
/// public method short-circuits with a logged warning rather than throwing.
/// Patient flow continues even on permission-denied devices.
///
/// ── Android 14 (API 34) exact alarm handling ────────────────────────────
/// As of Android 14, `SCHEDULE_EXACT_ALARM` is a runtime-protected
/// permission. Declaring it in AndroidManifest no longer grants it — the
/// user must explicitly enable "Alarms & reminders" for the app in
/// Settings. We therefore:
///   1. probe `canScheduleExactAlarms` at startup,
///   2. fall back silently to `inexactAllowWhileIdle` when exact alarms
///      are unavailable so the notification still fires (±10 min late),
///   3. expose [requestExactAlarmPermission] so the UI can prompt the
///      user to flip the toggle for precise timing.
class NotificationScheduler {
  NotificationScheduler({FlutterLocalNotificationsPlugin? plugin})
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  final StreamController<ReminderDeepLink> _deepLinkController =
      StreamController<ReminderDeepLink>.broadcast();

  bool _initialized = false;
  bool _canScheduleExact = true; // optimistic; verified in initialize()

  /// Listen for foreground notification taps and re-emitted background taps.
  Stream<ReminderDeepLink> get deepLinkStream => _deepLinkController.stream;

  /// Whether the OS will accept exact-time scheduling. False on Android 14+
  /// devices where the user hasn't enabled "Alarms & reminders". When
  /// false, scheduled notifications still fire — just up to 10 minutes
  /// late due to Android's doze-mode bucketing.
  bool get canScheduleExact => _canScheduleExact;

  // ═══════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════════════════════

  /// Idempotent — safe to call from `main()` and again from tests.
  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    // Tz database + Damascus location resolution.
    tzdata.initializeTimeZones();
    try {
      final String name = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(name));
    } catch (e, st) {
      // Falls through to UTC if the device timezone is unreachable. Logged
      // so we can spot misconfigured devices in the field.
      appLogger.w('timezone resolve failed', error: e, stackTrace: st);
    }

    const AndroidInitializationSettings androidInit =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const DarwinInitializationSettings iosInit = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    const InitializationSettings initSettings = InitializationSettings(
      android: androidInit,
      iOS: iosInit,
    );

    await _plugin.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationResponse,
    );

    // Create the Android channel up-front so importance is stable across
    // updates (creating later promotes to a different channel id).
    final AndroidFlutterLocalNotificationsPlugin? android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    if (android != null) {
      await android.createNotificationChannel(
        const AndroidNotificationChannel(
          NotificationConstants.channelId,
          NotificationConstants.channelName,
          description: NotificationConstants.channelDescription,
          importance: Importance.high,
        ),
      );
      // Probe Android 12+ exact-alarm permission. Returns false on
      // Android 14 unless the user has flipped the toggle in
      // Settings → Apps → Patient 360 → Alarms & reminders.
      try {
        final bool? canExact = await android.canScheduleExactNotifications();
        _canScheduleExact = canExact ?? true;
        appLogger.i(
          '🔔 exact alarm permission: '
          '${_canScheduleExact ? "granted" : "denied — using inexact fallback"}',
        );
      } catch (e) {
        // Older plugin versions / older OS — assume exact works.
        _canScheduleExact = true;
      }
    }
  }

  Future<void> dispose() async {
    await _deepLinkController.close();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Permission
  // ═══════════════════════════════════════════════════════════════════════

  /// Returns whether the OS has granted permission to post local
  /// notifications. Will show an Arabic rationale dialog before the system
  /// prompt the first time it's denied/undetermined.
  Future<bool> requestPermission(BuildContext context) async {
    final bool alreadyGranted = await _isAlreadyGranted();
    if (alreadyGranted) return true;

    if (!context.mounted) return false;
    final bool? agreed = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('السماح بالتذكيرات'),
        content: const Text(
          'سنستخدم الإشعارات لتذكيرك بمواعيد أدويتك في الوقت المحدد.',
          style: TextStyle(height: 1.5),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('ليس الآن'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('متابعة'),
          ),
        ],
      ),
    );
    if (agreed != true) return false;

    return _runOsPrompt();
  }

  /// Android 14+ only. Asks the OS to open the "Alarms & reminders"
  /// settings page so the user can enable precise scheduling. Returns
  /// `true` once the user has granted the permission.
  ///
  /// Without this permission, reminders still fire but may be late by up
  /// to 10 minutes due to Android's doze-mode bucketing.
  Future<bool> requestExactAlarmPermission() async {
    if (!Platform.isAndroid) return true;
    final AndroidFlutterLocalNotificationsPlugin? android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    if (android == null) return false;
    try {
      final bool? requested = await android.requestExactAlarmsPermission();
      if (requested ?? false) {
        _canScheduleExact = true;
        appLogger.i('🔔 exact alarm permission granted by user');
        return true;
      }
    } catch (e, st) {
      appLogger.w(
        'requestExactAlarmsPermission failed',
        error: e,
        stackTrace: st,
      );
    }
    return false;
  }

  Future<bool> _isAlreadyGranted() async {
    if (Platform.isAndroid) {
      final PermissionStatus s = await Permission.notification.status;
      return s.isGranted;
    }
    if (Platform.isIOS) {
      final IOSFlutterLocalNotificationsPlugin? ios = _plugin
          .resolvePlatformSpecificImplementation<
            IOSFlutterLocalNotificationsPlugin
          >();
      final NotificationsEnabledOptions? options = await ios
          ?.checkPermissions();
      return options?.isAlertEnabled ?? false;
    }
    return true;
  }

  Future<bool> _runOsPrompt() async {
    try {
      if (Platform.isAndroid) {
        final PermissionStatus s = await Permission.notification.request();
        return s.isGranted;
      }
      if (Platform.isIOS) {
        final IOSFlutterLocalNotificationsPlugin? ios = _plugin
            .resolvePlatformSpecificImplementation<
              IOSFlutterLocalNotificationsPlugin
            >();
        final bool? granted = await ios?.requestPermissions(
          alert: true,
          badge: true,
          sound: true,
        );
        return granted ?? false;
      }
    } catch (e, st) {
      appLogger.w('OS permission prompt failed', error: e, stackTrace: st);
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Scheduling
  // ═══════════════════════════════════════════════════════════════════════

  /// Cancels every pending notification this app owns and reschedules the
  /// next [windowDays] days from [schedules]. Called from:
  ///   - app resume (lifecycle observer)
  ///   - after the reminder setup sheet saves
  ///   - whenever the prescription list refreshes (post-dispense)
  ///
  /// Safe to call without permission — every plugin call either no-ops or
  /// is wrapped in try/catch with a logged warning. Returns the count of
  /// notifications that *actually got scheduled* (zero on permission
  /// denied). The counter increments only after `zonedSchedule` succeeds,
  /// so the log reflects real OS queue state, not optimistic attempts.
  Future<int> scheduleSlidingWindow(
    List<ReminderSchedule> schedules, {
    int windowDays = 7,
    DateTime? now,
  }) async {
    if (!_initialized) {
      appLogger.w('scheduleSlidingWindow before initialize() — silent no-op');
      return 0;
    }

    try {
      await _plugin.cancelAll();
    } catch (e, st) {
      appLogger.w('cancelAll failed', error: e, stackTrace: st);
    }

    // Pick the scheduling mode once per sweep. Exact = wakes the device at
    // the precise minute; inexact = OS may batch with other alarms,
    // typically firing within 10 min of the target. Doze + idle modes
    // make inexact way less reliable than the docs suggest, so we log
    // the choice loudly.
    final AndroidScheduleMode mode = _canScheduleExact
        ? AndroidScheduleMode.exactAllowWhileIdle
        : AndroidScheduleMode.inexactAllowWhileIdle;
    appLogger.i(
      '🔔 schedule mode: ${_canScheduleExact ? "EXACT" : "INEXACT (may fire late)"}',
    );

    final DateTime base = now ?? DateTime.now();
    int succeeded = 0;
    int failed = 0;

    for (final ReminderSchedule s in schedules) {
      if (!s.isEnabled) continue;
      for (int dayOffset = 0; dayOffset < windowDays; dayOffset++) {
        final DateTime day = DateTime(
          base.year,
          base.month,
          base.day + dayOffset,
        );
        if (day.isBefore(_dateOnly(s.startDate))) continue;
        if (!day.isBefore(_dateOnly(s.endDate))) continue;

        for (final time in s.times) {
          final DateTime when = DateTime(
            day.year,
            day.month,
            day.day,
            time.hour,
            time.minute,
          );
          if (when.isBefore(base)) continue;
          if (succeeded >= NotificationConstants.iosPendingSoftCap) {
            appLogger.w(
              '🔔 reached iOS pending cap (${NotificationConstants.iosPendingSoftCap}); truncating',
            );
            return succeeded;
          }

          final int id = deterministicNotificationId(
            s.id,
            when.toIso8601String(),
          );
          final tz.TZDateTime zoned = tz.TZDateTime.from(when, tz.local);
          final String payload = jsonEncode(<String, Object>{
            'type': 'med_reminder',
            'scheduleId': s.id,
            'prescriptionId': s.prescriptionId,
            'medicationIndex': s.medicationIndex,
            'scheduledAt': when.toIso8601String(),
          });

          try {
            await _plugin.zonedSchedule(
              id,
              'حان وقت دواء ${s.medicationName}',
              '${s.dosage} — اضغط لتسجيل الجرعة',
              zoned,
              const NotificationDetails(
                android: AndroidNotificationDetails(
                  NotificationConstants.channelId,
                  NotificationConstants.channelName,
                  channelDescription: NotificationConstants.channelDescription,
                  importance: Importance.high,
                  priority: Priority.high,
                ),
                iOS: DarwinNotificationDetails(),
              ),
              androidScheduleMode: mode,
              uiLocalNotificationDateInterpretation:
                  UILocalNotificationDateInterpretation.absoluteTime,
              payload: payload,
            );
            succeeded++;
          } on Exception catch (e, st) {
            // Most common cause on Android 14: SecurityException because
            // SCHEDULE_EXACT_ALARM was revoked between probe and schedule
            // (e.g. user toggled Alarms-and-reminders off mid-session).
            // Retry once in inexact mode so the reminder isn't lost.
            failed++;
            appLogger.w(
              '🔔 zonedSchedule failed for id=$id (mode=$mode)',
              error: e,
              stackTrace: st,
            );
            if (mode == AndroidScheduleMode.exactAllowWhileIdle) {
              try {
                await _plugin.zonedSchedule(
                  id,
                  'حان وقت دواء ${s.medicationName}',
                  '${s.dosage} — اضغط لتسجيل الجرعة',
                  zoned,
                  const NotificationDetails(
                    android: AndroidNotificationDetails(
                      NotificationConstants.channelId,
                      NotificationConstants.channelName,
                      channelDescription:
                          NotificationConstants.channelDescription,
                      importance: Importance.high,
                      priority: Priority.high,
                    ),
                    iOS: DarwinNotificationDetails(),
                  ),
                  androidScheduleMode:
                      AndroidScheduleMode.inexactAllowWhileIdle,
                  uiLocalNotificationDateInterpretation:
                      UILocalNotificationDateInterpretation.absoluteTime,
                  payload: payload,
                );
                succeeded++;
                _canScheduleExact = false; // remember for next sweep
                appLogger.i(
                  '🔔 fell back to inexact for id=$id — exact alarm denied',
                );
              } catch (e2, st2) {
                appLogger.w(
                  '🔔 inexact fallback also failed for id=$id',
                  error: e2,
                  stackTrace: st2,
                );
              }
            }
          }
        }
      }
    }

    appLogger.i(
      '🔔 schedule sweep done — $succeeded succeeded, $failed failed',
    );
    return succeeded;
  }

  /// Cancels every pending notification associated with [scheduleId].
  /// Called when the patient toggles a reminder off, or when the
  /// prescription is fully dispensed.
  Future<void> cancelBySchedule(String scheduleId) async {
    if (!_initialized) return;
    try {
      final List<PendingNotificationRequest> pending = await _plugin
          .pendingNotificationRequests();
      for (final PendingNotificationRequest p in pending) {
        if (p.payload == null) continue;
        try {
          final Map<String, dynamic> decoded =
              (jsonDecode(p.payload!) as Map<dynamic, dynamic>)
                  .cast<String, dynamic>();
          if (decoded['scheduleId'] == scheduleId) {
            await _plugin.cancel(p.id);
          }
        } catch (_) {
          /* ignore non-JSON payloads */
        }
      }
    } catch (e, st) {
      appLogger.w('cancelBySchedule failed', error: e, stackTrace: st);
    }
  }

  Future<void> cancelByPrescription(String prescriptionId) async {
    if (!_initialized) return;
    try {
      final List<PendingNotificationRequest> pending = await _plugin
          .pendingNotificationRequests();
      for (final PendingNotificationRequest p in pending) {
        if (p.payload == null) continue;
        try {
          final Map<String, dynamic> decoded =
              (jsonDecode(p.payload!) as Map<dynamic, dynamic>)
                  .cast<String, dynamic>();
          if (decoded['prescriptionId'] == prescriptionId) {
            await _plugin.cancel(p.id);
          }
        } catch (_) {
          /* ignore non-JSON payloads */
        }
      }
    } catch (e, st) {
      appLogger.w('cancelByPrescription failed', error: e, stackTrace: st);
    }
  }

  Future<void> cancelAll() async {
    if (!_initialized) return;
    try {
      await _plugin.cancelAll();
    } catch (e, st) {
      appLogger.w('cancelAll failed', error: e, stackTrace: st);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Helpers (visible for tests)
  // ═══════════════════════════════════════════════════════════════════════

  /// Stable hash of (scheduleId + isoDateTime) into a 31-bit positive int.
  /// Stable across process restarts because Dart's [String.hashCode] is
  /// not — we therefore implement our own polynomial fold.
  static int deterministicNotificationId(
    String scheduleId,
    String isoDateTime,
  ) {
    final String input = '$scheduleId|$isoDateTime';
    int h = 0;
    for (int i = 0; i < input.length; i++) {
      h = (h * 31 + input.codeUnitAt(i)) & 0x7fffffff;
    }
    return h;
  }

  static DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  void _onNotificationResponse(NotificationResponse response) {
    final String? payload = response.payload;
    if (payload == null || payload.isEmpty) return;
    try {
      final Map<String, dynamic> decoded =
          (jsonDecode(payload) as Map<dynamic, dynamic>)
              .cast<String, dynamic>();
      _deepLinkController.add(
        ReminderDeepLink(
          scheduleId: decoded['scheduleId'].toString(),
          medicationIndex: (decoded['medicationIndex'] as num).toInt(),
          scheduledAt: DateTime.parse(decoded['scheduledAt'] as String),
        ),
      );
    } catch (e, st) {
      appLogger.w('bad notification payload', error: e, stackTrace: st);
    }
  }
}

/// App-wide singleton. Disposed automatically when the root ProviderScope
/// is torn down.
final Provider<NotificationScheduler> notificationSchedulerProvider =
    Provider<NotificationScheduler>((Ref ref) {
      final NotificationScheduler s = NotificationScheduler();
      ref.onDispose(s.dispose);
      return s;
    });
