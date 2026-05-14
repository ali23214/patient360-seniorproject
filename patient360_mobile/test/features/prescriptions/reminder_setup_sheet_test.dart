import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:patient360_mobile/core/theme/theme_controller.dart';
import 'package:patient360_mobile/features/prescriptions/domain/medication_item.dart';
import 'package:patient360_mobile/features/prescriptions/domain/prescription.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/reminder_schedule.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/time_of_day_dto.dart';
import 'package:patient360_mobile/features/prescriptions/presentation/reminder_setup_sheet.dart';

Prescription _rx() => Prescription(
      id: 'rx-1',
      prescriptionNumber: 'RX-20260420-00001',
      prescriptionDate: DateTime(2026, 4, 20),
      medications: const <MedicationItem>[
        MedicationItem(
          medicationName: 'Cipro',
          dosage: '500mg',
          frequency: 'twice daily',
          duration: '7 days',
        ),
      ],
      status: 'active',
      printCount: 0,
      createdAt: DateTime(2026, 4, 20),
      updatedAt: DateTime(2026, 4, 20),
    );

ReminderSchedule _emptyTimesReminder() {
  final DateTime now = DateTime(2026, 4, 26);
  return ReminderSchedule(
    id: 's-1',
    prescriptionId: 'rx-1',
    medicationIndex: 0,
    medicationName: 'Cipro',
    dosage: '500mg',
    times: const <TimeOfDayDto>[],
    startDate: now,
    endDate: now.add(const Duration(days: 7)),
    isEnabled: true,
    createdAt: now,
    updatedAt: now,
  );
}

Widget _host(Widget child, List<Object> overrides) {
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
      home: Scaffold(body: child),
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

  testWidgets('Save button is disabled when times list is empty',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(560, 1900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(
      _host(
        ReminderSetupSheet(
          prescription: _rx(),
          medicationIndex: 0,
          existing: _emptyTimesReminder(),
        ),
        <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
        ],
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('يجب إضافة وقت واحد على الأقل.'), findsOneWidget);
    final ElevatedButton saveBtn = tester
        .widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'حفظ'));
    expect(saveBtn.onPressed, isNull,
        reason: 'Expected save disabled when times list is empty');
  });

  testWidgets('default sheet shows the parsed times for "twice daily"',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(560, 1900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(
      _host(
        ReminderSetupSheet(
          prescription: _rx(),
          medicationIndex: 0,
        ),
        <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
        ],
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // "twice daily" → 08:00 and 20:00.
    expect(find.text('08:00'), findsOneWidget);
    expect(find.text('20:00'), findsOneWidget);
    expect(find.text('إضافة وقت'), findsOneWidget);
  });
}
