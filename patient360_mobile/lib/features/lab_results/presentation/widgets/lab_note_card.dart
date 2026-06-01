// ════════════════════════════════════════════════════════════════════════════
//  LabNoteCard
//  ──────────────────────────────────────────────────────────────────────────
//  Generic single-section card used for both:
//    • ملاحظات المختبر  (status=completed with labNotes)
//    • سبب الرفض         (status=rejected with rejectionReason)
//
//  Mirrors `.dpg-card` + `.dpg-card-text` from the web.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import 'lab_info_section.dart' show LabSectionHeader;

class LabNoteCard extends StatelessWidget {
  const LabNoteCard({
    super.key,
    required this.title,
    required this.body,
    this.icon = LucideIcons.fileText,
    this.danger = false,
  });

  final String title;
  final String body;
  final IconData icon;

  /// When true, renders with a soft red tint — used for "سبب الرفض".
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final Color bg = danger ? const Color(0xFFFFF5F5) : AppColors.card;
    final Color borderColor =
        danger ? const Color(0xFFFFCDD2) : AppColors.border;
    final Color textColor =
        danger ? const Color(0xFFC62828) : AppColors.textPrimary;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          LabSectionHeader(icon: icon, title: title),
          const SizedBox(height: 10),
          Text(
            body.trim().isEmpty ? '—' : body,
            style: TextStyle(
              fontSize: 13,
              color: textColor,
              fontFamily: 'Cairo',
              height: 1.6,
            ),
          ),
        ],
      ),
    );
  }
}
