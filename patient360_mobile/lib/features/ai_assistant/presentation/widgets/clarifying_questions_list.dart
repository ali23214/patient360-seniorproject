// ════════════════════════════════════════════════════════════════════════════
//  ClarifyingQuestionsList
//  ──────────────────────────────────────────────────────────────────────────
//  Renders the AI's follow-up questions that help narrow down an uncertain
//  diagnosis. Used only for the `uncertain` / `very_ambiguous` branches.
//  Mirrors the web's `ClarifyingQuestions` sub-render in ResultCard.jsx
//  and the matching `.pd-ai-result-clarify*` CSS rules.
//
//  Visual:
//    • Section header with HelpCircle icon: "أسئلة لتأكيد التشخيص"
//    • Vertical list of bulleted questions
//    • Each question rendered RTL with right-aligned bullets
//
//  Auto-hides when the list is empty so callers can drop it directly
//  into layouts without conditional checks.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';

class ClarifyingQuestionsList extends StatelessWidget {
  const ClarifyingQuestionsList({super.key, required this.questions});

  /// Arabic follow-up questions parsed by `EmergencyReport.fromJson`.
  /// Auto-hidden when empty.
  final List<String> questions;

  @override
  Widget build(BuildContext context) {
    if (questions.isEmpty) return const SizedBox.shrink();

    final ColorScheme scheme = Theme.of(context).colorScheme;
    final bool isDark = Theme.of(context).brightness == Brightness.dark;

    return Semantics(
      label: 'أسئلة توضيحية',
      container: true,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isDark ? AppColors.backgroundDark : AppColors.background,
          borderRadius: AppRadii.radiusMd,
          border: Border.all(color: scheme.outline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            // ── Section header ──────────────────────────────────────
            Row(
              children: <Widget>[
                Icon(
                  LucideIcons.circleQuestionMark,
                  size: 16,
                  color: scheme.secondary,
                ),
                const SizedBox(width: 8),
                Text(
                  'أسئلة لتأكيد التشخيص',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: scheme.primary,
                    letterSpacing: 0.3,
                    fontFamily: 'Cairo',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            // ── Question list ──────────────────────────────────────
            for (int i = 0; i < questions.length; i++) ...<Widget>[
              if (i > 0) const SizedBox(height: 8),
              _QuestionRow(question: questions[i]),
            ],
          ],
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// One bulleted question row
// ────────────────────────────────────────────────────────────────────────────

class _QuestionRow extends StatelessWidget {
  const _QuestionRow({required this.question});

  final String question;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // Small action-color dot acting as the bullet. Sized so it
        // visually aligns with the first line of body text.
        Container(
          margin: const EdgeInsetsDirectional.only(top: 7, start: 2, end: 10),
          width: 6,
          height: 6,
          decoration: const BoxDecoration(
            color: AppColors.action,
            shape: BoxShape.circle,
          ),
        ),
        Expanded(
          child: Text(
            question,
            style: TextStyle(
              fontSize: 13,
              height: 1.7,
              color: scheme.onSurface,
              fontFamily: 'Cairo',
            ),
          ),
        ),
      ],
    );
  }
}
