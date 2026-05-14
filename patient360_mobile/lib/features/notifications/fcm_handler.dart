import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;

import 'package:device_info_plus/device_info_plus.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../core/utils/logger.dart';
import '../../router/app_router.dart';
import '../prescriptions/data/notification_scheduler.dart'
    show NotificationConstants;
import 'data/fcm_token_repository.dart';

/// FCM background entry point. Must be a top-level function so the OS
/// isolate can resolve it via Dart symbol lookup. Keep this minimal —
/// the moment we await heavy work the OS may kill the isolate.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage _) async {
  // Defensive: initializeApp is idempotent. If the main isolate already
  // initialized Firebase, this returns the existing app.
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Initialization can race with the foreground isolate; swallowing is
    // safe because the OS still renders the system notification.
  }
}

/// Owns the runtime push-notification stack: permission, token
/// registration with the backend, foreground display via
/// flutter_local_notifications, and deep-linking on tap.
///
/// **Degraded mode**: when Firebase has not been configured yet (no
/// `google-services.json` / `GoogleService-Info.plist`), [initialize]
/// catches the configuration error, sets [isAvailable] to `false`, and
/// every other public method becomes a no-op. The rest of the app
/// continues to work — only push delivery is disabled.
class FcmHandler {
  FcmHandler({
    required this.ref,
    FlutterLocalNotificationsPlugin? localPlugin,
    FirebaseMessaging? messaging,
  })  : _localPlugin = localPlugin ?? FlutterLocalNotificationsPlugin(),
        _messagingOverride = messaging;

  final Ref ref;
  final FlutterLocalNotificationsPlugin _localPlugin;
  final FirebaseMessaging? _messagingOverride;

  bool _initialized = false;
  bool _isAvailable = false;
  String? _cachedToken;
  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<RemoteMessage>? _foregroundSub;
  StreamSubscription<RemoteMessage>? _openedAppSub;

  /// Always start uppercase 'fcm_handler' channel — distinct from the
  /// existing `p360_meds` channel so push notifications are governed by
  /// their own importance/sound configuration.
  static const String _pushChannelId = 'p360_push';
  static const String _pushChannelName = 'الإشعارات الفورية';
  static const String _pushChannelDescription =
      'الإشعارات القادمة من الخادم — تذكيرات المواعيد والنتائج وغيرها.';

  bool get isAvailable => _isAvailable;
  String? get currentToken => _cachedToken;

  FirebaseMessaging get _messaging =>
      _messagingOverride ?? FirebaseMessaging.instance;

  // ═══════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════════════════════

  /// Idempotent — safe to call from the auth controller every time the
  /// session restores. Never throws; failures degrade to logging.
  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    if (Firebase.apps.isEmpty) {
      appLogger.w(
          'FcmHandler.initialize: Firebase not configured — degraded mode. '
          'See lib/features/notifications/FIREBASE_SETUP.md.');
      return;
    }

