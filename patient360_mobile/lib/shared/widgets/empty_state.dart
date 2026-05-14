import 'package:flutter/material.dart';

import 'primary_button.dart';

/// Centered icon/title/subtitle panel, with an optional call-to-action button.
/// Mirrors the web EmptyState atom used across the dashboard.
class EmptyState extends StatelessWidget {
  const EmptyState({
    required this.icon,
    required this.title,
    this.subtitle,
    this.ctaLabel,
    this.onCta,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final String? ctaLabel;
  final VoidCallback? onCta;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: <Widget>[
          Icon(icon, size: 48, color: scheme.onSurfaceVariant),
          const SizedBox(height: 12),
          Text(
            title,
            style: text.titleMedium,
            textAlign: TextAlign.center,
          ),
          if (subtitle != null) ...<Widget>[
            const SizedBox(height: 6),
            Text(
              subtitle!,
              style: text.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
          ],
          if (ctaLabel != null && onCta != null) ...<Widget>[
            const SizedBox(height: 20),
            PrimaryButton(
              label: ctaLabel!,
              onPressed: onCta,
              fullWidth: false,
            ),
          ],
        ],
      ),
    );
  }
}
