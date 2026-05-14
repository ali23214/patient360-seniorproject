import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:patient360_mobile/core/theme/theme_controller.dart';
import 'package:patient360_mobile/features/prescriptions/data/reminder_local_store.dart';
import 'package:patient360_mobile/features/prescriptions/domain/medication_item.dart';
import 'package:patient360_mobile/features/prescriptions/domain/prescription.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/reminder_schedule.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/time_of_day_dto.dart';
import 'package:patient360_mobile/features/prescriptions/presentation/widgets/prescription_card.dart';

Prescription _activeRx({
  String id = 'rx-1',
  bool dispensed = false,
}) {
  return Prescription(
    id: id,
    prescriptionNumber: 'RX-20260420-00001',
    prescriptionDate: DateTime(2026, 4, 20),
    medications: <MedicationItem>[
      MedicationItem(
        medicationName: 'Cipro',
        dosage: '500mg',
        frequency: 'twice daily',
        duration: '7 days',
        isDispensed: dispensed,
      ),
    ],
    status: dispensed ? 'dispensed' : 'active',
    printCount: 0,
    createdAt: DateTime(2026, 4, 20),
    updatedAt: DateTime(2026, 4, 20),
    qrCode: 'RX-20260420-00001|123456',
    verificationCode: '123456',
  );
}

ReminderSchedule _matchingReminder({String prescriptionId = 'rx-1'}) {
  final DateTime now = DateTime(2026, 4, 26);
  return ReminderSchedule(
    id: 's-1',
    prescriptionId: prescriptionId,
    medicationIndex: 0,
    medicationName: 'Cipro',
    dosage: '500mg',
    times: <TimeOfDayDto>[
      const TimeOfDayDto(hour: 8, minute: 0),
      const TimeOfDayDto(hour: 20, minute: 0),
    ],
    startDate: now,
    endDate: now.add(const Duration(days: 7)),
    isEnabled: true,
    createdAt: now,
    updatedAt: now,
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
      home: Scaffold(body: SingleChildScrollView(child: child)),
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

  testWidgets(
      'shows "إعداد التذكير" CTA when no reminder is configured for the med',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      _host(
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
        ],
        child: PrescriptionCard(prescription: _activeRx()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Tap the card header to expand.
    await tester.tap(find.text('RX-20260420-00001'));
    await tester.pump(const Duration(milliseconds: 250));

    expect(find.text('إعداد التذكير'), findsOneWidget);
    expect(find.byType(Switch), findsNothing);
  });

  testWidgets(
      'shows time chips + Switch when a reminder already exists for the med',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    // Pre-seed the local reminder store so remindersProvider reads it.
    final ReminderLocalStore store = ReminderLocalStore(prefs);
    await store.upsert(_matchingReminder());

    await tester.pumpWidget(
      _host(
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
        ],
        child: PrescriptionCard(prescription: _activeRx()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    await tester.tap(find.text('RX-20260420-00001'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('إعداد التذكير'), findsNothing);
    expect(find.text('08:00 · 20:00'), findsOneWidget);
    expect(find.byType(Switch), findsOneWidget);
  });
}
