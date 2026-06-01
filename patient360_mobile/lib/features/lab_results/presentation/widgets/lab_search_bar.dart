// ════════════════════════════════════════════════════════════════════════════
//  LabSearchBar
//  ──────────────────────────────────────────────────────────────────────────
//  Search input matching the web's `.pdmr-search` styling. Filters by:
//    • testNumber
//    • labNotes
//    • doctor name
//    • laboratory name
//
//  Renders a leading search icon (LTR position, hidden in RTL via the
//  inner Padding), and an inline X button to clear the query when set.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';

class LabSearchBar extends StatelessWidget {
  const LabSearchBar({
    super.key,
    required this.controller,
    required this.onChanged,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final bool hasText = controller.text.isNotEmpty;

    return Container(
      height: 44,
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: const BorderRadius.all(Radius.circular(12)),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: <Widget>[
          const SizedBox(width: 12),
          const Icon(LucideIcons.search,
              size: 18, color: AppColors.textSecondary),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              textDirection: TextDirection.rtl,
              style: const TextStyle(
                fontSize: 14,
                color: AppColors.textPrimary,
                fontFamily: 'Cairo',
              ),
              decoration: const InputDecoration(
                hintText: 'ابحث في التحاليل (رقم، طبيب، مختبر)...',
                hintStyle: TextStyle(
                  fontSize: 13,
                  color: AppColors.textSecondary,
                  fontFamily: 'Cairo',
                ),
                border: InputBorder.none,
                isDense: true,
                contentPadding: EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          if (hasText)
            IconButton(
              icon: const Icon(LucideIcons.x,
                  size: 16, color: AppColors.textSecondary),
              onPressed: () {
                controller.clear();
                onChanged('');
              },
              tooltip: 'مسح البحث',
              splashRadius: 18,
            ),
          const SizedBox(width: 4),
        ],
      ),
    );
  }
}
