import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';
import 'app_radii.dart';
import 'app_typography.dart';

/// Factory methods producing the light and dark [ThemeData] for the app.
///
/// All colors and shapes derive from the Teal Medica tokens so the web
/// dashboard and the mobile app stay visually consistent.
final class AppTheme {
  const AppTheme._();

  static ThemeData lightTheme() => _build(Brightness.light);

  static ThemeData darkTheme() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final ColorScheme scheme = AppColors.scheme(brightness);
    final ThemeData base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      brightness: brightness,
    );

    final TextTheme textTheme = AppTypography.cairoTextTheme(base.textTheme);

    return base.copyWith(
      scaffoldBackgroundColor: scheme.surface,
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      canvasColor: scheme.surface,
      dividerColor: scheme.outline,
      cardTheme: CardThemeData(
        color: scheme.surfaceContainer,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.radiusLg,
          side: BorderSide(color: scheme.outline),
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: GoogleFonts.cairo(
          fontWeight: FontWeight.w700,
          fontSize: 18,
          color: scheme.onSurface,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainer,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: AppRadii.radiusMd,
          borderSide: BorderSide(color: scheme.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadii.radiusMd,
          borderSide: BorderSide(color: scheme.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AppRadii.radiusMd,
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: AppRadii.radiusMd,
          borderSide: BorderSide(color: scheme.error),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: scheme.secondary,
          foregroundColor: scheme.onSecondary,
          minimumSize: const Size.fromHeight(48),
          shape: const RoundedRectangleBorder(borderRadius: AppRadii.radiusMd),
          textStyle: GoogleFonts.cairo(fontWeight: FontWeight.w600),
          elevation: 0,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: scheme.primary,
          minimumSize: const Size.fromHeight(48),
          side: BorderSide(color: scheme.outline),
          shape: const RoundedRectangleBorder(borderRadius: AppRadii.radiusMd),
          textStyle: GoogleFonts.cairo(fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: scheme.primary,
          textStyle: GoogleFonts.cairo(fontWeight: FontWeight.w600),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: scheme.surfaceContainerHighest,
        selectedColor: scheme.secondary,
        side: BorderSide(color: scheme.outline),
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.radiusSm),
        labelStyle: GoogleFonts.cairo(
          fontWeight: FontWeight.w500,
          color: scheme.onSurface,
        ),
        secondaryLabelStyle: GoogleFonts.cairo(
          fontWeight: FontWeight.w500,
          color: scheme.onSecondary,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: scheme.primary,
        contentTextStyle: GoogleFonts.cairo(
          color: scheme.onPrimary,
          fontWeight: FontWeight.w500,
        ),
        behavior: SnackBarBehavior.floating,
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.radiusMd),
      ),
    );
  }
}
