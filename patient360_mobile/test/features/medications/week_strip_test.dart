import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:patient360_mobile/core/theme/theme_controller.dart';
import 'package:patient360_mobile/features/medications/presentation/providers/medications_providers.dart';
import 'package:patient360_mobile/features/medications/presentation/widgets/week_strip.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/adherence_record.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/reminder_schedule.dart';
import 'package:patient360_mobile/features/prescriptions/presentation/providers/adherence_provider.dart';
import 'package:patient360_mobile/features/prescriptions/presentation/providers/reminders_provider.dart';

class _ListRemindersController extends RemindersController {
  _ListRemindersController(this._initial);
  final List<ReminderSchedule> _initial;
  @override
  Future<List<ReminderSchedule>> build() async => _initial;
}

class _ListAdherenceController extends AdherenceController {
  _ListAdherenceController(this._initial);
  final List<AdherenceRecord> _initial;
  @override
  Future<List<AdherenceRecord>> build() async => _initial;
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  testWidgets('renders 7 day cells centered on today',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final DateTime now = DateTime(2026, 4, 26);

    final List<Object> overrides = <Object>[
      sharedPreferencesProvider.overrideWithValue(prefs),
      nowProvider.overrideWithValue(now),
      remindersProvider.overrideWith(
        () => _ListRemindersController(<ReminderSchedule>[]),
      ),
      adherenceProvider.overrideWith(
        () => _ListAdherenceController(<AdherenceRecord>[]),
      ),
    ];

    await tester.pumpWidget(
      ProviderScope(
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
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              body: WeekStrip(
                selectedDate: now,
                onDateSelected: (DateTime _) {},
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    // Expected day numbers around April 26: 23,24,25,26,27,28,29.
    for (final int day in <int>[23, 24, 25, 26, 27, 28, 29]) {
      expect(
        find.text(day.toString()),
        findsOneWidget,
        reason: 'Day $day should appear in the 7-cell strip',
      );
    }
  });
}
