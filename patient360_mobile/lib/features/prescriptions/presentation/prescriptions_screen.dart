// ════════════════════════════════════════════════════════════════════════════
//  PrescriptionsScreen / PrescriptionsList
//  ──────────────────────────────────────────────────────────────────────────
//  Top-level prescriptions surface. Mirrors the web's `renderPrescriptions()`
//  section in PatientDashboard.jsx — same toolbar UX (status tabs, period
//  chips, search) and the same `PrescriptionListCard` row layout.
//
//  Filtering pipeline:
//    1. Status tab        (all | active | dispensed | expired/cancelled)
//    2. Period            (all | week | month | 3 months | year)
//    3. Search query      (matches prescriptionNumber + medication names
//                          + prescriptionNotes)
//    4. Newest-first sort by prescriptionDate
//
//  Tapping a card navigates to /prescriptions/:id.
//
//  IMPORTANT: this file replaces the previous prescriptions_screen.dart.
//  The exported names (`PrescriptionsScreen`, `PrescriptionsList`) stay
//  unchanged so the medications hub (which embeds `PrescriptionsList`)
//  keeps working with no changes.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/loading_spinner.dart';
import '../../../shared/widgets/page_header.dart';
import '../../../shared/widgets/primary_button.dart';
import '../../home/presentation/providers/home_providers.dart';
import '../domain/medication_item.dart';
import '../domain/prescription.dart';
import 'providers/prescriptions_provider.dart';
import 'widgets/prescription_filter_bar.dart';
import 'widgets/prescription_list_card.dart';
import 'widgets/prescription_search_bar.dart';

/// Stand-alone screen for the /prescriptions and /medications routes.
class PrescriptionsScreen extends ConsumerWidget {
  const PrescriptionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final int unread =
        ref.watch(dashboardOverviewProvider).value?.unreadNotifications ?? 0;
    return Scaffold(
      appBar: PageHeader(
        title: 'الوصفات الطبية',
        subtitle: 'الوصفات النشطة والمصروفة',
        unreadCount: unread,
      ),
      body: const PrescriptionsList(),
    );
  }
}

/// Body-only widget — the filter toolbar plus the active list. Reused by
/// the medications hub so it can drop the same UI inside a tabbed chrome
/// without nesting Scaffolds.
class PrescriptionsList extends ConsumerStatefulWidget {
  const PrescriptionsList({super.key});

  @override
  ConsumerState<PrescriptionsList> createState() => _PrescriptionsListState();
}

class _PrescriptionsListState extends ConsumerState<PrescriptionsList> {
  RxStatusTab _tab = RxStatusTab.all;
  RxPeriod _period = RxPeriod.all;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // ── Filter pipeline ──────────────────────────────────────────────────

  /// Status-tab → DB status list (mirrors `PrescriptionGrouping` + the
  /// web's tab buckets).
  static const Map<RxStatusTab, Set<String>> _statusByTab =
      <RxStatusTab, Set<String>>{
        RxStatusTab.all: <String>{
          'active',
          'partially_dispensed',
          'dispensed',
          'expired',
          'cancelled',
        },
        RxStatusTab.active: <String>{'active', 'partially_dispensed'},
        RxStatusTab.dispensed: <String>{'dispensed'},
        RxStatusTab.expiredOrCancelled: <String>{'expired', 'cancelled'},
      };

  Map<RxStatusTab, int> _buildTabCounts(List<Prescription> all) {
    final Map<RxStatusTab, int> counts = <RxStatusTab, int>{
      for (final RxStatusTab t in RxStatusTab.values) t: 0,
    };
    for (final Prescription p in all) {
      for (final RxStatusTab tab in RxStatusTab.values) {
        if (_statusByTab[tab]!.contains(p.status)) {
          counts[tab] = (counts[tab] ?? 0) + 1;
        }
      }
    }
    return counts;
  }

  List<Prescription> _applyFilters(List<Prescription> all) {
    Iterable<Prescription> result = all;

    // 1. Status tab
    final Set<String> allowedStatuses = _statusByTab[_tab]!;
    result = result.where(
      (Prescription p) => allowedStatuses.contains(p.status),
    );

    // 2. Period cutoff
    final DateTime? cutoff = _period.cutoff();
    if (cutoff != null) {
      result = result.where(
        (Prescription p) => p.prescriptionDate.isAfter(cutoff),
      );
    }

    // 3. Search query
    final String q = _searchQuery.trim().toLowerCase();
    if (q.isNotEmpty) {
      result = result.where((Prescription p) {
        final String number = p.prescriptionNumber.toLowerCase();
        final String notes = (p.prescriptionNotes ?? '').toLowerCase();
        if (number.contains(q) || notes.contains(q)) return true;
        for (final MedicationItem m in p.medications) {
          if (m.medicationName.toLowerCase().contains(q)) return true;
          if ((m.arabicName ?? '').toLowerCase().contains(q)) return true;
        }
        return false;
      });
    }

    final List<Prescription> sorted = result.toList()
      ..sort(
        (Prescription a, Prescription b) =>
            b.prescriptionDate.compareTo(a.prescriptionDate),
      );
    return sorted;
  }

  // ── Navigation ───────────────────────────────────────────────────────

  void _openDetail(Prescription p) {
    context.push('/prescriptions/${p.id}', extra: p);
  }

  // ── Active-filters bar (mirrors `.pdmr-active-filters`) ──────────────

