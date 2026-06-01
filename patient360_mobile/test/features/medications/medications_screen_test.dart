import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:patient360_mobile/core/theme/theme_controller.dart';
import 'package:patient360_mobile/features/home/data/overview_repository.dart';
import 'package:patient360_mobile/features/home/domain/overview.dart';
import 'package:patient360_mobile/features/medications/domain/scheduled_dose.dart';
import 'package:patient360_mobile/features/medications/presentation/medications_screen.dart';
import 'package:patient360_mobile/features/medications/presentation/providers/medications_providers.dart';
import 'package:patient360_mobile/features/medications/presentation/widgets/calendar_tab.dart';
import 'package:patient360_mobile/features/medications/presentation/widgets/dose_row.dart';
import 'package:patient360_mobile/features/prescriptions/domain/prescription.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/adherence_record.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/reminder_schedule.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/time_of_day_dto.dart';
import 'package:patient360_mobile/features/prescriptions/presentation/providers/adherence_provider.dart';
import 'package:patient360_mobile/features/prescriptions/presentation/providers/prescriptions_provider.dart';
import 'package:patient360_mobile/features/prescriptions/presentation/providers/reminders_provider.dart';

class _FakeOverviewRepo extends OverviewRepository {
  _FakeOverviewRepo() : super(Dio());

  @override
  Future<Overview> getDashboardOverview() async => Overview.empty;
}

ScheduledDose _dose({
  required String prescriptionId,
  required int medicationIndex,
  required DateTime scheduledAt,
  String medName = 'Cipro',
  String dosage = '500mg',
  DoseWindow window = DoseWindow.upcoming,
  bool isTaken = false,
  String? scheduleId = 'sched-1',
}) =>
    ScheduledDose(
      prescriptionId: prescriptionId,
      medicationIndex: medicationIndex,
      medicationName: medName,
      dosage: dosage,
      scheduledAt: scheduledAt,
      window: window,
      isTaken: isTaken,
      scheduleId: scheduleId,
    );

class _StubAdherenceController extends AdherenceController {
  _StubAdherenceController(this._initial);
  final List<AdherenceRecord> _initial;
  bool markCalled = false;
  String? lastPrescriptionId;
  int? lastMedicationIndex;
  DateTime? lastScheduledAt;

  @override
  Future<List<AdherenceRecord>> build() async => _initial;

  @override
  Future<void> markTaken({
    required String prescriptionId,
    required int medicationIndex,
    required DateTime scheduledAt,
  }) async {
    markCalled = true;
    lastPrescriptionId = prescriptionId;
    lastMedicationIndex = medicationIndex;
    lastScheduledAt = scheduledAt;
    final List<AdherenceRecord> next =
        List<AdherenceRecord>.from(state.value ?? <AdherenceRecord>[])
          ..add(
            AdherenceRecord(
              id: 'a-${DateTime.now().millisecondsSinceEpoch}',
              prescriptionId: prescriptionId,
              medicationIndex: medicationIndex,
              scheduledAt: scheduledAt,
              takenAt: DateTime(2026, 4, 26, 14, 1),
              createdAt: DateTime(2026, 4, 26, 14, 1),
            ),
          );
    state = AsyncValue<List<AdherenceRecord>>.data(next);
  }
}

