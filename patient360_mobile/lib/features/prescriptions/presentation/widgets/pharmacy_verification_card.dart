// ════════════════════════════════════════════════════════════════════════════
//  PharmacyVerificationCard
//  ──────────────────────────────────────────────────────────────────────────
//  The "show this to the pharmacist" card. Only renders for prescriptions
//  that still have a usable verification code — i.e. not yet fully
//  dispensed and not expired/cancelled.
//
//  Visually mirrors the web's verification card (turquoise surface, QR
//  badge on the right, 6-digit code in the dashed box on the left).
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';

class PharmacyVerificationCard extends StatelessWidget {
  const PharmacyVerificationCard({super.key, required this.verificationCode});

  final String verificationCode;

  @override
  Widget build(BuildContext context) {
    final String code = verificationCode.trim();
    final String displayCode = _spaceDigits(code);

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // ── Header ───────────────────────────────────────────────
          const Row(
            children: <Widget>[
              Icon(LucideIcons.shieldCheck, size: 18, color: AppColors.action),
              SizedBox(width: 8),
              Text(
                'رمز التحقق للصيدلية',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primary,
                  fontFamily: 'Cairo',
                  height: 1.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // ── QR badge + code box ──────────────────────────────────
          // IntrinsicHeight gives the Row a bounded vertical extent so
          // crossAxisAlignment.stretch can match both children to the
          // taller one's height. Without it, the Row would inherit the
          // ListView's infinite height constraint and crash with
          // "BoxConstraints forces an infinite height".
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                _QrBadge(onTap: () => _showQrPreview(context, code)),
                const SizedBox(width: 12),
                Expanded(
                  child: _CodeBox(text: displayCode, copyValue: code),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // ── Hint ─────────────────────────────────────────────────
          const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Icon(LucideIcons.info, size: 14, color: AppColors.textSecondary),
              SizedBox(width: 6),
              Expanded(
                child: Text(
                  'أبرز هذا الرمز للصيدلي عند صرف الوصفة.',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                    fontFamily: 'Cairo',
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Inserts a thin space between every digit so the 6-digit code reads
  /// as `4 7 0 9 5 5` (matches the web layout).
  static String _spaceDigits(String s) =>
      s.split('').join(String.fromCharCode(0x2009)); // thin space

  void _showQrPreview(BuildContext context, String code) {
    showDialog<void>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('رمز QR'),
        content: SizedBox(
          width: 220,
          height: 220,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Container(
                  width: 180,
                  height: 180,
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: AppRadii.radiusMd,
                    border: Border.all(color: AppColors.border),
                  ),
                  alignment: Alignment.center,
                  child: const Icon(
                    LucideIcons.qrCode,
                    size: 100,
                    color: AppColors.action,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  code,
                  textDirection: TextDirection.ltr,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary,
                    fontFamily: 'Inter',
                    letterSpacing: 4,
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('إغلاق'),
          ),
        ],
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Left-side QR badge
// ────────────────────────────────────────────────────────────────────────────

class _QrBadge extends StatelessWidget {
  const _QrBadge({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
      borderRadius: AppRadii.radiusMd,
      child: InkWell(
        borderRadius: AppRadii.radiusMd,
        onTap: onTap,
        child: Container(
          width: 80,
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          decoration: BoxDecoration(
            borderRadius: AppRadii.radiusMd,
            border: Border.all(color: AppColors.border),
          ),
          child: const Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              Icon(LucideIcons.shieldCheck, size: 28, color: AppColors.action),
              SizedBox(height: 6),
              Text(
                'رمز QR',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: AppColors.action,
                  fontFamily: 'Cairo',
                  height: 1.0,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Dashed-border code display, tap-to-copy
// ────────────────────────────────────────────────────────────────────────────

class _CodeBox extends StatelessWidget {
  const _CodeBox({required this.text, required this.copyValue});

  final String text;
  final String copyValue;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
      borderRadius: AppRadii.radiusMd,
      child: InkWell(
        borderRadius: AppRadii.radiusMd,
        onTap: () async {
          await Clipboard.setData(ClipboardData(text: copyValue));
          if (!context.mounted) return;
          ScaffoldMessenger.of(context).removeCurrentSnackBar();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('تم نسخ رمز التحقق'),
              duration: Duration(seconds: 2),
              behavior: SnackBarBehavior.floating,
            ),
          );
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 18),
          decoration: BoxDecoration(
            borderRadius: AppRadii.radiusMd,
            // The web uses a dashed border. Flutter doesn't ship a dashed
            // border for arbitrary shapes; the closest production-grade
            // approximation is a thicker solid stroke in the same color.
            // CustomPainter dashes are an option but add render cost for
            // every rebuild — not worth it here.
            border: Border.all(color: AppColors.action, width: 1.5),
          ),
          alignment: Alignment.center,
          child: Text(
            text,
            textDirection: TextDirection.ltr,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: AppColors.primary,
              fontFamily: 'Inter',
              letterSpacing: 2,
              height: 1.0,
            ),
          ),
        ),
      ),
    );
  }
}
