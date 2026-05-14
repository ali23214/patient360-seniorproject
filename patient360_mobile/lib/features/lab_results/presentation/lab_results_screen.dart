import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../shared/widgets/app_drawer.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/loading_spinner.dart';
import '../../../shared/widgets/page_header.dart';
import '../../../shared/widgets/primary_button.dart';
import '../../home/presentation/providers/home_providers.dart';
import '../domain/lab_test.dart';
import 'providers/lab_tests_provider.dart';
import 'widgets/lab_test_card.dart';

/// Top-level lab results surface. Lists every `lab_tests` doc visible to
/// the patient, filtered by a 3-tab segmented control, with each row
/// expanding into a results table + PDF link.
class LabResultsScreen extends ConsumerStatefulWidget {
  const LabResultsScreen({super.key});

  @override
  ConsumerState<LabResultsScreen> createState() => _LabResultsScreenState();
}

class _LabResultsScreenState extends ConsumerState<LabResultsScreen> {
  LabTestGroup _tab = LabTestGroup.all;

  /// Tracks which test ids have already triggered the critical-result
  /// SnackBar in this session, so the reminder doesn't fire repeatedly
  /// when the patient collapses + re-expands the same card.
  final Set<String> _criticalSnackShown = <String>{};

  void _onCriticalExpanded(LabTest t) {
    if (_criticalSnackShown.contains(t.id)) return;
    _criticalSnackShown.add(t.id);
    final ScaffoldMessengerState? messenger = ScaffoldMessenger.maybeOf(
      context,
    );
    messenger?.removeCurrentSnackBar();
    messenger?.showSnackBar(
      SnackBar(
        backgroundColor: AppColors.error,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 8),
        content: const Row(
          children: <Widget>[
            Icon(LucideIcons.octagonAlert, color: Colors.white, size: 20),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'نتائج حرجة — يُرجى مراجعة الطبيب في أقرب وقت.',
                style: TextStyle(color: Colors.white, height: 1.4),
              ),
            ),
          ],
        ),
        action: SnackBarAction(
          label: 'اتصل بالطبيب',
          textColor: Colors.white,
          // Disabled in v1 — call flow lands in a later prompt. The snack
          // simply dismisses on tap so the patient can ack the warning.
          onPressed: () {
            messenger.hideCurrentSnackBar();
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<LabTest>> async = ref.watch(labTestsProvider);
    final int unread =
        ref.watch(dashboardOverviewProvider).value?.unreadNotifications ?? 0;

    return Scaffold(
      appBar: PageHeader(
        title: 'نتائج المختبر',
        subtitle: 'نتائج الفحوصات المخبرية',
        unreadCount: unread,
      ),
      drawer: const AppDrawer(),
      body: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: _TabBar(
              current: _tab,
              onChange: (LabTestGroup g) => setState(() => _tab = g),
            ),
          ),
          Expanded(
            child: async.when(
              loading: () =>
                  const LoadingSpinner(message: 'جاري تحميل نتائج المختبر...'),
              error: (Object err, _) => _ErrorView(
                error: err,
                onRetry: () => ref.read(labTestsProvider.notifier).refresh(),
              ),
              data: (List<LabTest> all) {
                final List<LabTest> bucket = all.where(_tab.includes).toList();
                if (bucket.isEmpty) {
                  return _EmptyForTab(tab: _tab);
                }
                return RefreshIndicator(
                  onRefresh: () =>
                      ref.read(labTestsProvider.notifier).refresh(),
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                    itemCount: bucket.length,
                    itemBuilder: (BuildContext _, int i) => LabTestCard(
                      test: bucket[i],
                      onFirstExpandIfCritical: _onCriticalExpanded,
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _TabBar extends StatelessWidget {
  const _TabBar({required this.current, required this.onChange});
  final LabTestGroup current;
  final ValueChanged<LabTestGroup> onChange;

  static const List<(LabTestGroup, String)> _tabs = <(LabTestGroup, String)>[
    (LabTestGroup.all, 'الكل'),
    (LabTestGroup.pending, 'بانتظار النتائج'),
    (LabTestGroup.completed, 'مكتملة'),
  ];

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Row(
        children: <Widget>[
          for (final (LabTestGroup g, String label) in _tabs)
            Expanded(
              child: _TabButton(
                label: label,
                selected: g == current,
                onTap: () => onChange(g),
              ),
            ),
        ],
      ),
    );
  }
}

class _TabButton extends StatelessWidget {
  const _TabButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Material(
      color: selected ? AppColors.action : Colors.transparent,
      borderRadius: AppRadii.radiusMd,
      child: InkWell(
        borderRadius: AppRadii.radiusMd,
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : scheme.onSurfaceVariant,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyForTab extends StatelessWidget {
  const _EmptyForTab({required this.tab});
  final LabTestGroup tab;

  @override
  Widget build(BuildContext context) {
    final String subtitle = switch (tab) {
      LabTestGroup.all => 'ستظهر هنا فحوصاتك المخبرية بعد طلبها من قبل الطبيب.',
      LabTestGroup.pending => 'لا توجد فحوصات بانتظار النتائج حالياً.',
      LabTestGroup.completed => 'لا توجد نتائج مخبرية مكتملة بعد.',
    };
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: EmptyState(
          icon: LucideIcons.flaskConical,
          title: 'لا توجد فحوصات',
          subtitle: subtitle,
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
