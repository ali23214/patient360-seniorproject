import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:patient360_mobile/core/theme/theme_controller.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  test('toggle flips ThemeMode system -> light -> dark -> system', () async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final ProviderContainer container = ProviderContainer(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
      ],
    );
    addTearDown(container.dispose);

    // Initial state — nothing persisted, defaults to system.
    expect(container.read(themeControllerProvider), ThemeMode.system);

    await container.read(themeControllerProvider.notifier).toggle();
    expect(container.read(themeControllerProvider), ThemeMode.light);
    expect(prefs.getString('p360.themeMode'), 'light');

    await container.read(themeControllerProvider.notifier).toggle();
    expect(container.read(themeControllerProvider), ThemeMode.dark);
    expect(prefs.getString('p360.themeMode'), 'dark');

    await container.read(themeControllerProvider.notifier).toggle();
    expect(container.read(themeControllerProvider), ThemeMode.system);
    expect(prefs.getString('p360.themeMode'), 'system');
  });

  test('setMode persists the chosen ThemeMode verbatim', () async {
    final SharedPreferences prefs = await SharedPreferences.getInstance();
    final ProviderContainer container = ProviderContainer(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
      ],
    );
    addTearDown(container.dispose);

    await container
        .read(themeControllerProvider.notifier)
        .setMode(ThemeMode.dark);

    expect(container.read(themeControllerProvider), ThemeMode.dark);
    expect(prefs.getString('p360.themeMode'), 'dark');
  });
}
