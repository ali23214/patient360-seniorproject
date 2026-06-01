// ════════════════════════════════════════════════════════════════════════════
//  LabFilterBar
//  ──────────────────────────────────────────────────────────────────────────
//  Compound filter UI for the lab results list:
//    1. Status tabs row (الكل / النتائج / قيد الإنتظار / ملغاة) with counts
//    2. Period chips row (كل الفترات / آخر أسبوع / آخر شهر / آخر 3 أشهر / آخر سنة)
//    3. Optional "X غير مقروءة" alert chip when there are completed but
//       unread test results
//
//  Mirrors the web's `.pdmr-chips` + `.pdmr-chips--secondary` toolbar in
//  PatientDashboard.jsx, scaled down for the mobile viewport.
//
//  Layout is horizontally scrollable on each row so all chips remain
//  reachable on narrow phones without truncation.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';

/// UI bucket for the 4-tab status filter. Mirrors `LAB_TABS` in the web.
enum LabStatusTab { all, results, pending, cancelled }

extension LabStatusTabLabel on LabStatusTab {
  String get label => switch (this) {
        LabStatusTab.all => 'الكل',
        LabStatusTab.results => 'النتائج',
        LabStatusTab.pending => 'قيد الإنتظار',
        LabStatusTab.cancelled => 'ملغاة',
      };
}

/// UI bucket for the period filter. Mirrors `LAB_PERIODS` in the web.
enum LabPeriod { all, week, month, threeMonths, year }

extension LabPeriodLabel on LabPeriod {
  String get label => switch (this) {
        LabPeriod.all => 'كل الفترات',
        LabPeriod.week => 'آخر أسبوع',
        LabPeriod.month => 'آخر شهر',
        LabPeriod.threeMonths => 'آخر 3 أشهر',
        LabPeriod.year => 'آخر سنة',
      };

  /// Millisecond cutoff for the period. `null` for "all".
  DateTime? cutoff() {
    final DateTime now = DateTime.now();
    return switch (this) {
      LabPeriod.all => null,
      LabPeriod.week => now.subtract(const Duration(days: 7)),
      LabPeriod.month => now.subtract(const Duration(days: 30)),
      LabPeriod.threeMonths => now.subtract(const Duration(days: 90)),
      LabPeriod.year => now.subtract(const Duration(days: 365)),
    };
  }
}

class LabFilterBar extends StatelessWidget {
  const LabFilterBar({
    super.key,
    required this.currentTab,
    required this.onTabChanged,
    required this.currentPeriod,
    required this.onPeriodChanged,
    required this.tabCounts,
    required this.unreadCount,
  });

  final LabStatusTab currentTab;
  final ValueChanged<LabStatusTab> onTabChanged;

  final LabPeriod currentPeriod;
  final ValueChanged<LabPeriod> onPeriodChanged;

  /// Pre-computed counts per tab — caller calculates these once over the
  /// full result set so the chips always reflect totals, not the
  /// currently filtered view.
  final Map<LabStatusTab, int> tabCounts;

  /// Number of completed-but-unviewed tests across the whole list.
  /// Drives the "X غير مقروءة" alert chip.
  final int unreadCount;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        // ── Tabs row ────────────────────────────────────────────────
        SizedBox(
          height: 38,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: <Widget>[
              for (final LabStatusTab tab in LabStatusTab.values) ...<Widget>[
                _TabChip(
                  label: tab.label,
                  count: tabCounts[tab] ?? 0,
                  selected: tab == currentTab,
                  onTap: () => onTabChanged(tab),
                ),
                const SizedBox(width: 8),
              ],
              if (unreadCount > 0) _UnreadAlertChip(count: unreadCount),
            ],
          ),
        ),
        const SizedBox(height: 8),

        // ── Period chips row ────────────────────────────────────────
        SizedBox(
          height: 32,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: <Widget>[
              for (final LabPeriod period in LabPeriod.values) ...<Widget>[
                _PeriodChip(
                  label: period.label,
                  selected: period == currentPeriod,
                  onTap: () => onPeriodChanged(period),
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Tab chip with count badge
// ────────────────────────────────────────────────────────────────────────────

class _TabChip extends StatelessWidget {
  const _TabChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.action : AppColors.card,
      borderRadius: const BorderRadius.all(Radius.circular(999)),
      child: InkWell(
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: const BorderRadius.all(Radius.circular(999)),
            border: Border.all(
              color: selected ? AppColors.action : AppColors.border,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                  color: selected ? Colors.white : AppColors.textPrimary,
                  fontFamily: 'Cairo',
                  height: 1.0,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: selected
                      ? Colors.white.withValues(alpha: 0.25)
                      : AppColors.surface,
                  borderRadius: const BorderRadius.all(Radius.circular(999)),
                ),
                child: Text(
                  '$count',
                  textDirection: TextDirection.ltr,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: selected ? Colors.white : AppColors.action,
                    fontFamily: 'Inter',
                    height: 1.0,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Ghost-style period chip
// ────────────────────────────────────────────────────────────────────────────

class _PeriodChip extends StatelessWidget {
  const _PeriodChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.surface : Colors.transparent,
      borderRadius: const BorderRadius.all(Radius.circular(999)),
      child: InkWell(
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: const BorderRadius.all(Radius.circular(999)),
            border: Border.all(
              color: selected ? AppColors.action : AppColors.border,
            ),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              color: selected ? AppColors.action : AppColors.textSecondary,
              fontFamily: 'Cairo',
              height: 1.0,
            ),
          ),
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Unread results alert chip
// ────────────────────────────────────────────────────────────────────────────

class _UnreadAlertChip extends StatelessWidget {
  const _UnreadAlertChip({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFFFEBEE),
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        border: Border.all(color: const Color(0xFFFFCDD2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Icon(LucideIcons.circleAlert,
              size: 13, color: AppColors.error),
          const SizedBox(width: 6),
          Text(
            '$count غير مقروءة',
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w800,
              color: AppColors.error,
              fontFamily: 'Cairo',
              height: 1.0,
            ),
          ),
        ],
      ),
    );
  }
}
