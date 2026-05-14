import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/loading_spinner.dart';
import '../../../shared/widgets/page_header.dart';
import '../../../shared/widgets/primary_button.dart';
import '../../home/presentation/providers/home_providers.dart';
import '../domain/prescription.dart';
import 'providers/prescriptions_provider.dart';
import 'widgets/prescription_card.dart';

/// Stand-alone screen for the /prescriptions and /medications routes.
/// Re-uses [PrescriptionsList] (exported below) so prompt 6.5's medications
/// hub can drop the same body into a different chrome.
class PrescriptionsScreen extends ConsumerWidget {
  const PrescriptionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final int unread = ref
            .watch(dashboardOverviewProvider)
            .value
            ?.unreadNotifications ??
        0;
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

/// Body-only widget — the 3-tab segmented row plus the active list. Lets
/// prompt 6.5 embed the same UI inside a tabbed medications hub without
/// nesting Scaffolds.
class PrescriptionsList extends ConsumerStatefulWidget {
  const PrescriptionsList({super.key});

  @override
  ConsumerState<PrescriptionsList> createState() =>
      _PrescriptionsListState();
}

class _PrescriptionsListState extends ConsumerState<PrescriptionsList> {
  PrescriptionGroup _tab = PrescriptionGroup.active;

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<Prescription>> async =
        ref.watch(prescriptionsProvider);

    return Column(
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: _TabBar(
            current: _tab,
            onChange: (PrescriptionGroup g) =>
                setState(() => _tab = g),
          ),
        ),
        Expanded(
          child: async.when(
            loading: () => const LoadingSpinner(
                message: 'جاري تحميل الوصفات...'),
            error: (Object err, _) => _ErrorView(
              error: err,
              onRetry: () =>
                  ref.read(prescriptionsProvider.notifier).refresh(),
            ),
            data: (List<Prescription> list) {
              final List<Prescription> bucket = list
                  .where(
                    (Prescription p) => _tab.includes(p.status),
                  )
                  .toList();
              if (bucket.isEmpty) {
                return _EmptyForTab(tab: _tab);
              }
              return RefreshIndicator(
                onRefresh: () => ref
                    .read(prescriptionsProvider.notifier)
                    .refresh(),
                child: ListView.builder(
                  padding:
                      const EdgeInsets.fromLTRB(16, 4, 16, 24),
                  itemCount: bucket.length,
                  itemBuilder: (BuildContext _, int i) =>
                      PrescriptionCard(prescription: bucket[i]),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _TabBar extends StatelessWidget {
  const _TabBar({required this.current, required this.onChange});
  final PrescriptionGroup current;
  final ValueChanged<PrescriptionGroup> onChange;

  static const List<(PrescriptionGroup, String)> _tabs =
      <(PrescriptionGroup, String)>[
    (PrescriptionGroup.active, 'النشطة'),
    (PrescriptionGroup.dispensed, 'تم صرفها'),
    (PrescriptionGroup.expired, 'منتهية/ملغاة'),
  ];

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.outline),
      ),
      child: Row(
        children: <Widget>[
          for (final (PrescriptionGroup g, String label) in _tabs)
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
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : scheme.onSurfaceVariant,
              fontWeight:
                  selected ? FontWeight.w700 : FontWeight.w500,
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
  final PrescriptionGroup tab;

  @override
  Widget build(BuildContext context) {
    final String subtitle = switch (tab) {
      PrescriptionGroup.active =>
        'ستظهر هنا الوصفات النشطة بعد كتابتها من قبل الطبيب.',
      PrescriptionGroup.dispensed =>
        'لا توجد وصفات مصروفة بعد.',
      PrescriptionGroup.expired =>
        'لا يوجد محتوى لعرضه في هذا التبويب.',
    };
    return const Center(
      child: SingleChildScrollView(
        padding: EdgeInsets.all(24),
        child: EmptyState(
          icon: LucideIcons.pill,
          title: 'لا توجد وصفات',
          subtitle: 'انتظر حتى يكتب لك الطبيب وصفة جديدة.',
        ),
      ),
    ).copyWithSubtitle(subtitle);
  }
}

extension on Center {
  /// Tiny helper to keep the empty state copy DRY without re-creating the
  /// whole tree. Returns a fresh Center with the same alignment but the
  /// subtitle replaced.
  Center copyWithSubtitle(String subtitle) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: EmptyState(
          icon: LucideIcons.pill,
          title: 'لا توجد وصفات',
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