    try {
      await _bootstrapLocalNotifications();
      await _requestPermission();
      _isAvailable = true;

      _cachedToken = await _safeGetToken();
      if (_cachedToken != null) {
        await _registerWithBackend(_cachedToken!);
      }

      _tokenRefreshSub = _messaging.onTokenRefresh.listen((String t) {
        _cachedToken = t;
        // ignore: discarded_futures
        _registerWithBackend(t);
      });

      _foregroundSub = FirebaseMessaging.onMessage
          .listen(_displayForeground);
      _openedAppSub = FirebaseMessaging.onMessageOpenedApp
          .listen(_handleOpenedApp);

      // Cold-start case: app launched by tapping a notification while
      // terminated. getInitialMessage returns once and only once per launch.
      final RemoteMessage? cold = await _messaging.getInitialMessage();
      if (cold != null) {
        // Defer until the router is built so context.go has somewhere to
        // navigate to.
        // ignore: unawaited_futures
        Future<void>.microtask(() => _handleOpenedApp(cold));
      }
    } catch (e, st) {
      appLogger.w('FcmHandler.initialize failed — degraded mode',
          error: e, stackTrace: st);
      _isAvailable = false;
    }
  }

  /// Removes the token from the backend (best effort) and stops listening
  /// to refresh events. Called from [AuthController.logout].
  Future<void> unregister() async {
    final String? token = _cachedToken;
    if (token != null) {
      try {
        await ref
            .read(fcmTokenRepositoryProvider)
            .unregisterToken(token: token);
      } catch (e, st) {
        appLogger.w('fcm unregister failed', error: e, stackTrace: st);
      }
    }
    _cachedToken = null;
    await _tokenRefreshSub?.cancel();
    _tokenRefreshSub = null;
    await _foregroundSub?.cancel();
    _foregroundSub = null;
    await _openedAppSub?.cancel();
    _openedAppSub = null;
    if (_isAvailable) {
      try {
        await _messaging.deleteToken();
      } catch (_) {/* tolerate plugin errors on logout */}
    }
    _initialized = false;
  }

  Future<void> dispose() async {
    await _tokenRefreshSub?.cancel();
    await _foregroundSub?.cancel();
    await _openedAppSub?.cancel();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Setup helpers
  // ═══════════════════════════════════════════════════════════════════════

  Future<void> _bootstrapLocalNotifications() async {
    const AndroidInitializationSettings androidInit =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const DarwinInitializationSettings iosInit = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    const InitializationSettings settings = InitializationSettings(
      android: androidInit,
      iOS: iosInit,
    );
    await _localPlugin.initialize(
      settings,
      onDidReceiveNotificationResponse: _onLocalTap,
    );

    final AndroidFlutterLocalNotificationsPlugin? android = _localPlugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    if (android != null) {
      await android.createNotificationChannel(
        const AndroidNotificationChannel(
          _pushChannelId,
          _pushChannelName,
          description: _pushChannelDescription,
          importance: Importance.high,
        ),
      );
    }
  }

  Future<void> _requestPermission() async {
    if (Platform.isIOS) {
      await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      return;
    }
    if (Platform.isAndroid) {
      // Android 13+ runtime permission — Firebase v15 wraps the request
      // for us. Older Android versions return granted without prompting.
      await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
    }
  }

  Future<String?> _safeGetToken() async {
    try {
      return await _messaging.getToken();
    } catch (e, st) {
      appLogger.w('getToken failed', error: e, stackTrace: st);
      return null;
    }
  }

  Future<void> _registerWithBackend(String token) async {
    try {
      final ({String name, String version}) info =
          await _collectDeviceInfo();
      await ref.read(fcmTokenRepositoryProvider).registerToken(
            token: token,
            platform: Platform.isIOS ? 'ios' : 'android',
            deviceName: info.name,
            appVersion: info.version,
          );
    } catch (e, st) {
      appLogger.w('register fcm token failed (soft)',
          error: e, stackTrace: st);
    }
  }

  Future<({String name, String version})> _collectDeviceInfo() async {
    String name = 'unknown';
    String version = '0.0.0';
    try {
      final DeviceInfoPlugin plugin = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final AndroidDeviceInfo info = await plugin.androidInfo;
        name = '${info.manufacturer} ${info.model}'.trim();
      } else if (Platform.isIOS) {
        final IosDeviceInfo info = await plugin.iosInfo;
        name = '${info.name} (${info.systemVersion})';
      }
      final PackageInfo pkg = await PackageInfo.fromPlatform();
      version = '${pkg.version}+${pkg.buildNumber}';
    } catch (e, st) {
      appLogger.w('device info collection failed', error: e, stackTrace: st);
    }
    return (name: name, version: version);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Message handling
  // ═══════════════════════════════════════════════════════════════════════

  /// Renders a local banner for an FCM message that arrived while the
  /// app is in the foreground. iOS handles foreground display itself
  /// (the platform shows nothing by default), so we always paint via
  /// flutter_local_notifications to keep behavior consistent.
  Future<void> _displayForeground(RemoteMessage message) async {
    final RemoteNotification? n = message.notification;
    if (n == null) return;
    final String payload = jsonEncode(message.data);
    try {
      await _localPlugin.show(
        message.hashCode,
        n.title,
        n.body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            _pushChannelId,
            _pushChannelName,
            channelDescription: _pushChannelDescription,
            importance: Importance.high,
            priority: Priority.high,
          ),
          iOS: DarwinNotificationDetails(),
        ),
        payload: payload,
      );
    } catch (e, st) {
      appLogger.w('foreground push display failed',
          error: e, stackTrace: st);
    }
  }

  /// Tap handler for the foreground banner.
  void _onLocalTap(NotificationResponse response) {
    final String? payload = response.payload;
    if (payload == null || payload.isEmpty) return;
    try {
      final Map<String, dynamic> data =
          (jsonDecode(payload) as Map<dynamic, dynamic>)
              .cast<String, dynamic>();
      _navigateFromData(data);
    } catch (_) {/* malformed payload — ignore */}
  }

  /// Tap handler for a push delivered while the app was backgrounded.
  void _handleOpenedApp(RemoteMessage message) {
    _navigateFromData(message.data);
  }

  /// Reads `data.route` (and reserves `data.relatedId` for v2). Routes
  /// that aren't in the allow-list — see the
  /// `relatedTypeToRoute` map in `prompt 9` — are silently ignored
  /// instead of letting an attacker push a navigation to an arbitrary
  /// path.
  void _navigateFromData(Map<String, dynamic> data) {
    final String? route = data['route']?.toString();
    if (route == null || route.isEmpty) return;
    if (!_isAllowed(route)) {
      appLogger.w('push deep-link rejected — disallowed route: $route');
      return;
    }
    try {
      final GoRouter router = ref.read(appRouterProvider);
      router.go(route);
    } catch (e, st) {
      appLogger.w('push deep-link navigate failed',
          error: e, stackTrace: st);
    }
  }

  static const Set<String> _allowedRoots = <String>{
    '/home',
    '/appointments',
    '/visits',
    '/medications',
    '/lab',
    '/ai',
    '/notifications',
    '/profile',
    '/reviews',
  };

  @visibleForTesting
  static bool isAllowedRoute(String route) => _isAllowed(route);

  static bool _isAllowed(String route) {
    final String path = route.split('?').first;
    return _allowedRoots.contains(path);
  }

  // Dummy reference to keep the import alive — we share the meds reminder
  // channel constants only conceptually and want clear documentation.
  // ignore: unused_element
  static String get _medsChannelId => NotificationConstants.channelId;
}

/// Singleton handler tied to the Riverpod scope so tests can override.
final Provider<FcmHandler> fcmHandlerProvider = Provider<FcmHandler>(
  (Ref ref) {
    final FcmHandler h = FcmHandler(ref: ref);
    ref.onDispose(h.dispose);
    return h;
  },
);
