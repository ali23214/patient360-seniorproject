import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../shared/widgets/app_drawer.dart';
import '../../../shared/widgets/page_header.dart';
import '../../home/presentation/providers/home_providers.dart';
import '../../notifications/presentation/providers/reminder_sync_provider.dart';
import '../../prescriptions/presentation/prescriptions_screen.dart';
import 'widgets/calendar_tab.dart';
import 'widgets/today_schedule_tab.dart';

/// Three-way enumeration of the sub-tabs hosted inside [MedicationsScreen].
/// Maps 1:1 onto the `?tab=` query parameter so deep links can target a
/// specific sub-tab from anywhere in the app.
enum MedicationsTab { schedule, calendar, prescriptions }

extension on MedicationsTab {
  String get label => switch (this) {
    MedicationsTab.schedule => 'الجدول اليوم',
    MedicationsTab.calendar => 'التقويم',
    MedicationsTab.prescriptions => 'الوصفات',
  };
}

/// Parses the `?tab=` query value, falling back to `null` for any unknown
/// or missing token so the caller can apply its own default.
MedicationsTab? medicationsTabFromQuery(String? raw) => switch (raw) {
  'schedule' => MedicationsTab.schedule,
  'calendar' => MedicationsTab.calendar,
  'prescriptions' => MedicationsTab.prescriptions,
  _ => null,
};

/// Parent screen for the bottom-nav "الأدوية" destination. Composes three
/// sub-tabs (today's schedule, monthly calendar, prescriptions list) inside
/// an [IndexedStack] so each keeps its scroll position when the patient
/// switches between them.
///
/// Reads the `?tab=` query param on entry to decide the initial sub-tab.
/// `?focusDose=<scheduleId>:<scheduledAtIso>` is forwarded to the schedule
/// sub-tab so a notification tap can scroll to and pulse the matching row.
///
/// On entry we also touch [reminderSyncProvider] so the OS-level dose
/// reminders stay in sync with [remindersProvider]. The provider is
/// fire-and-forget — once read, its internal `ref.listen` keeps firing for
/// the life of the [ProviderScope].
class MedicationsScreen extends ConsumerStatefulWidget {
  const MedicationsScreen({super.key});

  @override
  ConsumerState<MedicationsScreen> createState() => _MedicationsScreenState();
}

class _MedicationsScreenState extends ConsumerState<MedicationsScreen> {
  MedicationsTab _tab = MedicationsTab.schedule;

  /// Cleared once the schedule sub-tab consumes it, so subsequent tab
  /// switches don't re-trigger the pulse animation.
  String? _focusDosePayload;

  /// Tracks whether we've applied the initial query-param read. Without
  /// this, every dependency change (e.g. theme flip) would re-stomp the
  /// patient's current sub-tab back to the URL's value.
  bool _initialQueryApplied = false;

  @override
  void initState() {
    super.initState();
    // Activate the reminder → OS-notifications bridge. One read is enough;
    // the provider keeps its own ref.listen alive for the session.
    ref.read(reminderSyncProvider);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Always honor incoming query-param updates so notification deep-links
    // re-route a live screen. The first call also seeds the initial tab.
    final GoRouterState state = GoRouterState.of(context);
    final MedicationsTab? incomingTab = _readTabFromQuery(state);
    final String? incomingFocus = state.uri.queryParameters['focusDose'];

    if (!_initialQueryApplied) {
      _initialQueryApplied = true;
      _tab = incomingTab ?? MedicationsTab.schedule;
      _focusDosePayload = incomingFocus;
      return;
    }

    if (incomingTab != null && incomingTab != _tab) {
      setState(() => _tab = incomingTab);
    }
    if (incomingFocus != null && incomingFocus != _focusDosePayload) {
      setState(() => _focusDosePayload = incomingFocus);
    }
  }

  static MedicationsTab? _readTabFromQuery(GoRouterState s) =>
      medicationsTabFromQuery(s.uri.queryParameters['tab']);

  void _select(MedicationsTab next) {
    if (next == _tab) return;
    setState(() => _tab = next);
  }

  void _onFocusConsumed() {
    if (_focusDosePayload == null) return;
    setState(() => _focusDosePayload = null);
  }

  @override
  Widget build(BuildContext context) {
    final int unread =
        ref.watch(dashboardOverviewProvider).value?.unreadNotifications ?? 0;

    return Scaffold(
      appBar: PageHeader(
        title: 'الأدوية',
        subtitle: 'جرعاتك اليومية وأدويتك',
        unreadCount: unread,
      ),
      drawer: const AppDrawer(),
      body: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: _SegmentedTabs(current: _tab, onChange: _select),
          ),
          Expanded(
            child: IndexedStack(
              index: _tab.index,
              children: <Widget>[
                TodayScheduleTab(
                  focusDosePayload: _tab == MedicationsTab.schedule
                      ? _focusDosePayload
                      : null,
                  onFocusConsumed: _onFocusConsumed,
                  onShowPrescriptions: () =>
                      _select(MedicationsTab.prescriptions),
                ),
                const CalendarTab(),
                const PrescriptionsList(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SegmentedTabs extends StatelessWidget {
  const _SegmentedTabs({required this.current, required this.onChange});

  final MedicationsTab current;
  final ValueChanged<MedicationsTab> onChange;

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
          for (final MedicationsTab t in MedicationsTab.values)
            Expanded(
              child: _SegmentedButton(
                label: t.label,
                selected: t == current,
                onTap: () => onChange(t),
              ),
            ),
        ],
      ),
    );
  }
}

class _SegmentedButton extends StatelessWidget {
  const _SegmentedButton({
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
