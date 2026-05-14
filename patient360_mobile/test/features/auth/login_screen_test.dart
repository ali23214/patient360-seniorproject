import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:patient360_mobile/core/storage/secure_storage.dart';
import 'package:patient360_mobile/features/auth/presentation/login_screen.dart';

class _InMemorySecureStorage extends SecureStorage {
  _InMemorySecureStorage() : super(const FlutterSecureStorage());

  @override
  Future<String?> read(String key) async => null;

  @override
  Future<void> write(String key, String value) async {}

  @override
  Future<void> delete(String key) async {}

  @override
  Future<void> clearAuth() async {}
}

Widget _host(Widget child) {
  return ProviderScope(
    overrides: [
      secureStorageProvider.overrideWithValue(_InMemorySecureStorage()),
    ],
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
      home: child,
    ),
  );
}

void main() {
  setUpAll(() {
    dotenv.testLoad(fileInput: 'API_BASE_URL=http://localhost:5000/api\n');
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('requires both email and password before submitting',
      (WidgetTester tester) async {
    await tester.pumpWidget(_host(const LoginScreen()));
    // One pump is enough — runtime font fetching is disabled, so the first
    // frame contains the real widget tree.
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'تسجيل الدخول'));
    await tester.pump();

    expect(find.text('الرجاء إدخال البريد الإلكتروني'), findsOneWidget);
    expect(find.text('الرجاء إدخال كلمة المرور'), findsOneWidget);
  });
}
