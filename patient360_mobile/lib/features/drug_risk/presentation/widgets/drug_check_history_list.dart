// ============================================================================
// DrugCheckHistoryList - Patient 360 mobile (drug-risk feature)
// ----------------------------------------------------------------------------
// Compact list of the patient's past checks, newest first. Each row is a
// small tile showing:
//   * Risk-level icon (color-tinted)
//   * The drug name (or input text if name unavailable)
//   * The Arabic risk label
//   * Relative time ("منذ ساعة")
//
// Tapping a tile expands it inline to show the full reason / advice / warning
// — saves switching screens for quick review.
// ============================================================================

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/drug_risk_check.dart';
import '../../domain/risk_level.dart';

class DrugCheckHistoryList extends StatelessWidget {
  const DrugCheckHistoryList({required this.checks, super.key});

  final List<DrugRiskCheck> checks;

  @override
  Widget build(BuildContext context) {
    if (checks.isEmpty) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        // -- Header --
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            children: <Widget>[
              Icon(
                LucideIcons.history,
                size: 16,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(width: 8),
              Text(
                'سجل الفحوصات',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.primary,
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  fontFamily: 'Cairo',
                ),
              ),
              const SizedBox(width: 8),
              _CountBadge(count: checks.length),
            ],
          ),
        ),
        const SizedBox(height: 10),

        // -- Tiles --
        ...checks.map(
          (DrugRiskCheck c) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _HistoryTile(check: c),
          ),
        ),
      ],
    );
  }
}

// ============================================================================
// Count badge
// ============================================================================

class _CountBadge extends StatelessWidget {
  const _CountBadge({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.action.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        count.toString(),
        style: TextStyle(
          color: AppColors.action,
          fontSize: 11,
          fontWeight: FontWeight.w800,
          fontFamily: 'Inter',
          fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

// ============================================================================
// Single tile — expandable on tap
// ============================================================================

class _HistoryTile extends StatefulWidget {
  const _HistoryTile({required this.check});
  final DrugRiskCheck check;

  @override
  State<_HistoryTile> createState() => _HistoryTileState();
}

class _HistoryTileState extends State<_HistoryTile> {
  bool _expanded = false;

  void _toggle() => setState(() => _expanded = !_expanded);

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final RiskLevel level = widget.check.result.riskLevel;
    final Color tone = level.color;

    // Prefer the AI-normalized drug name; fall back to whatever the user
    // typed; finally fall back to a generic Arabic placeholder.
    final String displayName =
        widget.check.result.drugNameAr ?? widget.check.inputText ?? 'فحص دواء';

    return Material(
      color: scheme.surface,
      borderRadius: AppRadii.radiusMd,
      child: InkWell(
        borderRadius: AppRadii.radiusMd,
        onTap: widget.check.result.hasAnyContent ? _toggle : null,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          decoration: BoxDecoration(
            borderRadius: AppRadii.radiusMd,
            border: Border.all(color: tone.withValues(alpha: 0.28), width: 1),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  // Icon
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: tone.withValues(alpha: 0.14),
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: Icon(level.icon, size: 16, color: tone),
                  ),
                  const SizedBox(width: 10),

                  // Name + relative time
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Directionality(
                          // The name is usually English (the drug brand); LTR
                          // looks correct for both English and Arabic strings.
                          textDirection: TextDirection.ltr,
                          child: Text(
                            displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.start,
                            style: TextStyle(
                              color: scheme.onSurface,
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              fontFamily: 'Cairo',
                            ),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _relativeTime(widget.check.createdAt),
                          style: TextStyle(
                            color: scheme.onSurfaceVariant,
                            fontSize: 11,
                            fontFamily: 'Cairo',
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Risk badge
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: tone.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      level.arabicLabel,
                      style: TextStyle(
                        color: tone,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        fontFamily: 'Cairo',
                      ),
                    ),
                  ),

                  // Chevron
                  if (widget.check.result.hasAnyContent) ...<Widget>[
                    const SizedBox(width: 4),
                    Icon(
                      _expanded
                          ? LucideIcons.chevronUp
                          : LucideIcons.chevronDown,
                      size: 16,
                      color: scheme.onSurfaceVariant,
                    ),
                  ],
                ],
              ),

              // -- Expanded details --
              AnimatedCrossFade(
                duration: const Duration(milliseconds: 180),
                crossFadeState: _expanded
                    ? CrossFadeState.showSecond
                    : CrossFadeState.showFirst,
                firstChild: const SizedBox(width: double.infinity),
                secondChild: Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: _ExpandedBody(check: widget.check),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Lightweight Arabic relative-time formatter. Good enough for the
  /// recent-checks list — anything older than a week we render as a
  /// numeric date.
  String _relativeTime(DateTime dt) {
    final Duration diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return 'الآن';
    if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} دقيقة';
    if (diff.inHours < 24) return 'منذ ${diff.inHours} ساعة';
    if (diff.inDays < 7) return 'منذ ${diff.inDays} يوم';
    final DateTime local = dt.toLocal();
    final String yyyy = local.year.toString();
    final String mm = local.month.toString().padLeft(2, '0');
    final String dd = local.day.toString().padLeft(2, '0');
    return '$yyyy/$mm/$dd';
  }
}

// ============================================================================
// Expanded body — shows reason / advice / warning / interaction (compact)
// ============================================================================

class _ExpandedBody extends StatelessWidget {
  const _ExpandedBody({required this.check});
  final DrugRiskCheck check;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final List<Widget> rows = <Widget>[];

    void addRow(String label, String? text) {
      if (text == null || text.isEmpty) return;
      rows.add(
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: RichText(
            text: TextSpan(
              style: TextStyle(
                color: scheme.onSurface,
                fontSize: 12.5,
                height: 1.7,
                fontFamily: 'Cairo',
              ),
              children: <InlineSpan>[
                TextSpan(
                  text: '$label: ',
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                TextSpan(text: text),
              ],
            ),
          ),
        ),
      );
    }

    addRow('السبب', check.result.reasonAr);
    addRow('النصيحة', check.result.adviceAr);
    addRow('تحذير', check.result.warningAr);
    addRow('تفاعل', check.result.interactionWarningAr);

    if (rows.isEmpty) {
      return const SizedBox.shrink();
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: AppRadii.radiusSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: rows,
      ),
    );
  }
}
