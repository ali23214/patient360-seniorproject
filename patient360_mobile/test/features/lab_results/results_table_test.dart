import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'package:patient360_mobile/core/theme/app_colors.dart';
import 'package:patient360_mobile/features/lab_results/domain/test_result_row.dart';
import 'package:patient360_mobile/features/lab_results/presentation/widgets/results_table.dart';

Widget _host(Widget child) {
  return MaterialApp(
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
    home: Scaffold(body: child),
  );
}

/// Walks the descendant subtree of a finder and returns the first
/// [Container] whose decoration carries [color]. Used to assert that the
/// row containing a critical result paints the error tint.
Container? _findContainerWithColor(WidgetTester tester, Finder root, Color color) {
  final Iterable<Element> elements = tester.elementList(
    find.descendant(of: root, matching: find.byType(Container)),
  );
  for (final Element e in elements) {
    final Widget w = e.widget;
    if (w is! Container) continue;
    final BoxDecoration? deco = w.decoration as BoxDecoration?;
    if (deco?.color == color) return w;
  }
  return null;
}

void main() {
  testWidgets('critical row paints the error-tinted background',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final List<TestResultRow> rows = <TestResultRow>[
      const TestResultRow(
        testName: 'Hemoglobin',
        value: '6.1',
        numericValue: 6.1,
        unit: 'g/dL',
        referenceRange: '12-16',
        isAbnormal: true,
        isCritical: true,
      ),
      const TestResultRow(
        testName: 'Sodium',
        value: '140',
        numericValue: 140,
        unit: 'mmol/L',
        referenceRange: '135-145',
        isAbnormal: false,
        isCritical: false,
      ),
    ];

    await tester.pumpWidget(_host(ResultsTable(results: rows)));
    await tester.pump();

    // Critical row paints with the error-tinted background.
    const Color expectedBg = Color(0x22D32F2F);
    final Container? critRow =
        _findContainerWithColor(tester, find.byType(ResultsTable), expectedBg);
    expect(critRow, isNotNull,
        reason: 'expected a row tinted with error background');

    // Critical row leads with the octagon-alert icon in error color.
    final Iterable<Icon> icons = tester
        .widgetList<Icon>(find.byIcon(LucideIcons.octagonAlert));
    expect(icons.any((Icon i) => i.color == AppColors.error), isTrue);
  });

  testWidgets('abnormal-but-not-critical row paints warning tint',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final List<TestResultRow> rows = <TestResultRow>[
      const TestResultRow(
        testName: 'Glucose',
        value: '210',
        numericValue: 210,
        unit: 'mg/dL',
        referenceRange: '70-100',
        isAbnormal: true,
        isCritical: false,
      ),
    ];
    await tester.pumpWidget(_host(ResultsTable(results: rows)));
    await tester.pump();

    const Color warningBg = Color(0x22F57C00);
    expect(
      _findContainerWithColor(tester, find.byType(ResultsTable), warningBg),
      isNotNull,
    );
    final Iterable<Icon> icons = tester
        .widgetList<Icon>(find.byIcon(LucideIcons.triangleAlert));
    expect(icons.any((Icon i) => i.color == AppColors.warning), isTrue);
  });

  testWidgets('empty results render the "results not yet" copy',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    await tester
        .pumpWidget(_host(const ResultsTable(results: <TestResultRow>[])));
    await tester.pump();

    expect(find.text('لم تصدر النتائج بعد.'), findsOneWidget);
  });
}
