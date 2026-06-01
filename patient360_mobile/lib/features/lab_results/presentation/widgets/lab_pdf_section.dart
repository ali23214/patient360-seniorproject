// ════════════════════════════════════════════════════════════════════════════
//  LabPdfSection
//  ──────────────────────────────────────────────────────────────────────────
//  Card with a CTA button to open the lab's PDF report in the device's
//  browser/PDF viewer. Mirrors the web's `.dpg-card` + Download button.
//
//  The PDF URL from MongoDB is a relative path (e.g. /uploads/lab/123.pdf);
//  we prefix it with the backend base URL before launching.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/config/env.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import 'lab_info_section.dart' show LabSectionHeader;

class LabPdfSection extends StatelessWidget {
  const LabPdfSection({super.key, required this.relativeUrl});

  /// MongoDB-stored relative path (e.g. `/uploads/lab/result_xxx.pdf`).
  final String relativeUrl;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const LabSectionHeader(
            icon: LucideIcons.fileText,
            title: 'تقرير المختبر (PDF)',
          ),
          const SizedBox(height: 12),
          const Text(
            'يمكنك تنزيل التقرير الكامل للتحليل بصيغة PDF.',
            style: TextStyle(
              fontSize: 13,
              color: AppColors.textSecondary,
              fontFamily: 'Cairo',
              height: 1.5,
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: _PdfButton(relativeUrl: relativeUrl),
          ),
        ],
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Action button — opens the PDF via url_launcher.
// ────────────────────────────────────────────────────────────────────────────

class _PdfButton extends StatefulWidget {
  const _PdfButton({required this.relativeUrl});

  final String relativeUrl;

  @override
  State<_PdfButton> createState() => _PdfButtonState();
}

class _PdfButtonState extends State<_PdfButton> {
  bool _loading = false;

  Future<void> _openPdf() async {
    if (_loading) return;
    setState(() => _loading = true);
    try {
      final String base = Env.apiBaseUrl.replaceFirst(RegExp(r'/api/?$'), '');
      final String full = widget.relativeUrl.startsWith('http')
          ? widget.relativeUrl
          : '$base${widget.relativeUrl}';
      final Uri uri = Uri.parse(full);

      final bool launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تعذّر فتح التقرير. حاول مرة أخرى.')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('حدث خطأ أثناء فتح التقرير.')),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.action,
      borderRadius: AppRadii.radiusMd,
      child: InkWell(
        borderRadius: AppRadii.radiusMd,
        onTap: _loading ? null : _openPdf,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              if (_loading)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                )
              else
                const Icon(LucideIcons.download, size: 18, color: Colors.white),
              const SizedBox(width: 8),
              const Text(
                'تنزيل تقرير PDF',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
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
