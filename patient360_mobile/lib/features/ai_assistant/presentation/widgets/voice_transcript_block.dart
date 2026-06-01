// ════════════════════════════════════════════════════════════════════════════
//  VoiceTranscriptBlock
//  ──────────────────────────────────────────────────────────────────────────
//  Renders the Whisper-transcribed Arabic text from a voice-mode emergency
//  submission so the patient can verify what the AI "heard". Mirrors the
//  web's `VoiceTranscriptionBlock` sub-render in ResultCard.jsx and the
//  matching `.pd-ai-result-transcript*` CSS rules.
//
//  Visual:
//    • Pale background card with action-color microphone icon
//    • Heading: "ما تم تحويله من الصوت"
//    • Body: the transcript itself, wrapped in Arabic typographic quotes
//      (« »), RTL-aware
//
//  Auto-hides when the transcript is null/empty so callers can drop it
//  directly into layouts without conditional checks.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';

class VoiceTranscriptBlock extends StatelessWidget {
  const VoiceTranscriptBlock({super.key, required this.transcript});

  /// Whisper-transcribed Arabic text. Auto-hidden when null/empty.
  final String? transcript;

  @override
  Widget build(BuildContext context) {
    final String trimmed = (transcript ?? '').trim();
    if (trimmed.isEmpty) return const SizedBox.shrink();

    final ColorScheme scheme = Theme.of(context).colorScheme;
    final bool isDark = Theme.of(context).brightness == Brightness.dark;

    return Semantics(
      label: 'نص التسجيل الصوتي',
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
            // ── Heading row ──────────────────────────────────────────
            Row(
              children: <Widget>[
                Icon(LucideIcons.mic, size: 16, color: scheme.secondary),
                const SizedBox(width: 8),
                Text(
                  'ما تم تحويله من الصوت',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: scheme.onSurfaceVariant,
                    letterSpacing: 0.3,
                    fontFamily: 'Cairo',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            // ── Transcript body, wrapped in Arabic guillemets ────────
            Text(
              '«$trimmed»',
              style: TextStyle(
                fontSize: 14,
                height: 1.7,
                fontStyle: FontStyle.italic,
                color: scheme.onSurface,
                fontFamily: 'Cairo',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
