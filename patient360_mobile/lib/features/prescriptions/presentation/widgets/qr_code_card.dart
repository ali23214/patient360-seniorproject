import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';

/// QR + tap-to-copy 6-digit verification block. Hidden by the parent when a
/// prescription is fully dispensed — passing values through here keeps the
/// component pure and visually identical to the web's pharmacist scan card.
class QrCodeCard extends StatelessWidget {
  const QrCodeCard({
    required this.qrCode,
    required this.verificationCode,
    super.key,
  });

  final String qrCode;
  final String? verificationCode;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          Row(
            children: <Widget>[
              const Icon(
                LucideIcons.shieldCheck,
                size: 18,
                color: AppColors.action,
              ),
              const SizedBox(width: 6),
              Text(
                'رمز التحقق للصيدلية',
                style: text.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: AppRadii.radiusMd,
              border: Border.all(color: scheme.outline),
            ),
            child: QrImageView(
              data: qrCode,
              size: 200,
              backgroundColor: Colors.white,
              eyeStyle: const QrEyeStyle(
                eyeShape: QrEyeShape.square,
                color: AppColors.primary,
              ),
              dataModuleStyle: const QrDataModuleStyle(
                dataModuleShape: QrDataModuleShape.square,
                color: AppColors.primary,
              ),
            ),
          ),
          if (verificationCode != null && verificationCode!.isNotEmpty) ...<Widget>[
            const SizedBox(height: 14),
            _CopyableCode(code: verificationCode!),
          ],
          const SizedBox(height: 12),
          Text(
            'اعرض هذا الرمز على الصيدلي لصرف الوصفة',
            style: text.bodySmall?.copyWith(
              color: scheme.onSurfaceVariant,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _CopyableCode extends StatelessWidget {
  const _CopyableCode({required this.code});
  final String code;

  Future<void> _copy(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: code));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('تم النسخ'),
        behavior: SnackBarBehavior.floating,
        duration: Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: AppRadii.radiusMd,
      onTap: () => _copy(context),
      child: Padding(
        padding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text(
              code,
              textDirection: TextDirection.ltr,
              style: const TextStyle(
                fontFamily: 'Inter',
                fontWeight: FontWeight.w700,
                fontSize: 28,
                letterSpacing: 4,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: 8),
            const Icon(
              LucideIcons.copy,
              size: 18,
              color: AppColors.action,
            ),
          ],
        ),
      ),
    );
  }
}
