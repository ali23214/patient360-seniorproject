// ════════════════════════════════════════════════════════════════════════════
//  LabResultsScreen
//  ──────────────────────────────────────────────────────────────────────────
//  Top-level lab results surface. Mirrors the web's `renderLabTests()`
//  section in PatientDashboard.jsx — same toolbar UX (status tabs, period
//  chips, search, unread alert) and the same `LabResultCard` row layout.
//
//  Filtering pipeline (applied in order):
//    1. Status tab        (all | results | pending | cancelled)
//    2. Period            (all | week | month | 3 months | year)
//    3. Search query      (matches testNumber + labNotes + lab id)
//    4. Newest-first sort by orderDate (default)
//
//  Tapping a card navigates to /lab-results/:id (Phase 4 wiring) and
//  optimistically marks the test as viewed via the existing provider.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/app_drawer.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/loading_spinner.dart';
import '../../../shared/widgets/page_header.dart';
import '../../../shared/widgets/primary_button.dart';
import '../../home/presentation/providers/home_providers.dart';
import '../domain/lab_test.dart';
import 'providers/lab_tests_provider.dart';
import 'widgets/lab_filter_bar.dart';
import 'widgets/lab_result_card.dart';
import 'widgets/lab_search_bar.dart';

class LabResultsScreen extends ConsumerStatefulWidget {
  const LabResultsScreen({super.key});

  @override
  ConsumerState<LabResultsScreen> createState() => _LabResultsScreenState();
}

class _LabResultsScreenState extends ConsumerState<LabResultsScreen> {
  LabStatusTab _tab = LabStatusTab.all;
  LabPeriod _period = LabPeriod.all;
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // ── Filter pipeline ──────────────────────────────────────────────────

  /// Status-tab → DB status list (mirrors `LAB_STATUS_GROUPS` in the web).
  static const Map<LabStatusTab, Set<String>> _statusByTab =
      <LabStatusTab, Set<String>>{
        LabStatusTab.all: <String>{
          'ordered',
          'scheduled',
          'sample_collected',
          'in_progress',
          'completed',
          'cancelled',
          'rejected',
        },
        LabStatusTab.pending: <String>{
          'ordered',
          'scheduled',
          'sample_collected',
          'in_progress',
        },
        LabStatusTab.results: <String>{'completed'},
        LabStatusTab.cancelled: <String>{'cancelled', 'rejected'},
      };

  Map<LabStatusTab, int> _buildTabCounts(List<LabTest> all) {
    final Map<LabStatusTab, int> counts = <LabStatusTab, int>{
      for (final LabStatusTab t in LabStatusTab.values) t: 0,
    };
    for (final LabTest test in all) {
      for (final LabStatusTab tab in LabStatusTab.values) {
        if (_statusByTab[tab]!.contains(test.status)) {
          counts[tab] = (counts[tab] ?? 0) + 1;
        }
      }
    }
    return counts;
  }

  int _buildUnreadCount(List<LabTest> all) {
    return all
        .where((LabTest t) => t.status == 'completed' && !t.isViewedByPatient)
        .length;
  }

  List<LabTest> _applyFilters(List<LabTest> all) {
    Iterable<LabTest> result = all;

    // 1. Status tab
    final Set<String> allowedStatuses = _statusByTab[_tab]!;
    result = result.where((LabTest t) => allowedStatuses.contains(t.status));

    // 2. Period cutoff
    final DateTime? cutoff = _period.cutoff();
    if (cutoff != null) {
      result = result.where((LabTest t) => t.orderDate.isAfter(cutoff));
    }

    // 3. Search query
    final String q = _searchQuery.trim().toLowerCase();
    if (q.isNotEmpty) {
      result = result.where((LabTest t) {
        final String number = t.testNumber.toLowerCase();
        final String notes = (t.labNotes ?? '').toLowerCase();
        final String labId = (t.laboratoryId ?? '').toLowerCase();
        return number.contains(q) || notes.contains(q) || labId.contains(q);
      });
    }

    // 4. Sort by orderDate desc (provider already does this, but
    // re-applying is cheap and idempotent).
    final List<LabTest> sorted = result.toList()
      ..sort((LabTest a, LabTest b) => b.orderDate.compareTo(a.orderDate));
    return sorted;
  }

