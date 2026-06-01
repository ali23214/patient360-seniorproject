import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../utils/logger.dart';

const String _themeModeKey = 'p360.themeMode';

/// Overridden at app start-up with a pre-loaded [SharedPreferences] so the
/// theme controller can resolve its initial value synchronously inside its
/// [Notifier.build].
final Provider<SharedPreferences> sharedPreferencesProvider =
    Provider<SharedPreferences>(
  (Ref ref) => throw StateError(
    'sharedPreferencesProvider has not been overridden. Pass the preloaded '
    'instance into ProviderScope.overrides in main().',
  ),
);

/// Single source of truth for the app's current [ThemeMode]. Persists the
/// user's choice to shared_preferences under [_themeModeKey]. Defaults to
/// [ThemeMode.system] on first launch or when the stored value is corrupt.
class ThemeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    final SharedPreferences prefs = ref.watch(sharedPreferencesProvider);
    return _decode(prefs.getString(_themeModeKey));
  }

  Future<void> setMode(ThemeMode mode) async {
    state = mode;
    final SharedPreferences prefs = ref.read(sharedPreferencesProvider);
    try {
      await prefs.setString(_themeModeKey, _encode(mode));
    } catch (e, st) {
      appLogger.w('failed to persist theme mode', error: e, stackTrace: st);
    }
  }

  /// Cycles system → light → dark → system, matching the web toggle behavior.
  Future<void> toggle() async {
    final ThemeMode next = switch (state) {
      ThemeMode.system => ThemeMode.light,
      ThemeMode.light => ThemeMode.dark,
      ThemeMode.dark => ThemeMode.system,
    };
    await setMode(next);
  }
}

final NotifierProvider<ThemeController, ThemeMode> themeControllerProvider =
    NotifierProvider<ThemeController, ThemeMode>(ThemeController.new);

ThemeMode _decode(String? raw) {
  return switch (raw) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };
}

String _encode(ThemeMode mode) {
  return switch (mode) {
    ThemeMode.light => 'light',
    ThemeMode.dark => 'dark',
    ThemeMode.system => 'system',
  };
}
