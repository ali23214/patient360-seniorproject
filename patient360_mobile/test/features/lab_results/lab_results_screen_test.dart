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
import 'package:patient360_mobile/features/lab_results/data/lab_tests_repository.dart';
import 'package:patient360_mobile/features/lab_results/domain/lab_test.dart';
import 'package:patient360_mobile/features/lab_results/domain/test_result_row.dart';
import 'package:patient360_mobile/features/lab_results/presentation/lab_results_screen.dart';
import 'package:patient360_mobile/features/lab_results/presentation/widgets/results_table.dart';

class _FakeOverviewRepo extends OverviewRepository {
  _FakeOverviewRepo() : super(Dio());
  @override
  Future<Overview> getDashboardOverview() async => Overview.empty;
}

class _ListLabRepo extends LabTestsRepository {
  _ListLabRepo(this._initial) : super(Dio());
  final List<LabTest> _initial;
  int markCallCount = 0;

  @override
  Future<List<LabTest>> getLabTests() async => _initial;

  @override
  Future<void> markLabTestViewed(String id) async {
    markCallCount++;
  }
}

LabTest _test({
  required String id,
  String status = 'completed',
  bool viewed = false,
  List<TestResultRow> results = const <TestResultRow>[],
}) {
  return LabTest(
    id: id,
    testNumber: 'LAB-$id',
    orderDate: DateTime(2026, 4, 1),
    testCategory: 'cbc',
    priority: 'routine',
    status: status,
    testsOrdered: const [],
    testResults: results,
    isCritical: false,
    isViewedByPatient: viewed,
    createdAt: DateTime(2026, 4, 1),
  );
}

Widget _host({required Widget child, required List<Object> overrides}) {
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
    dotenv.testLoad(fileInput: 'API_BASE_URL=http://localhost:5000/api\n');
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  testWidgets('tabs filter the list by all/pending/completed',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final _ListLabRepo repo = _ListLabRepo(<LabTest>[
      _test(id: 'p', status: 'in_progress'),
      _test(id: 'c', status: 'completed'),
    ]);

    await tester.pumpWidget(
      _host(
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
          labTestsRepositoryProvider.overrideWithValue(repo),
          overviewRepositoryProvider.overrideWithValue(_FakeOverviewRepo()),
        ],
        child: const LabResultsScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Default tab "الكل" → both rows visible.
    expect(find.text('LAB-p'), findsOneWidget);
    expect(find.text('LAB-c'), findsOneWidget);

    await tester.tap(find.text('بانتظار النتائج'));
    await tester.pump();
    expect(find.text('LAB-p'), findsOneWidget);
    expect(find.text('LAB-c'), findsNothing);

    await tester.tap(find.text('مكتملة'));
    await tester.pump();
    expect(find.text('LAB-p'), findsNothing);
    expect(find.text('LAB-c'), findsOneWidget);
  });

  testWidgets('expanding a completed+unviewed test calls markViewed',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final _ListLabRepo repo = _ListLabRepo(<LabTest>[
      _test(id: 'c', status: 'completed', viewed: false),
    ]);

    await tester.pumpWidget(
      _host(
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
          labTestsRepositoryProvider.overrideWithValue(repo),
          overviewRepositoryProvider.overrideWithValue(_FakeOverviewRepo()),
        ],
        child: const LabResultsScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('LAB-c'), findsOneWidget);

    // Tap the card to expand it.
    await tester.tap(find.text('LAB-c'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));

    expect(repo.markCallCount, 1);
    // The expanded body now includes the results table with empty state.
    expect(find.text('لم تصدر النتائج بعد.'), findsOneWidget);
  });

  testWidgets('expanding a critical test fires the persistent SnackBar',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final _ListLabRepo repo = _ListLabRepo(<LabTest>[
      _test(
        id: 'crit',
        status: 'completed',
        viewed: true, // pre-marked viewed so we focus on the critical SnackBar
        results: const <TestResultRow>[
          TestResultRow(
            testName: 'Potassium',
            value: '6.8',
            numericValue: 6.8,
            unit: 'mmol/L',
            referenceRange: '3.5-5.0',
            isAbnormal: true,
            isCritical: true,
          ),
        ],
      ),
    ]);

    await tester.pumpWidget(
      _host(
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
          labTestsRepositoryProvider.overrideWithValue(repo),
          overviewRepositoryProvider.overrideWithValue(_FakeOverviewRepo()),
        ],
        child: const LabResultsScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.text('LAB-crit'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));

    expect(
      find.text('نتائج حرجة — يُرجى مراجعة الطبيب في أقرب وقت.'),
      findsOneWidget,
    );
    expect(find.byType(ResultsTable), findsOneWidget);
  });
}
