// ════════════════════════════════════════════════════════════════════════════
//  EmptyState
//  ──────────────────────────────────────────────────────────────────────────
//  Generic empty-state illustration: a centered icon (64px, muted color)
//  above a title and optional subtitle. Mirrors the web's
//  `frontend/src/components/ai/EmptyState.jsx` plus the matching
//  `.pd-ai-empty-state` CSS rules.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
  });

  final IconData icon;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;

    return Semantics(
      label: title,
      container: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: <Widget>[
            Icon(
              icon,
              size: 64,
              color: scheme.onSurfaceVariant.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: text.titleSmall?.copyWith(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: scheme.primary,
              ),
            ),
            if (subtitle != null) ...<Widget>[
              const SizedBox(height: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 320),
                child: Text(
                  subtitle!,
                  textAlign: TextAlign.center,
                  style: text.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                    height: 1.5,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}