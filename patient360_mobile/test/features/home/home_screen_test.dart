import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:patient360_mobile/core/theme/app_theme.dart';
import 'package:patient360_mobile/core/theme/theme_controller.dart';
import 'package:patient360_mobile/features/auth/domain/auth_session.dart';
import 'package:patient360_mobile/features/auth/domain/patient_profile.dart';
import 'package:patient360_mobile/features/auth/domain/person.dart';
import 'package:patient360_mobile/features/auth/domain/user.dart';
import 'package:patient360_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:patient360_mobile/features/home/data/overview_repository.dart';
import 'package:patient360_mobile/features/home/domain/overview.dart';
import 'package:patient360_mobile/features/home/domain/recent_activity.dart';
import 'package:patient360_mobile/features/home/presentation/home_screen.dart';

/// Always-loading controller so the test can assert the loading UI.
class _LoadingAuthController extends AuthController {
  @override
  Future<AuthSession?> build() async {
    return _session();
  }
}

AuthSession _session() {
  return AuthSession(
    jwt: 'jwt.test',
    user: const User(
      id: 'acc-1',
      email: 'patient@example.com',
      roles: <String>['patient'],
    ),
    patient: const PatientProfile(),
    isMinor: false,
    person: Person(
      nationalId: '12345678901',
      firstName: 'أحمد',
      fatherName: 'علي',
      lastName: 'الحسيني',
      motherName: 'فاطمة',
      dateOfBirth: DateTime(1990, 5, 12),
      gender: 'male',
      governorate: 'damascus',
      city: 'دمشق',
      address: 'شارع الثورة',
      phoneNumber: '+963999999999',
    ),
  );
}

class _FakeOverviewRepo extends OverviewRepository {
  _FakeOverviewRepo(this._result) : super(Dio());

  final Overview _result;

  @override
  Future<Overview> getDashboardOverview() async => _result;
}

Widget _host({
  required Widget child,
  required List<Object> overrides,
}) {
  return ProviderScope(
    // ignore: argument_type_not_assignable — untyped list workaround
    // for Riverpod 3 not re-exporting `Override` under flutter_riverpod.
    // Passing a runtime-correct list of Overrides via dynamic coercion.
    overrides: overrides.cast(),
    child: MaterialApp(
      theme: AppTheme.lightTheme(),
      locale: const Locale('ar', 'SY'),
      supportedLocales: const <Locale>[Locale('ar', 'SY'), Locale('en', 'US')],
      localizationsDelegates: const <LocalizationsDelegate<Object>>[
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (BuildContext context, Widget? routeChild) => Directionality(
        textDirection: TextDirection.rtl,
        child: routeChild ?? const SizedBox.shrink(),
      ),
      home: child,
    ),
  );
}

List<Object> _baseOverrides(SharedPreferences prefs, OverviewRepository repo) {
  return <Object>[
    sharedPreferencesProvider.overrideWithValue(prefs),
    overviewRepositoryProvider.overrideWithValue(repo),
    authControllerProvider.overrideWith(_LoadingAuthController.new),
  ];
}

void main() {
  setUpAll(() {
    dotenv.testLoad(fileInput: 'API_BASE_URL=http://localhost:5000/api\n');
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  testWidgets('home screen shows all 4 KPI labels and empty activity state',
      (WidgetTester tester) async {
    // Tall viewport so the ListView renders hero + KPIs + activity + quick
    // actions in a single frame.
    tester.view.physicalSize = const Size(411, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final OverviewRepository repo = _FakeOverviewRepo(
      const Overview(
        upcomingAppointments: 3,
        activePrescriptions: 2,
        pendingLabResults: 7,
        unreadNotifications: 5,
      ),
    );

    await tester.pumpWidget(
      _host(
        overrides: _baseOverrides(prefs, repo),
        child: const HomeScreen(),
      ),
    );

    // Let the Future resolve + layout settle.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // All four KPI labels appear (in Arabic).
    expect(find.text('مواعيد قادمة'), findsOneWidget);
    expect(find.text('وصفات نشطة'), findsOneWidget);
    expect(find.text('نتائج مختبر بانتظار'), findsOneWidget);
    expect(find.text('إشعارات غير مقروءة'), findsOneWidget);

    // Values show up after data resolves (unique so they don't collide).
    expect(find.text('3'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    expect(find.text('7'), findsOneWidget);

    // With no recentActivity, the empty state title appears.
    expect(find.text('لا يوجد نشاط حديث'), findsOneWidget);
  });

  testWidgets('home screen shows recent activity rows when present',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final OverviewRepository repo = _FakeOverviewRepo(
      Overview(
        upcomingAppointments: 0,
        activePrescriptions: 0,
        pendingLabResults: 0,
        unreadNotifications: 0,
        recentActivity: <RecentActivity>[
          RecentActivity(
            id: 'act-1',
            type: RecentActivityType.appointment,
            title: 'موعد مع د. سامي',
            occurredAt: DateTime(2026, 4, 20, 10, 30),
          ),
        ],
      ),
    );

    await tester.pumpWidget(
      _host(
        overrides: _baseOverrides(prefs, repo),
        child: const HomeScreen(),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('موعد مع د. سامي'), findsOneWidget);
    expect(find.text('لا يوجد نشاط حديث'), findsNothing);
  });
}
