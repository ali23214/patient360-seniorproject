import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/config/env.dart';
import 'core/theme/app_colors.dart';
import 'core/theme/theme_controller.dart';
import 'core/utils/logger.dart';
import 'features/notifications/fcm_handler.dart';
import 'features/prescriptions/data/notification_scheduler.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Env.load();

  // Firebase boot. Tolerates a missing google-services.json /
  // GoogleService-Info.plist by logging a warning and continuing in
  // "degraded" mode — push delivery is disabled, the rest of the app
  // works. See lib/features/notifications/FIREBASE_SETUP.md.
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
  } catch (e, st) {
    appLogger.w(
      'Firebase.initializeApp failed — push notifications disabled. '
      'Drop google-services.json / GoogleService-Info.plist to enable.',
      error: e,
      stackTrace: st,
    );
  }

  // Loads month/day names for the Arabic locale so TableCalendar (calendar
  // sub-tab on /medications) and intl.DateFormat('...', 'ar') work without

  await initializeDateFormatting('ar', null);

  // Preload SharedPreferences so ThemeController.build() can resolve the
  // persisted mode synchronously (avoiding a first-frame flash).
  final SharedPreferences prefs = await SharedPreferences.getInstance();

  // Boot the local notification stack once. Idempotent + safe to call from
  // tests; throws nothing if the platform plugin isn't available.
  final NotificationScheduler scheduler = NotificationScheduler();
  await scheduler.initialize();

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
      systemNavigationBarColor: AppColors.primary,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  runApp(
    ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        notificationSchedulerProvider.overrideWithValue(scheduler),
      ],
      child: const Patient360App(),
    ),
  );
}
