import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:patient360_mobile/core/theme/theme_controller.dart';
import 'package:patient360_mobile/features/appointments/data/appointments_repository.dart';
import 'package:patient360_mobile/features/appointments/domain/appointment.dart';
import 'package:patient360_mobile/features/appointments/domain/availability_slot.dart';
import 'package:patient360_mobile/features/appointments/domain/doctor_summary.dart';
import 'package:patient360_mobile/features/appointments/presentation/appointments_screen.dart';
import 'package:patient360_mobile/features/appointments/presentation/booking_flow_sheet.dart';
import 'package:patient360_mobile/features/appointments/presentation/cancel_sheet.dart';
import 'package:patient360_mobile/features/appointments/presentation/providers/booking_flow_provider.dart';

class _FakeRepo extends AppointmentsRepository {
  _FakeRepo(this._results) : super(Dio());

  final List<Appointment> _results;

  @override
  Future<List<Appointment>> getAppointments({String? statusGroup}) async =>
      _results;

  @override
  Future<Appointment> cancelAppointment(
    String id, {
    required String cancellationReason,
  }) async {
    // Not exercised by these tests; hitting the network would throw.
    throw UnimplementedError();
  }
}

Appointment _apt({
  required String id,
  required String reason,
  required String status,
}) {
  return Appointment(
    id: id,
    appointmentType: 'doctor',
    appointmentDate: DateTime(2026, 5, 1),
    appointmentTime: '10:30',
    reasonForVisit: reason,
    status: status,
    bookingMethod: 'mobile_app',
    priority: 'routine',
    paymentStatus: 'pending',
    createdAt: DateTime(2026, 4, 20),
    updatedAt: DateTime(2026, 4, 20),
  );
}

/// Forces the wizard to start on step 3 with an empty reason so we can
/// assert the confirm button is disabled.
class _ConfirmStartController extends BookingFlowController {
  @override
  BookingFlowState build() {
    return BookingFlowState(
      step: BookingStep.confirm,
      selectedDoctor: const DoctorSummary(
        id: 'd-1',
        firstName: 'سامي',
        lastName: 'المصري',
        specialization: 'cardiology',
      ),
      selectedSlot: AvailabilitySlot(
        id: 's-1',
        date: DateTime(2026, 5, 1),
        startTime: '10:00',
        endTime: '10:30',
      ),
    );
  }
}

Widget _host({
  required Widget child,
  required List<Object> overrides,
  bool wrapInScaffold = false,
}) {
  return ProviderScope(
    overrides: overrides.cast(),
    child: MaterialApp(
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
      home: wrapInScaffold ? Scaffold(body: child) : child,
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

  testWidgets('tabs switch between upcoming, past, and cancelled buckets',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final _FakeRepo repo = _FakeRepo(<Appointment>[
      _apt(id: '1', reason: 'كشف قلب', status: 'scheduled'),
      _apt(id: '2', reason: 'نتيجة فحص', status: 'completed'),
      _apt(id: '3', reason: 'موعد ملغى', status: 'cancelled'),
    ]);

    await tester.pumpWidget(
      _host(
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
          appointmentsRepositoryProvider.overrideWithValue(repo),
        ],
        child: const AppointmentsScreen(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // Default tab is upcoming → only the scheduled row is visible.
    expect(find.text('كشف قلب'), findsOneWidget);
    expect(find.text('نتيجة فحص'), findsNothing);
    expect(find.text('موعد ملغى'), findsNothing);

    await tester.tap(find.text('السابقة'));
    await tester.pump();
    expect(find.text('كشف قلب'), findsNothing);
    expect(find.text('نتيجة فحص'), findsOneWidget);
    expect(find.text('موعد ملغى'), findsNothing);

    await tester.tap(find.text('الملغاة'));
    await tester.pump();
    expect(find.text('كشف قلب'), findsNothing);
    expect(find.text('نتيجة فحص'), findsNothing);
    expect(find.text('موعد ملغى'), findsOneWidget);
  });

  testWidgets('cancel sheet renders all 5 cancellation-reason radios',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      _host(
        wrapInScaffold: true,
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
        ],
        child: CancelSheet(
          appointment: _apt(id: '1', reason: 'كشف قلب', status: 'scheduled'),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('طلب المريض'), findsOneWidget);
    expect(find.text('الطبيب غير متاح'), findsOneWidget);
    expect(find.text('حالة طارئة'), findsOneWidget);
    expect(find.text('موعد مكرر'), findsOneWidget);
    expect(find.text('سبب آخر'), findsOneWidget);
    expect(find.byType(RadioListTile<String>), findsNWidgets(5));
  });

  testWidgets('booking confirm button disabled when reasonForVisit is empty',
      (WidgetTester tester) async {
    // A wider viewport keeps the two footer buttons out of horizontal overflow.
    tester.view.physicalSize = const Size(560, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    final SharedPreferences prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      _host(
        wrapInScaffold: true,
        overrides: <Object>[
          sharedPreferencesProvider.overrideWithValue(prefs),
          bookingFlowProvider.overrideWith(_ConfirmStartController.new),
        ],
        child: const BookingFlowSheet(),
      ),
    );
    // Pump enough frames for the listener to animate to the confirm page.
    for (int i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 80));
    }

    final Finder confirmFinder =
        find.widgetWithText(ElevatedButton, 'تأكيد الحجز');
    expect(confirmFinder, findsOneWidget);
    final ElevatedButton confirmBtn =
        tester.widget<ElevatedButton>(confirmFinder);
    expect(
      confirmBtn.onPressed,
      isNull,
      reason: 'Expected confirm button to be disabled when reason is empty',
    );
  });
}
