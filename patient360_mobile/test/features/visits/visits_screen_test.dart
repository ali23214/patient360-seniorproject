import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:patient360_mobile/core/theme/theme_controller.dart';
import 'package:patient360_mobile/features/home/data/overview_repository.dart';
import 'package:patient360_mobile/features/home/domain/overview.dart';
import 'package:patient360_mobile/features/visits/data/visits_repository.dart';
import 'package:patient360_mobile/features/visits/domain/visit.dart';
import 'package:patient360_mobile/features/visits/presentation/visits_screen.dart';
import 'package:patient360_mobile/features/visits/presentation/widgets/vital_signs_grid.dart';

class _FakeVisitsRepo extends VisitsRepository {
  _FakeVisitsRepo(this._visits) : super(Dio());

  final List<Visit> _visits;

  @override
  Future<List<Visit>> getVisits() async => _visits;
}

class _FakeOverviewRepo extends OverviewRepository {
  _FakeOverviewRepo() : super(Dio());

  @override
  Future<Overview> getDashboardOverview() async => Overview.empty;
}

Visit _v({
  required String id,
  String? diagnosis,
  String visitType = 'regular',
}) {
  return Visit(
    id: id,
    visitType: visitType,
    visitDate: DateTime(2026, 4, 1),
    status: 'completed',
    chiefComplaint: 'كحة',
    paymentStatus: 'paid',
    createdAt: DateTime(2026, 4, 1),
    diagnosis: diagnosis,
  );
}

Widget _host({
  required Widget child,
  required List<Object> overrides,
}) {
  return ProviderScope(
    overrides: overrides.cast(),
    child: MaterialApp(
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
      builder: (BuildContext _, Widget? routeChild) => Directionality(
        textDirection: TextDirection.rtl,
        child: routeChild ?? const SizedBox.shrink(),
      ),
      home: child,
    ),
  );
}

void main() {
  setUpAll(() {
    dotenv.testLoad(
        fileInput: 'API_BASE_URL=http://localhost:5000/api\n');
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  testWidgets('renders empty state when there are no visits',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      _host(
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
          visitsRepositoryProvider
              .overrideWithValue(_FakeVisitsRepo(<Visit>[])),
          overviewRepositoryProvider
              .overrideWithValue(_FakeOverviewRepo()),
        ],
        child: const VisitsScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('لا توجد زيارات مسجلة'), findsOneWidget);
  });

  testWidgets(
      'expanding a card reveals diagnosis only when one is present',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final Visit withDx = _v(id: 'v1', diagnosis: 'التهاب رئوي');
    final Visit withoutDx = _v(id: 'v2');

    await tester.pumpWidget(
      _host(
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
          visitsRepositoryProvider.overrideWithValue(
            _FakeVisitsRepo(<Visit>[withDx, withoutDx]),
          ),
          overviewRepositoryProvider
              .overrideWithValue(_FakeOverviewRepo()),
        ],
        child: const VisitsScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Both cards collapsed initially. Diagnosis text not visible.
    expect(find.text('التهاب رئوي'), findsNothing);

    // Tap the first (with-diagnosis) card header.
    await tester.tap(find.text('كحة').first);
    await tester.pump(const Duration(milliseconds: 250));

    expect(find.text('التهاب رئوي'), findsOneWidget);
    expect(find.text('التشخيص'), findsOneWidget);

    // Tap the second card (no diagnosis) — section should NOT appear.
    await tester.tap(find.text('كحة').last);
    await tester.pump(const Duration(milliseconds: 250));

    // Still only one diagnosis subsection visible (from the first card).
    expect(find.text('التشخيص'), findsOneWidget);
  });

  test('VitalSignsGrid flags BP 145/95 as warning severity', () {
    expect(
      VitalSignsGrid.bpSeverityFor(145, 95),
      VitalSeverity.warning,
    );
    expect(
      VitalSignsGrid.bpSeverityFor(120, 80),
      VitalSeverity.normal,
    );
    expect(
      VitalSignsGrid.bpSeverityFor(190, 95),
      VitalSeverity.critical,
    );
  });
}
