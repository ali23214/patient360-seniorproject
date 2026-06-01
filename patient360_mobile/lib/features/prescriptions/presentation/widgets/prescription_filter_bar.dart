// ════════════════════════════════════════════════════════════════════════════
//  PrescriptionFilterBar
//  ──────────────────────────────────────────────────────────────────────────
//  Compound filter UI for the prescriptions list (4 status tabs + period
//  chips). Mirrors the web's `.pdmr-chips` toolbar, scaled for mobile.
//
//  Status tabs (matching PatientDashboard.jsx):
//    • all
//    • active             → active + partially_dispensed
//    • dispensed          → dispensed
//    • expired/cancelled  → expired + cancelled
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';

/// UI bucket for the status tab filter.
enum RxStatusTab { all, active, dispensed, expiredOrCancelled }

extension RxStatusTabLabel on RxStatusTab {
  String get label => switch (this) {
    RxStatusTab.all => 'الكل',
    RxStatusTab.active => 'النشطة',
    RxStatusTab.dispensed => 'تم صرفها',
    RxStatusTab.expiredOrCancelled => 'منتهية/ملغاة',
  };
}

/// UI bucket for the period filter (identical to LabPeriod values).
enum RxPeriod { all, week, month, threeMonths, year }

extension RxPeriodLabel on RxPeriod {
  String get label => switch (this) {
    RxPeriod.all => 'كل الفترات',
    RxPeriod.week => 'آخر أسبوع',
    RxPeriod.month => 'آخر شهر',
    RxPeriod.threeMonths => 'آخر 3 أشهر',
    RxPeriod.year => 'آخر سنة',
  };

  DateTime? cutoff() {
    final DateTime now = DateTime.now();
    return switch (this) {
      RxPeriod.all => null,
      RxPeriod.week => now.subtract(const Duration(days: 7)),
      RxPeriod.month => now.subtract(const Duration(days: 30)),
      RxPeriod.threeMonths => now.subtract(const Duration(days: 90)),
      RxPeriod.year => now.subtract(const Duration(days: 365)),
    };
  }
}

class PrescriptionFilterBar extends StatelessWidget {
  const PrescriptionFilterBar({
    super.key,
    required this.currentTab,
    required this.onTabChanged,
    required this.currentPeriod,
    required this.onPeriodChanged,
    required this.tabCounts,
  });

  final RxStatusTab currentTab;
  final ValueChanged<RxStatusTab> onTabChanged;

  final RxPeriod currentPeriod;
  final ValueChanged<RxPeriod> onPeriodChanged;

  final Map<RxStatusTab, int> tabCounts;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        // ── Tabs row ─────────────────────────────────────────────
        SizedBox(
          height: 38,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: <Widget>[
              for (final RxStatusTab tab in RxStatusTab.values) ...<Widget>[
                _TabChip(
                  label: tab.label,
                  count: tabCounts[tab] ?? 0,
                  selected: tab == currentTab,
                  onTap: () => onTabChanged(tab),
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ),
        const SizedBox(height: 8),

        // ── Period chips row ─────────────────────────────────────
        SizedBox(
          height: 32,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: <Widget>[
              for (final RxPeriod period in RxPeriod.values) ...<Widget>[
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
// Tab chip with count
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
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
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
// Period chip
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
