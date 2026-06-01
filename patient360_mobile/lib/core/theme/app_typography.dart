import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Typography tokens (Part C.4). Cairo is the default for Arabic content;
/// Inter is reserved for numeric-LTR fields via [numericStyle].
final class AppTypography {
  const AppTypography._();

  /// Returns a Cairo-based [TextTheme] layered on top of [base].
  static TextTheme cairoTextTheme(TextTheme base) {
    return GoogleFonts.cairoTextTheme(base).copyWith(
      displayLarge: GoogleFonts.cairo(
        textStyle: base.displayLarge,
        fontWeight: FontWeight.w700,
      ),
      headlineLarge: GoogleFonts.cairo(
        textStyle: base.headlineLarge,
        fontWeight: FontWeight.w700,
        fontSize: 22,
      ),
      headlineMedium: GoogleFonts.cairo(
        textStyle: base.headlineMedium,
        fontWeight: FontWeight.w700,
        fontSize: 20,
      ),
      titleLarge: GoogleFonts.cairo(
        textStyle: base.titleLarge,
        fontWeight: FontWeight.w600,
        fontSize: 18,
      ),
      titleMedium: GoogleFonts.cairo(
        textStyle: base.titleMedium,
        fontWeight: FontWeight.w600,
        fontSize: 16,
      ),
      titleSmall: GoogleFonts.cairo(
        textStyle: base.titleSmall,
        fontWeight: FontWeight.w500,
        fontSize: 14,
      ),
      bodyLarge: GoogleFonts.cairo(
        textStyle: base.bodyLarge,
        fontWeight: FontWeight.w400,
        fontSize: 15,
      ),
      bodyMedium: GoogleFonts.cairo(
        textStyle: base.bodyMedium,
        fontWeight: FontWeight.w400,
        fontSize: 14,
      ),
      bodySmall: GoogleFonts.cairo(
        textStyle: base.bodySmall,
        fontWeight: FontWeight.w500,
        fontSize: 12,
      ),
      labelLarge: GoogleFonts.cairo(
        textStyle: base.labelLarge,
        fontWeight: FontWeight.w600,
        fontSize: 14,
      ),
      labelMedium: GoogleFonts.cairo(
        textStyle: base.labelMedium,
        fontWeight: FontWeight.w500,
        fontSize: 13,
      ),
      labelSmall: GoogleFonts.cairo(
        textStyle: base.labelSmall,
        fontWeight: FontWeight.w500,
        fontSize: 11,
      ),
    );
  }

  /// Inter font for numeric-LTR contexts (IDs, phone numbers, counts).
  static TextStyle numericStyle(double size, FontWeight weight) {
    return GoogleFonts.inter(fontSize: size, fontWeight: weight);
  }
}