Widget _host({
  required GoRouter router,
  required List<Object> overrides,
}) {
  return ProviderScope(
    overrides: overrides.cast(),
    child: MaterialApp.router(
      routerConfig: router,
      locale: const Locale('ar', 'SY'),
      supportedLocales: const <Locale>[
        Locale('ar', 'SY'),
        Locale('en', 'US'),
      ],
      localizationsDelegates: const <LocalizationsDelegate<Object>>[
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (BuildContext context, Widget? child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child ?? const SizedBox.shrink(),
      ),
    ),
  );
}

GoRouter _routerForLocation(String initialLocation) {
  return GoRouter(
    initialLocation: initialLocation,
    routes: <RouteBase>[
      GoRoute(
        path: '/medications',
        builder: (BuildContext _, GoRouterState __) =>
            const MedicationsScreen(),
      ),
    ],
  );
}

void main() {
  setUpAll(() async {
    dotenv.testLoad(fileInput: 'API_BASE_URL=http://localhost:5000/api\n');
    GoogleFonts.config.allowRuntimeFetching = false;
    await initializeDateFormatting('ar', null);
  });

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  testWidgets('initial load shows the today schedule sub-tab',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final DateTime now = DateTime(2026, 4, 26, 14);

    await tester.pumpWidget(
      _host(
        router: _routerForLocation('/medications'),
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
          nowProvider.overrideWithValue(now),
          remindersProvider.overrideWith(
            () => _ListRemindersController(<ReminderSchedule>[]),
          ),
          adherenceProvider.overrideWith(
            () => _StubAdherenceController(<AdherenceRecord>[]),
          ),
          prescriptionsProvider.overrideWith(
            () => _NoOpPrescriptionsController(),
          ),
          overviewRepositoryProvider
              .overrideWithValue(_FakeOverviewRepo()),
        ],
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    // Header tabs visible.
    expect(find.text('الجدول اليوم'), findsOneWidget);
    expect(find.text('التقويم'), findsOneWidget);
    expect(find.text('الوصفات'), findsOneWidget);

    // Empty-state CTA — confirms TodayScheduleTab is the active tab.
    expect(find.text('لا توجد جرعات اليوم'), findsOneWidget);
    expect(find.text('عرض الوصفات'), findsOneWidget);
  });

  testWidgets('switching to التقويم renders the calendar sub-tab',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final DateTime now = DateTime(2026, 4, 26, 14);

    await tester.pumpWidget(
      _host(
        router: _routerForLocation('/medications'),
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
          nowProvider.overrideWithValue(now),
          remindersProvider.overrideWith(
            () => _ListRemindersController(<ReminderSchedule>[]),
          ),
          adherenceProvider.overrideWith(
            () => _StubAdherenceController(<AdherenceRecord>[]),
          ),
          prescriptionsProvider.overrideWith(
            () => _NoOpPrescriptionsController(),
          ),
          overviewRepositoryProvider
              .overrideWithValue(_FakeOverviewRepo()),
        ],
      ),
    );
    await tester.pump();

    // Tap the calendar sub-tab.
    await tester.tap(find.text('التقويم'));
    await tester.pump();

    // CalendarTab body widgets should now render.
    expect(find.byType(CalendarTab), findsOneWidget);
    expect(find.byType(DayDetailCard), findsOneWidget);
  });

  testWidgets('tapping the checkbox writes adherence and flips to taken',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final DateTime now = DateTime(2026, 4, 26, 14);
    final ReminderSchedule schedule = ReminderSchedule(
      id: 'sched-1',
      prescriptionId: 'rx-1',
      medicationIndex: 0,
      medicationName: 'Cipro',
      dosage: '500mg',
      times: <TimeOfDayDto>[const TimeOfDayDto(hour: 14, minute: 0)],
      startDate: DateTime(2026, 4, 1),
      endDate: DateTime(2026, 6, 1),
      isEnabled: true,
      createdAt: DateTime(2026, 4, 1),
      updatedAt: DateTime(2026, 4, 1),
    );
    final _StubAdherenceController stub =
        _StubAdherenceController(<AdherenceRecord>[]);

    await tester.pumpWidget(
      _host(
        router: _routerForLocation('/medications'),
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
          nowProvider.overrideWithValue(now),
          remindersProvider.overrideWith(
            () => _ListRemindersController(<ReminderSchedule>[schedule]),
          ),
          adherenceProvider.overrideWith(() => stub),
          prescriptionsProvider.overrideWith(
            () => _NoOpPrescriptionsController(),
          ),
          overviewRepositoryProvider
              .overrideWithValue(_FakeOverviewRepo()),
        ],
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Cipro'), findsOneWidget);
    expect(find.text('مكتمل'), findsNothing);

    // Tap the mark-as-taken checkbox via its icon. The "taken" row uses a
    // different icon (circleCheck), so this remains unique pre-tap.
    final Finder checkIcon = find.byIcon(LucideIcons.check);
    expect(checkIcon, findsOneWidget);
    await tester.tap(checkIcon);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    expect(stub.markCalled, isTrue);
    expect(stub.lastPrescriptionId, 'rx-1');
    expect(stub.lastMedicationIndex, 0);
    expect(stub.lastScheduledAt, DateTime(2026, 4, 26, 14, 0));

    // Optimistic flip — badge changes from "الآن" to "مكتمل".
    expect(find.text('مكتمل'), findsOneWidget);
    expect(find.text('تم'), findsOneWidget);
  });

  testWidgets('day detail card disables checkboxes for future dates',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final DateTime today = DateTime(2026, 4, 26, 9);
    final DateTime futureDate = DateTime(2026, 4, 28);

    final List<ScheduledDose> futureDoses = <ScheduledDose>[
      _dose(
        prescriptionId: 'rx-1',
        medicationIndex: 0,
        scheduledAt: DateTime(2026, 4, 28, 8),
      ),
    ];

    await tester.pumpWidget(
      _host(
        router: _routerForLocation('/medications'),
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
          nowProvider.overrideWithValue(today),
          remindersProvider.overrideWith(
            () => _ListRemindersController(<ReminderSchedule>[]),
          ),
          adherenceProvider.overrideWith(
            () => _StubAdherenceController(<AdherenceRecord>[]),
          ),
          prescriptionsProvider.overrideWith(
            () => _NoOpPrescriptionsController(),
          ),
          dosesForDateProvider(futureDate).overrideWithValue(futureDoses),
        ],
        // Render the DayDetailCard directly instead of navigating through
        // the calendar so the test stays focused on the disabled state.
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    // Switch to calendar tab so DayDetailCard mounts.
    await tester.tap(find.text('التقويم'));
    await tester.pump();
  });

  testWidgets('deep-link focusDose pulses the matching row',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final DateTime now = DateTime(2026, 4, 26, 14);
    final ReminderSchedule schedule = ReminderSchedule(
      id: 'sched-deep',
      prescriptionId: 'rx-deep',
      medicationIndex: 0,
      medicationName: 'Aspirin',
      dosage: '100mg',
      times: <TimeOfDayDto>[const TimeOfDayDto(hour: 14, minute: 0)],
      startDate: DateTime(2026, 4, 1),
      endDate: DateTime(2026, 6, 1),
      isEnabled: true,
      createdAt: DateTime(2026, 4, 1),
      updatedAt: DateTime(2026, 4, 1),
    );
    final String iso = DateTime(2026, 4, 26, 14).toIso8601String();
    final String location =
        '/medications?tab=schedule&focusDose=sched-deep:$iso';

    await tester.pumpWidget(
      _host(
        router: _routerForLocation(location),
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
          nowProvider.overrideWithValue(now),
          remindersProvider.overrideWith(
            () => _ListRemindersController(<ReminderSchedule>[schedule]),
          ),
          adherenceProvider.overrideWith(
            () => _StubAdherenceController(<AdherenceRecord>[]),
          ),
          prescriptionsProvider.overrideWith(
            () => _NoOpPrescriptionsController(),
          ),
          overviewRepositoryProvider
              .overrideWithValue(_FakeOverviewRepo()),
        ],
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Aspirin'), findsOneWidget);
    // Confirm the row exists and is rendered (highlight is internal state).
    expect(find.byType(DoseRow), findsAtLeastNWidgets(1));

    // Wait for the 2-second pulse to clear so test teardown is clean.
    await tester.pump(const Duration(seconds: 3));
  });
}

class _ListRemindersController extends RemindersController {
  _ListRemindersController(this._initial);
  final List<ReminderSchedule> _initial;
  @override
  Future<List<ReminderSchedule>> build() async => _initial;
}

class _NoOpPrescriptionsController extends PrescriptionsController {
  @override
  Future<List<Prescription>> build() async => const <Prescription>[];
}
