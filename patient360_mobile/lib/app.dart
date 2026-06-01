import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'features/prescriptions/data/notification_scheduler.dart';
import 'features/prescriptions/domain/reminders/reminder_schedule.dart';
import 'features/prescriptions/presentation/providers/reminders_provider.dart';
import 'router/app_router.dart';
import 'router/route_names.dart';

/// Root widget. Configures RTL Arabic locale, Teal Medica light + dark
/// themes, and the session-driven go_router instance. [ThemeMode] is
/// mirrored from the persisted [ThemeController].
///
/// Also installs the [WidgetsBindingObserver] that re-runs the reminder
/// sliding window on each `resumed` lifecycle event, so notifications stay
/// in sync after the OS wakes the app from background.
class Patient360App extends ConsumerStatefulWidget {
  const Patient360App({super.key});

  @override
  ConsumerState<Patient360App> createState() => _Patient360AppState();
}

class _Patient360AppState extends ConsumerState<Patient360App>
    with WidgetsBindingObserver {
  StreamSubscription<ReminderDeepLink>? _deepLinkSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _wireDeepLinkListener();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _deepLinkSub?.cancel();
    super.dispose();
  }

  /// Bridges [NotificationScheduler.deepLinkStream] (foreground taps) into
  /// a `context.go(...)` so the schedule sub-tab opens scrolled to the
  /// dose the user just tapped on. Background-launched taps are handled
  /// the same way once the scheduler emits onto the stream after init.
  void _wireDeepLinkListener() {
    final NotificationScheduler scheduler = ref.read(
      notificationSchedulerProvider,
    );
    _deepLinkSub = scheduler.deepLinkStream.listen((ReminderDeepLink dl) {
      final GoRouter router = ref.read(appRouterProvider);
      final String iso = dl.scheduledAt.toIso8601String();
      router.go(
        '${RouteNames.medications}'
        '?tab=schedule&focusDose=${dl.scheduleId}:$iso',
      );
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Best-effort: read whatever schedules are loaded and reschedule the
      // next 7-day window. If reminders haven't loaded yet, the empty list
      // is a safe no-op.
      final List<ReminderSchedule> schedules =
          ref.read(remindersProvider).value ?? <ReminderSchedule>[];
      final NotificationScheduler scheduler = ref.read(
        notificationSchedulerProvider,
      );
      // Don't await — this fires from the framework callback, no UI
      // depends on the result.
      scheduler.scheduleSlidingWindow(schedules);
    }
  }

  @override
  Widget build(BuildContext context) {
    final GoRouter router = ref.watch(appRouterProvider);
    final ThemeMode themeMode = ref.watch(themeControllerProvider);

    return MaterialApp.router(
      title: 'Patient 360',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme(),
      darkTheme: AppTheme.darkTheme(),
      themeMode: themeMode,
      routerConfig: router,
      locale: const Locale('ar', 'SY'),
      supportedLocales: const <Locale>[Locale('ar', 'SY'), Locale('en', 'US')],
      localizationsDelegates: const <LocalizationsDelegate<Object>>[
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (BuildContext context, Widget? child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child ?? const SizedBox.shrink(),
      ),
    );
  }
}
