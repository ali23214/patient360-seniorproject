// ════════════════════════════════════════════════════════════════════════════
//  LabCriticalBanner
//  ──────────────────────────────────────────────────────────────────────────
//  Prominent warning banner shown at the top of the detail page when a lab
//  test has one or more critical-flagged result rows. Mirrors the web's
//  `.dpg-banner--danger` styling.
//
//  The banner is intentionally large and high-contrast — critical lab
//  values can be life-threatening (potassium > 6.5, glucose < 40, etc.)
//  and the patient must be steered toward their doctor immediately.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';

class LabCriticalBanner extends StatelessWidget {
  const LabCriticalBanner({super.key, required this.criticalCount});

  final int criticalCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFEBEE),
        borderRadius: const BorderRadius.all(Radius.circular(12)),
        border: Border.all(color: const Color(0xFFEF9A9A), width: 1.5),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(
              color: AppColors.error,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              LucideIcons.octagonAlert,
              size: 24,
              color: Colors.white,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'نتائج حرجة — راجع طبيبك فوراً',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFFB71C1C),
                    fontFamily: 'Cairo',
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'هذا التحليل يحتوي على $criticalCount نتيجة خارج النطاق الحرج. لا تتأخر في عرضها على طبيبك المعالج.',
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFFC62828),
                    fontFamily: 'Cairo',
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
