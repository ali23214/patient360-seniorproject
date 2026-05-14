import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:patient360_mobile/features/auth/domain/auth_session.dart';
import 'package:patient360_mobile/features/auth/domain/patient_profile.dart';
import 'package:patient360_mobile/features/auth/domain/person.dart';
import 'package:patient360_mobile/features/auth/domain/user.dart';
import 'package:patient360_mobile/features/profile/presentation/profile_edit_sheet.dart';

AuthSession _session({
  String phoneNumber = '0991234567',
  String address = 'دمشق، حي المالكي',
  String city = 'دمشق',
}) {
  final Person person = Person(
    id: 'person-1',
    nationalId: '12345678901',
    firstName: 'أنس',
    fatherName: 'محمد',
    lastName: 'النابلسي',
    motherName: 'فاطمة',
    dateOfBirth: DateTime(1995, 5, 1),
    gender: 'male',
    governorate: 'damascus',
    city: city,
    address: address,
    phoneNumber: phoneNumber,
  );
  return AuthSession(
    jwt: 'jwt',
    user: const User(
      id: 'acct-1',
      email: 'a@b.c',
      roles: <String>['patient'],
      personId: 'person-1',
    ),
    patient: const PatientProfile(),
    isMinor: false,
    person: person,
  );
}

/// Mounts [ProfileEditSheet.show] via the standard `showModalBottomSheet`
/// flow so [DraggableScrollableSheet] has a valid parent. Returns once the
/// sheet animation has settled.
Future<void> _openSheet(WidgetTester tester, AuthSession session) async {
  await tester.pumpWidget(
    ProviderScope(
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
        home: Scaffold(
          body: Builder(
            builder: (BuildContext ctx) => ElevatedButton(
              onPressed: () => ProfileEditSheet.show(ctx, session),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  // Pump a few frames so the modal animates in. Using explicit pumps
  // instead of pumpAndSettle because the [DraggableScrollableSheet]
  // installs a never-completing position controller in some test envs.
  for (int i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

/// Resolves the save button in the rendered sheet. `ElevatedButton.icon`
/// creates a private subclass — finding by `ButtonStyleButton` (the
/// rendered ancestor) is the canonical way to read its `onPressed`.
ButtonStyleButton _saveButton(WidgetTester tester) {
  final Finder text = find.descendant(
    of: find.byType(ProfileEditSheet),
    matching: find.text('حفظ'),
  );
  expect(text, findsOneWidget);
  final Finder ancestor = find.ancestor(
    of: text,
    matching: find.byWidgetPredicate((Widget w) => w is ButtonStyleButton),
  );
  expect(ancestor, findsWidgets);
  return tester.widget<ButtonStyleButton>(ancestor.first);
}

void main() {
  setUpAll(() {
    dotenv.testLoad(fileInput: 'API_BASE_URL=http://localhost:5000/api\n');
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('save button is disabled when phoneNumber is empty',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    await _openSheet(tester, _session(phoneNumber: ''));

    final ButtonStyleButton btn = _saveButton(tester);
    expect(
      btn.onPressed,
      isNull,
      reason: 'save should be disabled when phoneNumber is empty',
    );
  });

  testWidgets('save button is enabled when required fields are filled',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    await _openSheet(tester, _session());

    final ButtonStyleButton btn = _saveButton(tester);
    expect(btn.onPressed, isNotNull);
  });

  testWidgets(
      'save becomes disabled if user clears phone in an otherwise filled form',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(411, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);

    await _openSheet(tester, _session());

    // The phone field is the first TextField rendered in the contact
    // section — clearing it should immediately disable the save action.
    final Finder allFields = find.descendant(
      of: find.byType(ProfileEditSheet),
      matching: find.byType(TextField),
    );
    expect(allFields, findsWidgets);
    await tester.enterText(allFields.first, '');
    await tester.pump();

    final ButtonStyleButton btn = _saveButton(tester);
    expect(btn.onPressed, isNull);
  });
}
