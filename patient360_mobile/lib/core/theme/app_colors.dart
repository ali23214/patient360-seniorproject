import 'package:flutter/material.dart';

/// Teal Medica color tokens mirroring PatientDashboard.css.
///
/// Every token in Part C.1 (light) and C.2 (dark) of the project brief is
/// represented here. Use [AppColors.scheme] to obtain a [ColorScheme] wired up
/// to these tokens for a given [Brightness].
final class AppColors {
  const AppColors._();

  // ─── Light mode (Part C.1) ─────────────────────────────────────────────
  static const Color primary = Color(0xFF0D3B3E);
  static const Color action = Color(0xFF00897B);
  static const Color accent = Color(0xFF4DB6AC);
  static const Color surface = Color(0xFFE0F2F1);
  static const Color background = Color(0xFFF5FAFA);
  static const Color card = Color(0xFFFFFFFF);
  static const Color drawer = Color(0xFF0D3B3E);
  static const Color error = Color(0xFFD32F2F);
  static const Color warning = Color(0xFFF57C00);
  static const Color success = Color(0xFF388E3C);
  static const Color textPrimary = Color(0xFF0D3B3E);
  static const Color textSecondary = Color(0xFF546E7A);
  static const Color border = Color(0xFFB2DFDB);

  // ─── Dark mode (Part C.2) ──────────────────────────────────────────────
  static const Color primaryDark = Color(0xFF4DB6AC);
  static const Color actionDark = Color(0xFF4DB6AC);
  static const Color accentDark = Color(0xFF80CBC4);
  static const Color surfaceDark = Color(0xFF1A2F31);
  static const Color backgroundDark = Color(0xFF0F1F21);
  static const Color cardDark = Color(0xFF162628);
  static const Color drawerDark = Color(0xFF0D1E20);
  static const Color textPrimaryDark = Color(0xFFE0F2F1);
  static const Color textSecondaryDark = Color(0xFF90A4AE);
  static const Color borderDark = Color(0xFF2A4A4D);

  /// Build a Material 3 [ColorScheme] from the palette tokens.
  static ColorScheme scheme(Brightness brightness) {
    if (brightness == Brightness.dark) {
      return const ColorScheme(
        brightness: Brightness.dark,
        primary: primaryDark,
        onPrimary: backgroundDark,
        secondary: actionDark,
        onSecondary: backgroundDark,
        tertiary: accentDark,
        onTertiary: backgroundDark,
        surface: backgroundDark,
        onSurface: textPrimaryDark,
        surfaceContainerHighest: surfaceDark,
        surfaceContainer: cardDark,
        onSurfaceVariant: textSecondaryDark,
        outline: borderDark,
        error: error,
        onError: Color(0xFFFFFFFF),
      );
    }
    return const ColorScheme(
      brightness: Brightness.light,
      primary: primary,
      onPrimary: Color(0xFFFFFFFF),
      secondary: action,
      onSecondary: Color(0xFFFFFFFF),
      tertiary: accent,
      onTertiary: primary,
      surface: background,
      onSurface: textPrimary,
      surfaceContainerHighest: surface,
      surfaceContainer: card,
      onSurfaceVariant: textSecondary,
      outline: border,
      error: error,
      onError: Color(0xFFFFFFFF),
    );
  }
}