  Widget _buildActiveFiltersBar() {
    final List<_ActiveFilter> active = <_ActiveFilter>[];
    if (_searchQuery.trim().isNotEmpty) {
      active.add(
        _ActiveFilter(
          label: 'بحث: ${_searchQuery.trim()}',
          onClear: () {
            setState(() {
              _searchQuery = '';
              _searchController.clear();
            });
          },
        ),
      );
    }
    if (_period != RxPeriod.all) {
      active.add(
        _ActiveFilter(
          label: _period.label,
          onClear: () => setState(() => _period = RxPeriod.all),
        ),
      );
    }

    if (active.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: <Widget>[
          const Padding(
            padding: EdgeInsets.only(left: 4, right: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Icon(
                  LucideIcons.slidersHorizontal,
                  size: 13,
                  color: AppColors.textSecondary,
                ),
                SizedBox(width: 4),
                Text(
                  'الفلاتر:',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                    fontFamily: 'Cairo',
                  ),
                ),
              ],
            ),
          ),
          for (final _ActiveFilter f in active) _ActiveFilterChip(filter: f),
          GestureDetector(
            onTap: () {
              setState(() {
                _searchQuery = '';
                _searchController.clear();
                _period = RxPeriod.all;
              });
            },
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 6, vertical: 4),
              child: Text(
                'مسح الكل',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppColors.action,
                  fontFamily: 'Cairo',
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Build ────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<Prescription>> async = ref.watch(
      prescriptionsProvider,
    );

    return async.when(
      loading: () => const LoadingSpinner(message: 'جاري تحميل الوصفات...'),
      error: (Object err, _) => _ErrorView(
        error: err,
        onRetry: () => ref.read(prescriptionsProvider.notifier).refresh(),
      ),
      data: (List<Prescription> all) {
        final Map<RxStatusTab, int> tabCounts = _buildTabCounts(all);
        final List<Prescription> filtered = _applyFilters(all);

        return Column(
          children: <Widget>[
            const SizedBox(height: 12),

            // ── Search bar ──────────────────────────────────────
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: PrescriptionSearchBar(
                controller: _searchController,
                onChanged: (String v) => setState(() => _searchQuery = v),
              ),
            ),
            const SizedBox(height: 10),

            // ── Status tabs + period chips ──────────────────────
            PrescriptionFilterBar(
              currentTab: _tab,
              onTabChanged: (RxStatusTab t) => setState(() => _tab = t),
              currentPeriod: _period,
              onPeriodChanged: (RxPeriod p) => setState(() => _period = p),
              tabCounts: tabCounts,
            ),
            const SizedBox(height: 10),

            // ── Active filters chips ────────────────────────────
            _buildActiveFiltersBar(),

            // ── Content ─────────────────────────────────────────
            Expanded(
              child: filtered.isEmpty
                  ? _EmptyForState(all: all, hasFilters: _hasFilters())
                  : RefreshIndicator(
                      onRefresh: () =>
                          ref.read(prescriptionsProvider.notifier).refresh(),
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                        itemCount: filtered.length,
                        itemBuilder: (BuildContext _, int i) =>
                            PrescriptionListCard(
                              prescription: filtered[i],
                              onTap: _openDetail,
                            ),
                      ),
                    ),
            ),
          ],
        );
      },
    );
  }

  bool _hasFilters() {
    return _tab != RxStatusTab.all ||
        _period != RxPeriod.all ||
        _searchQuery.trim().isNotEmpty;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Active filter chip
// ════════════════════════════════════════════════════════════════════════════

class _ActiveFilter {
  const _ActiveFilter({required this.label, required this.onClear});
  final String label;
  final VoidCallback onClear;
}

class _ActiveFilterChip extends StatelessWidget {
  const _ActiveFilterChip({required this.filter});

  final _ActiveFilter filter;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: filter.onClear,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: const BorderRadius.all(Radius.circular(999)),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text(
              filter.label,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppColors.action,
                fontFamily: 'Cairo',
                height: 1.0,
              ),
            ),
            const SizedBox(width: 5),
            const Icon(LucideIcons.x, size: 11, color: AppColors.action),
          ],
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Empty + error states
// ════════════════════════════════════════════════════════════════════════════

class _EmptyForState extends StatelessWidget {
  const _EmptyForState({required this.all, required this.hasFilters});

  final List<Prescription> all;
  final bool hasFilters;

  @override
  Widget build(BuildContext context) {
    if (all.isEmpty) {
      return const Center(
        child: SingleChildScrollView(
          padding: EdgeInsets.all(24),
          child: EmptyState(
            icon: LucideIcons.pill,
            title: 'لا توجد وصفات',
            subtitle: 'ستظهر هنا الوصفات النشطة بعد كتابتها من قبل الطبيب.',
          ),
        ),
      );
    }
    if (hasFilters) {
      return const Center(
        child: SingleChildScrollView(
          padding: EdgeInsets.all(24),
          child: EmptyState(
            icon: LucideIcons.search,
            title: 'لا نتائج مطابقة',
            subtitle: 'جرّب تغيير الفلاتر أو مصطلح البحث.',
          ),
        ),
      );
    }
    return const Center(
      child: SingleChildScrollView(
        padding: EdgeInsets.all(24),
        child: EmptyState(
          icon: LucideIcons.pill,
          title: 'لا توجد وصفات في هذا التبويب',
          subtitle: 'جرّب تبويب آخر للاطلاع على الوصفات.',
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});

  final Object error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final String msg = error is ApiException
        ? (error as ApiException).toDisplayMessage()
        : error.toString();
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            EmptyState(
              icon: LucideIcons.circleAlert,
              title: 'تعذر تحميل الوصفات',
              subtitle: msg,
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: 200,
              child: PrimaryButton(
                label: 'إعادة المحاولة',
                fullWidth: false,
                onPressed: () => onRetry(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
