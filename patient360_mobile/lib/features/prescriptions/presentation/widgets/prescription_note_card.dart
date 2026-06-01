// ════════════════════════════════════════════════════════════════════════════
//  PrescriptionNoteCard
//  ──────────────────────────────────────────────────────────────────────────
//  Generic single-section card used to display the prescription's notes.
//  Mirrors `.dpg-card` + `.dpg-card-text`.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import 'prescription_info_section.dart' show PrescriptionSectionHeader;

class PrescriptionNoteCard extends StatelessWidget {
  const PrescriptionNoteCard({super.key, required this.body});

  final String body;

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
          const PrescriptionSectionHeader(
            icon: LucideIcons.fileText,
            title: 'ملاحظات',
          ),
          const SizedBox(height: 10),
          Text(
            body.trim().isEmpty ? '—' : body,
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.textPrimary,
              fontFamily: 'Cairo',
              height: 1.6,
            ),
          ),
        ],
      ),
    );
  }
}
