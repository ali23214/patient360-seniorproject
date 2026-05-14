import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/config/env.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/utils/logger.dart';

/// Outlined CTA that opens the result PDF in the OS default viewer.
///
/// We deliberately do NOT embed an in-app PDF viewer in v1 — that would
/// add `flutter_pdfview` and a few MB of native libs. Falling back to the
/// system viewer keeps the bundle small and gives the patient any
/// accessibility tooling they already trust (zoom, share, print).
class PdfOpener extends StatelessWidget {
  const PdfOpener({required this.resultPdfUrl, super.key});

  /// Backend-relative path (e.g. `/uploads/lab/abc.pdf`). Joined with the
  /// API base URL before launching.
  final String resultPdfUrl;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: () => _open(context),
      icon: const Icon(LucideIcons.download, size: 18),
      label: const Text('فتح التقرير الكامل (PDF)'),
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.action,
        side: const BorderSide(color: AppColors.action),
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.radiusMd),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      ),
    );
  }

  Future<void> _open(BuildContext context) async {
    final Uri uri = _resolveUri(resultPdfUrl);
    final ScaffoldMessengerState? messenger =
        ScaffoldMessenger.maybeOf(context);
    try {
      final bool launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched) {
        messenger?.showSnackBar(
          const SnackBar(content: Text('تعذر فتح التقرير. حاول مرة أخرى.')),
        );
      }
    } catch (e, st) {
      appLogger.w('pdf launch failed', error: e, stackTrace: st);
      messenger?.showSnackBar(
        const SnackBar(content: Text('تعذر فتح التقرير. حاول مرة أخرى.')),
      );
    }
  }

  /// Joins [path] with the API base URL. Absolute http(s) URLs are passed
  /// through unchanged (defensive — should rarely happen since the backend
  /// stores relative paths).
  static Uri _resolveUri(String path) {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return Uri.parse(path);
    }
    final String base = Env.apiBaseUrl;
    // The base ends with `/api`. Lab PDFs are typically stored under
    // `/uploads/...` (sibling of `/api`), so we trim the suffix.
    final String origin = base.endsWith('/api')
        ? base.substring(0, base.length - '/api'.length)
        : base;
    final String joined = path.startsWith('/') ? '$origin$path' : '$origin/$path';
    return Uri.parse(joined);
  }
}
