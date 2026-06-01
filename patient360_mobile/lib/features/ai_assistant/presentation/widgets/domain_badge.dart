// ════════════════════════════════════════════════════════════════════════════
//  DomainBadge
//  ──────────────────────────────────────────────────────────────────────────
//  Pill-shaped color-themed indicator that surfaces the FastAPI service's
//  `domain` classification. Mirrors the web's `domainBadgeProps()` mapping
//  and the matching `.pd-ai-result-domain-badge.is-*` CSS rules.
//
//  Visual mapping — IDENTICAL to the web:
//    emergency  → red-tinted   pill / "طوارئ"
//    wound      → teal-tinted  pill / "إصابة جلدية"
//    eye        → teal-tinted  pill / "عيون"
//    medical    → teal-tinted  pill / "استشارة طبية"
//    (other)    → teal-tinted  pill / humanized class name
//
//  Returns SizedBox.shrink() (renders nothing) when the input domain is
//  null or empty, so callers can drop it directly into layouts without a
//  nullable check.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/ai_prediction.dart' show humanizeClass;

class DomainBadge extends StatelessWidget {
  const DomainBadge({super.key, required this.domain});

  /// Raw backend domain string. Case-insensitive comparison against the
  /// known set (`emergency`, `wound`, `eye`, `medical`); unknown values
  /// render with the medical theme and a humanized label.
  final String? domain;

  @override
  Widget build(BuildContext context) {
    final _DomainStyle? style = _resolveStyle(domain);
    if (style == null) return const SizedBox.shrink();

    return Semantics(
      label: 'النطاق: ${style.label}',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: style.bg,
          borderRadius: const BorderRadius.all(Radius.circular(999)),
          border: Border.all(color: style.borderColor),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(LucideIcons.tag, size: 12, color: style.fg),
            const SizedBox(width: 6),
            Text(
              style.label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: style.fg,
                fontFamily: 'Cairo',
                height: 1.0,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Style resolution
// ────────────────────────────────────────────────────────────────────────────

class _DomainStyle {
  const _DomainStyle({
    required this.label,
    required this.bg,
    required this.fg,
    required this.borderColor,
  });

  final String label;
  final Color bg;
  final Color fg;
  final Color borderColor;
}

_DomainStyle? _resolveStyle(String? domain) {
  if (domain == null || domain.trim().isEmpty) return null;
  final String norm = domain.toLowerCase().trim();

  // Emergency variant — red theme.
  if (norm == 'emergency') {
    return const _DomainStyle(
      label: 'طوارئ',
      bg: Color(0xFFFFEBEE),
      fg: AppColors.error,
      borderColor: Color(0xFFFFCDD2),
    );
  }

  // Medical variants — teal theme.
  if (norm == 'wound') {
    return const _DomainStyle(
      label: 'إصابة جلدية',
      bg: AppColors.surface,
      fg: AppColors.action,
      borderColor: AppColors.border,
    );
  }
  if (norm == 'eye') {
    return const _DomainStyle(
      label: 'عيون',
      bg: AppColors.surface,
      fg: AppColors.action,
      borderColor: AppColors.border,
    );
  }
  if (norm == 'medical') {
    return const _DomainStyle(
      label: 'استشارة طبية',
      bg: AppColors.surface,
      fg: AppColors.action,
      borderColor: AppColors.border,
    );
  }

  // Unknown domain — fall back to the medical theme with a humanized
  // label so a new backend value still renders something readable.
  return _DomainStyle(
    label: humanizeClass(domain),
    bg: AppColors.surface,
    fg: AppColors.action,
    borderColor: AppColors.border,
  );
}