  // ── Navigation ──────────────────────────────────────────────────────

  void _openDetail(LabTest test) {
    // Optimistically mark as viewed (fires the existing controller
    // method — failure auto-reverts the local state).
    if (test.status == 'completed' && !test.isViewedByPatient) {
      // ignore: unawaited_futures
      ref.read(labTestsProvider.notifier).markViewed(test.id);
    }
    // Navigate to detail page (route registered in Phase 4).
    context.push('/lab-results/${test.id}', extra: test);
  }

  // ── Active-filters bar (mirrors `.pdmr-active-filters`) ─────────────

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
    if (_period != LabPeriod.all) {
      active.add(
        _ActiveFilter(
          label: _period.label,
          onClear: () => setState(() => _period = LabPeriod.all),
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
                _period = LabPeriod.all;
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
    final AsyncValue<List<LabTest>> async = ref.watch(labTestsProvider);
    final int unreadNotifications =
        ref.watch(dashboardOverviewProvider).value?.unreadNotifications ?? 0;

    return Scaffold(
      appBar: PageHeader(
        title: 'نتائج المختبر',
        subtitle: 'نتائج الفحوصات المخبرية',
        unreadCount: unreadNotifications,
      ),
      drawer: const AppDrawer(),
      body: async.when(
        loading: () =>
            const LoadingSpinner(message: 'جاري تحميل نتائج المختبر...'),
        error: (Object err, _) => _ErrorView(
          error: err,
          onRetry: () => ref.read(labTestsProvider.notifier).refresh(),
        ),
        data: (List<LabTest> all) {
          final Map<LabStatusTab, int> tabCounts = _buildTabCounts(all);
          final int unreadCount = _buildUnreadCount(all);
          final List<LabTest> filtered = _applyFilters(all);

          return Column(
            children: <Widget>[
              const SizedBox(height: 12),

              // ── Search bar ───────────────────────────────────────
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: LabSearchBar(
                  controller: _searchController,
                  onChanged: (String v) => setState(() => _searchQuery = v),
                ),
              ),
              const SizedBox(height: 10),

              // ── Status tabs + period chips ───────────────────────
              LabFilterBar(
                currentTab: _tab,
                onTabChanged: (LabStatusTab t) => setState(() => _tab = t),
                currentPeriod: _period,
                onPeriodChanged: (LabPeriod p) => setState(() => _period = p),
                tabCounts: tabCounts,
                unreadCount: unreadCount,
              ),
              const SizedBox(height: 10),

              // ── Active filters chips (only when any is active) ───
              _buildActiveFiltersBar(),

              // ── Content ──────────────────────────────────────────
              Expanded(
                child: filtered.isEmpty
                    ? _EmptyForState(all: all, hasFilters: _hasFilters())
                    : RefreshIndicator(
                        onRefresh: () =>
                            ref.read(labTestsProvider.notifier).refresh(),
                        child: ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                          itemCount: filtered.length,
                          itemBuilder: (BuildContext _, int i) => LabResultCard(
                            test: filtered[i],
                            onTap: _openDetail,
                          ),
                        ),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  bool _hasFilters() {
    return _tab != LabStatusTab.all ||
        _period != LabPeriod.all ||
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
// Empty states (no data vs no matches)
// ════════════════════════════════════════════════════════════════════════════

class _EmptyForState extends StatelessWidget {
  const _EmptyForState({required this.all, required this.hasFilters});

  final List<LabTest> all;
  final bool hasFilters;

  @override
  Widget build(BuildContext context) {
    if (all.isEmpty) {
      return const Center(
        child: SingleChildScrollView(
          padding: EdgeInsets.all(24),
          child: EmptyState(
            icon: LucideIcons.flaskConical,
            title: 'لا توجد نتائج في هذا التبويب',
            subtitle: 'ستظهر هنا فور توفرها من المختبر.',
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
          icon: LucideIcons.flaskConical,
          title: 'لا توجد نتائج في هذا التبويب',
          subtitle: 'ستظهر هنا فور توفرها من المختبر.',
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
              title: 'تعذر تحميل النتائج',
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
