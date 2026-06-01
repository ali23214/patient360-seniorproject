// ════════════════════════════════════════════════════════════════════════════
//  TopPredictionsAccordion
//  ──────────────────────────────────────────────────────────────────────────
//  Collapsible top-N predictions list. Mirrors the web's
//  `TopPredictionsAccordion` sub-render in ResultCard.jsx — the web uses
//  native `<details>/<summary>` for built-in keyboard + screen-reader
//  semantics; we use Flutter's `ExpansionTile` for the equivalent.
//
//  Visual:
//    • Collapsed: action-color summary line "عرض الاحتمالات الأخرى" (or
//      a caller-supplied label) with a chevron
//    • Expanded: vertical list of prediction rows, each showing the
//      class name + Arabic name + animated progress bar + percentage
//
//  Auto-hides when the predictions list is empty.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/ai_prediction.dart';

class TopPredictionsAccordion extends StatelessWidget {
  const TopPredictionsAccordion({
    super.key,
    required this.predictions,
    this.summaryLabel = 'عرض الاحتمالات الأخرى',
    this.initiallyExpanded = false,
  });

  /// Ranked predictions to display. Order is preserved; auto-hides when
  /// empty.
  final List<AiPrediction> predictions;

  /// Heading shown in the collapsed state. Defaults match the web's
  /// "عرض الاحتمالات الأخرى" — multi-mode callers override to
  /// "أهم الاحتمالات".
  final String summaryLabel;

  /// Whether the accordion starts expanded. Defaults to false so the
  /// list doesn't dominate the card; callers that want it open by
  /// default can pass true.
  final bool initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    if (predictions.isEmpty) return const SizedBox.shrink();

    final ColorScheme scheme = Theme.of(context).colorScheme;
    final bool isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.backgroundDark : AppColors.background,
        borderRadius: AppRadii.radiusMd,
        border: Border.all(color: scheme.outline),
      ),
      clipBehavior: Clip.antiAlias,
      child: Theme(
        // Strip the default divider and tint controls with the action
        // color so the accordion matches Teal Medica.
        data: Theme.of(context).copyWith(
          dividerColor: Colors.transparent,
          colorScheme: scheme.copyWith(primary: AppColors.action),
        ),
        child: ExpansionTile(
          initiallyExpanded: initiallyExpanded,
          tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
          leading: Icon(
            LucideIcons.chartBar,
            size: 18,
            color: scheme.secondary,
          ),
          title: Text(
            summaryLabel,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: scheme.primary,
              fontFamily: 'Cairo',
            ),
          ),
          children: <Widget>[
            for (int i = 0; i < predictions.length; i++) ...<Widget>[
              if (i > 0) const SizedBox(height: 10),
              _PredictionRow(prediction: predictions[i]),
            ],
          ],
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// One prediction row — class label + animated bar + percentage
// ────────────────────────────────────────────────────────────────────────────

class _PredictionRow extends StatefulWidget {
  const _PredictionRow({required this.prediction});

  final AiPrediction prediction;

  @override
  State<_PredictionRow> createState() => _PredictionRowState();
}

class _PredictionRowState extends State<_PredictionRow>
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
    // The accordion is collapsed by default, so the bar's first paint
    // happens when the parent expands. Driving the animation from
    // initState is fine — Flutter discards the offscreen frames.
    _ctl.forward();
  }

  @override
  void didUpdateWidget(covariant _PredictionRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.prediction.probability != widget.prediction.probability) {
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
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final AiPrediction p = widget.prediction;
    final double v = p.probability;
    final String pct = p.percentageLabel;
    final String display = p.displayName;

    return Semantics(
      label: '$display: $pct',
      child: Row(
        children: <Widget>[
          // ── Class label (RTL-aware) ────────────────────────────
          Expanded(
            flex: 5,
            child: Text(
              display,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: scheme.onSurface,
                fontFamily: 'Cairo',
              ),
            ),
          ),
          const SizedBox(width: 10),
          // ── Animated progress bar ─────────────────────────────
          Expanded(
            flex: 6,
            child: Container(
              height: 10,
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(999),
              ),
              clipBehavior: Clip.antiAlias,
              child: AnimatedBuilder(
                animation: _grow,
                builder: (BuildContext _, Widget? __) {
                  return FractionallySizedBox(
                    alignment: AlignmentDirectional.centerStart,
                    widthFactor: v * _grow.value,
                    child: const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: <Color>[
                            AppColors.accent,
                            AppColors.action,
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          const SizedBox(width: 10),
          // ── Percentage chip (LTR — digits read left to right) ─
          SizedBox(
            width: 48,
            child: Text(
              pct,
              textDirection: TextDirection.ltr,
              textAlign: TextAlign.end,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppColors.action,
                fontFamily: 'Inter',
              ),
            ),
          ),
        ],
      ),
    );
  }
}
