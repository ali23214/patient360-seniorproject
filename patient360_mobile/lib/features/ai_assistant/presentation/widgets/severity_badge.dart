// ════════════════════════════════════════════════════════════════════════════
//  SeverityBadge
//  ──────────────────────────────────────────────────────────────────────────
//  Pill-shaped indicator of an AI risk level. Mirrors the web's
//  `frontend/src/components/ai/SeverityBadge.jsx` plus the matching
//  `.pd-ai-severity-badge.is-*` CSS rules in `PatientDashboard.css`.
//
//  Visual mapping — IDENTICAL to the web (do not improvise):
//    low      → Check         / green  / منخفض
//    moderate → CircleAlert   / amber  / متوسط
//    high     → TriangleAlert / orange / مرتفع
//    critical → OctagonAlert  / red    / حرج    + 1.5s expanding-ring pulse
//
//  The critical variant pulses with the same 1.5s timing as the CSS keyframe
//  `pd-pulse-critical`. Other variants are static.
//
//  ⚠️  PARAMETER NAME: kept as `level` for backward compatibility with the
//  existing `emergency_report_tile.dart` and `report_detail_sheet.dart`
//  widgets in this module.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../domain/severity_level.dart';

class SeverityBadge extends StatefulWidget {
  const SeverityBadge({super.key, required this.level});

  final SeverityLevel level;

  @override
  State<SeverityBadge> createState() => _SeverityBadgeState();
}

class _SeverityBadgeState extends State<SeverityBadge>
    with SingleTickerProviderStateMixin {
  AnimationController? _pulseCtl;

  @override
  void initState() {
    super.initState();
    _maybeStartPulse();
  }

  @override
  void didUpdateWidget(covariant SeverityBadge oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.level != widget.level) {
      _pulseCtl?.dispose();
      _pulseCtl = null;
      _maybeStartPulse();
    }
  }

  void _maybeStartPulse() {
    if (widget.level == SeverityLevel.critical) {
      _pulseCtl = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 1500),
      )..repeat();
    }
  }

  @override
  void dispose() {
    _pulseCtl?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final _BadgeStyle s = _resolveStyle(widget.level);
    final Widget pill = _buildPill(s);

    if (_pulseCtl == null) {
      return Semantics(label: 'مستوى الخطورة: ${s.label}', child: pill);
    }

    // Critical variant: AnimatedBuilder draws an expanding-ring shadow that
    // mirrors the CSS keyframe `pd-pulse-critical`:
    //   0%, 100%: box-shadow 0 0 0 0  rgba(211,47,47,0.5)
    //   50%:      box-shadow 0 0 0 6px rgba(211,47,47,0)
    return Semantics(
      label: 'مستوى الخطورة: ${s.label}',
      liveRegion: true,
      child: AnimatedBuilder(
        animation: _pulseCtl!,
        builder: (BuildContext _, Widget? child) {
          final double t = _pulseCtl!.value;
          final double spread = 6 * t;
          final double alpha = (1 - t) * 0.5;
          return DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              boxShadow: <BoxShadow>[
                BoxShadow(
                  color: const Color(0xFFD32F2F).withValues(alpha: alpha),
                  spreadRadius: spread,
                ),
              ],
            ),
            child: child,
          );
        },
        child: pill,
      ),
    );
  }

  Widget _buildPill(_BadgeStyle s) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: s.bg,
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        border: Border.all(color: s.borderColor),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(s.icon, size: 16, color: s.fg),
          const SizedBox(width: 6),
          Text(
            s.label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: s.fg,
              fontFamily: 'Cairo',
              height: 1.0,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Static visual configuration per severity ────────────────────────────

class _BadgeStyle {
  const _BadgeStyle({
    required this.icon,
    required this.label,
    required this.bg,
    required this.fg,
    required this.borderColor,
  });

  final IconData icon;
  final String label;
  final Color bg;
  final Color fg;
  final Color borderColor;
}

_BadgeStyle _resolveStyle(SeverityLevel s) {
  switch (s) {
    case SeverityLevel.low:
      return const _BadgeStyle(
        icon: LucideIcons.check,
        label: 'منخفض',
        bg: Color(0xFFE8F5E9),
        fg: Color(0xFF388E3C),
        borderColor: Color(0xFFC8E6C9),
      );
    case SeverityLevel.moderate:
      return const _BadgeStyle(
        icon: LucideIcons.circleAlert,
        label: 'متوسط',
        bg: Color(0xFFFFF8E1),
        fg: Color(0xFFF57C00),
        borderColor: Color(0xFFFFE082),
      );
    case SeverityLevel.high:
      return const _BadgeStyle(
        icon: LucideIcons.triangleAlert,
        label: 'مرتفع',
        bg: Color(0xFFFFE0B2),
        fg: Color(0xFFE65100),
        borderColor: Color(0xFFFFCC80),
      );
    case SeverityLevel.critical:
      return const _BadgeStyle(
        icon: LucideIcons.octagonAlert,
        label: 'حرج',
        bg: Color(0xFFFFEBEE),
        fg: Color(0xFFD32F2F),
        borderColor: Color(0xFFFFCDD2),
      );
  }
}