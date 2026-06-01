// ════════════════════════════════════════════════════════════════════════════
//  ConfidenceBar
//  ──────────────────────────────────────────────────────────────────────────
//  Horizontal progress bar visualizing an AI confidence score (0..1).
//  Mirrors the web's `ConfidenceBar.jsx` + `.pd-ai-confidence-bar` CSS.
//
//  Color thresholds are IDENTICAL to the web:
//    confidence >= 0.8  → green  gradient (#66BB6A → success)
//    0.5 <= c < 0.8     → teal   gradient (accent → action)
//    c < 0.5            → orange gradient (#FFB74D → warning)
//
//  The fill animates from 0 to its target width on mount, matching the CSS
//  rule `animation: pd-grow-width 0.6s ease backwards` (transform: scaleX).
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';

class ConfidenceBar extends StatefulWidget {
  const ConfidenceBar({super.key, required this.confidence});

  /// 0.0 .. 1.0 — clamped defensively before rendering.
  final double confidence;

  @override
  State<ConfidenceBar> createState() => _ConfidenceBarState();
}

class _ConfidenceBarState extends State<ConfidenceBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctl;
  late final Animation<double> _grow;

  @override
  void initState() {
    super.initState();
    _ctl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _grow = CurvedAnimation(parent: _ctl, curve: Curves.easeOut);
    _ctl.forward();
  }

  @override
  void didUpdateWidget(covariant ConfidenceBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.confidence != widget.confidence) {
      _ctl
        ..reset()
        ..forward();
    }
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final double v = widget.confidence.clamp(0.0, 1.0);
    final String pct = (v * 100).toStringAsFixed(1);
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final bool isDark = Theme.of(context).brightness == Brightness.dark;
    final List<Color> gradient = _gradientFor(v);

    return Semantics(
      label: 'الثقة: $pct%',
      value: '$pct%',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          // Decorative label — matches `.pd-ai-confidence-bar-label`.
          Text(
            'الثقة',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: scheme.onSurfaceVariant,
              fontFamily: 'Cairo',
            ),
          ),
          const SizedBox(height: 6),
          // Track + animated fill + percentage overlay.
          Container(
            height: 24,
            decoration: BoxDecoration(
              color: isDark ? AppColors.backgroundDark : AppColors.background,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: scheme.outline),
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              children: <Widget>[
                AnimatedBuilder(
                  animation: _grow,
                  builder: (BuildContext _, Widget? __) {
                    return FractionallySizedBox(
                      alignment: AlignmentDirectional.centerStart,
                      widthFactor: v * _grow.value,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(999),
                          gradient: LinearGradient(
                            begin: Alignment.centerLeft,
                            end: Alignment.centerRight,
                            colors: gradient,
                          ),
                        ),
                      ),
                    );
                  },
                ),
                // Percentage centered over the bar. Web uses
                // `mix-blend-mode: difference`. We approximate with a thin
                // white stroke under the primary text — readable over both
                // the gradient fill and the empty track.
                Positioned.fill(
                  child: Center(
                    child: Stack(
                      children: <Widget>[
                        // Stroke layer (white outline, all directions).
                        Text(
                          '$pct%',
                          textDirection: TextDirection.ltr,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            fontFamily: 'Inter',
                            foreground: Paint()
                              ..style = PaintingStyle.stroke
                              ..strokeWidth = 3
                              ..color = Colors.white.withValues(alpha: 0.9),
                          ),
                        ),
                        // Fill layer (primary color text).
                        Text(
                          '$pct%',
                          textDirection: TextDirection.ltr,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: scheme.primary,
                            fontFamily: 'Inter',
                          ),
                        ),
                      ],
                    ),
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

// ─── Threshold-driven gradient ───────────────────────────────────────────

List<Color> _gradientFor(double v) {
  if (v >= 0.8) {
    return const <Color>[Color(0xFF66BB6A), AppColors.success];
  }
  if (v >= 0.5) {
    return const <Color>[AppColors.accent, AppColors.action];
  }
  return const <Color>[Color(0xFFFFB74D), AppColors.warning];
}