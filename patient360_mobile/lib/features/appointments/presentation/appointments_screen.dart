import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/app_drawer.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/loading_spinner.dart';
import '../../../shared/widgets/page_header.dart';
import '../../../shared/widgets/primary_button.dart';
import '../../home/presentation/providers/home_providers.dart';
import '../domain/appointment.dart';
import 'booking_flow_sheet.dart';
import 'cancel_sheet.dart';
import 'providers/appointments_provider.dart';
import 'widgets/appointment_card.dart';

class AppointmentsScreen extends ConsumerStatefulWidget {
  const AppointmentsScreen({super.key});

  @override
  ConsumerState<AppointmentsScreen> createState() => _AppointmentsScreenState();
}

class _AppointmentsScreenState extends ConsumerState<AppointmentsScreen> {
  AppointmentGroup _tab = AppointmentGroup.upcoming;

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<Appointment>> allAsync = ref.watch(
      appointmentsProvider,
    );
    final int unread =
        ref.watch(dashboardOverviewProvider).value?.unreadNotifications ?? 0;

    return Scaffold(
      appBar: PageHeader(
        title: 'المواعيد',
        subtitle: 'إدارة المواعيد القادمة والسابقة',
        unreadCount: unread,
      ),
      drawer: const AppDrawer(),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.action,
        foregroundColor: Colors.white,
        onPressed: () => BookingFlowSheet.show(context),
        icon: const Icon(LucideIcons.plus),
        label: const Text('حجز موعد جديد'),
      ),
      body: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: _TabBar(
              current: _tab,
              onChange: (AppointmentGroup g) => setState(() => _tab = g),
            ),
          ),
          Expanded(
            child: allAsync.when(
              loading: () =>
                  const LoadingSpinner(message: 'جاري تحميل المواعيد...'),
              error: (Object err, _) => _ErrorView(
                error: err,
                onRetry: () =>
                    ref.read(appointmentsProvider.notifier).refresh(),
              ),
              data: (List<Appointment> list) {
                final List<Appointment> bucket =
                    list
                        .where((Appointment a) => _tab.includes(a.status))
                        .toList()
                      ..sort(
                        (Appointment a, Appointment b) =>
                            b.appointmentDate.compareTo(a.appointmentDate),
                      );
                if (bucket.isEmpty) {
                  return _EmptyForTab(
                    tab: _tab,
                    onBook: () => BookingFlowSheet.show(context),
                  );
                }
                return RefreshIndicator(
                  onRefresh: () =>
                      ref.read(appointmentsProvider.notifier).refresh(),
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                    itemCount: bucket.length,
                    itemBuilder: (BuildContext c, int i) {
                      final Appointment a = bucket[i];
                      final bool isUpcoming = AppointmentGroup.upcoming
                          .includes(a.status);
                      return AppointmentCard(
                        appointment: a,
                        onCancel: isUpcoming
                            ? () => CancelSheet.show(context, appointment: a)
                            : null,
                      );
                    },
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

  final AppointmentGroup current;
  final ValueChanged<AppointmentGroup> onChange;

  static const List<(AppointmentGroup, String)> _tabs =
      <(AppointmentGroup, String)>[
        (AppointmentGroup.upcoming, 'القادمة'),
        (AppointmentGroup.past, 'السابقة'),
        (AppointmentGroup.cancelled, 'الملغاة'),
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
          for (final (AppointmentGroup g, String label) in _tabs)
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
  const _EmptyForTab({required this.tab, required this.onBook});

  final AppointmentGroup tab;
  final VoidCallback onBook;

  @override
  Widget build(BuildContext context) {
    final String subtitle = switch (tab) {
      AppointmentGroup.upcoming => 'احجز موعدك الأول من الزر أدناه.',
      AppointmentGroup.past => 'ستظهر هنا عند توفرها.',
      AppointmentGroup.cancelled => 'لا توجد مواعيد ملغاة.',
    };
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: EmptyState(
          icon: LucideIcons.calendar,
          title: 'لا توجد مواعيد',
          subtitle: subtitle,
          ctaLabel: tab == AppointmentGroup.upcoming ? 'حجز موعد' : null,
          onCta: tab == AppointmentGroup.upcoming ? onBook : null,
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
              title: 'تعذر تحميل المواعيد',
              subtitle: msg,
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: 200,
              child: PrimaryButton(
                label: 'إعادة المحاولة',
                onPressed: () => onRetry(),
                fullWidth: false,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
