import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:patient360_mobile/app.dart';
import 'package:patient360_mobile/core/storage/secure_storage.dart';
import 'package:patient360_mobile/core/theme/theme_controller.dart';

class _InMemorySecureStorage extends SecureStorage {
  _InMemorySecureStorage() : super(const FlutterSecureStorage());

  final Map<String, String> _data = <String, String>{};

  @override
  Future<String?> read(String key) async => _data[key];

  @override
  Future<void> write(String key, String value) async {
    _data[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    _data.remove(key);
  }

  @override
  Future<void> clearAuth() async {
    _data
      ..remove(SecureStorageKeys.jwt)
      ..remove(SecureStorageKeys.user);
  }
}

void main() {
  setUpAll(() {
    dotenv.testLoad(
      fileInput: 'API_BASE_URL=http://localhost:5000/api\n',
    );
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  testWidgets('boots into the login screen when no session is stored',
      (WidgetTester tester) async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          secureStorageProvider.overrideWithValue(_InMemorySecureStorage()),
          sharedPreferencesProvider.overrideWithValue(prefs),
        ],
        child: const Patient360App(),
      ),
    );
    // Pump a few frames: one for mount, one for the initial AsyncValue,
    // one for the router's redirect to /login.
    for (int i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }

    expect(find.text('تسجيل الدخول'), findsWidgets);
    expect(find.text('مريض 360°'), findsOneWidget);

    final Directionality directionality = tester.widget<Directionality>(
      find
          .byWidgetPredicate(
            (Widget w) =>
                w is Directionality && w.textDirection == TextDirection.rtl,
          )
          .first,
    );
    expect(directionality.textDirection, TextDirection.rtl);
  });
}
