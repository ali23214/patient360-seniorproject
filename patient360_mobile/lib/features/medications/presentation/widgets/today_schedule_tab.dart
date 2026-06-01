import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../shared/widgets/empty_state.dart';
import '../../domain/scheduled_dose.dart';
import '../providers/medications_providers.dart';
import 'adherence_summary_card.dart';
import 'dose_row.dart';

/// Body for the schedule sub-tab: the daily progress card on top, the
/// list of today's doses grouped by time-of-day below.
///
/// The optional [focusDosePayload] (`scheduleId:scheduledAtIso` from the
/// notification deep-link) drives a one-time scroll-to + highlight pulse.
/// Once consumed, [onFocusConsumed] is called so the parent can clear its
/// state and avoid re-pulsing on tab switches.
class TodayScheduleTab extends ConsumerStatefulWidget {
  const TodayScheduleTab({
    this.focusDosePayload,
    this.onFocusConsumed,
    this.onShowPrescriptions,
    super.key,
  });

  final String? focusDosePayload;
  final VoidCallback? onFocusConsumed;
  final VoidCallback? onShowPrescriptions;

  @override
  ConsumerState<TodayScheduleTab> createState() => _TodayScheduleTabState();
}

class _TodayScheduleTabState extends ConsumerState<TodayScheduleTab> {
  final ScrollController _scrollController = ScrollController();
  final Map<String, GlobalKey> _rowKeys = <String, GlobalKey>{};

  /// Row identifier currently flagged for the pulse animation.
  String? _highlightedKey;

  /// Last payload we scrolled-to. Used to debounce repeated activations.
  String? _consumedPayload;

  @override
  void initState() {
    super.initState();
    _scheduleFocusIfNeeded();
  }

  @override
  void didUpdateWidget(covariant TodayScheduleTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.focusDosePayload != oldWidget.focusDosePayload) {
      _scheduleFocusIfNeeded();
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scheduleFocusIfNeeded() {
    final String? payload = widget.focusDosePayload;
    if (payload == null || payload.isEmpty) return;
    if (payload == _consumedPayload) return;
    _consumedPayload = payload;

    SchedulerBinding.instance.addPostFrameCallback((Duration _) {
      if (!mounted) return;
      final GlobalKey? targetKey = _rowKeys[payload];
      final BuildContext? targetCtx = targetKey?.currentContext;
      if (targetCtx == null) {
        // The dose may not exist (stale notification or schedule deleted);
        // clear the pending focus so the parent can reset.
        widget.onFocusConsumed?.call();
        return;
      }

      final bool reduceMotion = MediaQuery.disableAnimationsOf(context);
      Scrollable.ensureVisible(
        targetCtx,
        duration: reduceMotion
            ? Duration.zero
            : const Duration(milliseconds: 350),
        alignment: 0.3,
        curve: Curves.easeOut,
      );

      setState(() => _highlightedKey = payload);

      Future<void>.delayed(
        reduceMotion
            ? const Duration(milliseconds: 1)
            : const Duration(seconds: 2),
      ).then((_) {
        if (!mounted) return;
        setState(() => _highlightedKey = null);
        widget.onFocusConsumed?.call();
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final List<ScheduledDose> doses = ref.watch(todayDosesProvider);

    if (doses.isEmpty) {
      return Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: EmptyState(
            icon: LucideIcons.pill,
            title: 'لا توجد جرعات اليوم',
            subtitle:
                'عندما يصف لك الطبيب دواءً وتفعّل التذكير، ستظهر جرعاتك هنا.',
            ctaLabel: 'عرض الوصفات',
            onCta: widget.onShowPrescriptions,
          ),
        ),
      );
    }

    final List<_ListBlock> blocks = _groupByPeriod(doses);

    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      itemCount: blocks.length + 1,
      itemBuilder: (BuildContext _, int i) {
        if (i == 0) return const AdherenceSummaryCard();
        final _ListBlock block = blocks[i - 1];
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            const SizedBox(height: 16),
            _PeriodHeader(label: block.label, sampleTime: block.sampleTime),
            const SizedBox(height: 4),
            for (final ScheduledDose d in block.doses)
              _buildRow(d),
          ],
        );
      },
    );
  }

  DoseRow _buildRow(ScheduledDose d) {
    final String key = focusKeyFor(d);
    final GlobalKey rowKey = _rowKeys.putIfAbsent(key, () => GlobalKey());
    return DoseRow(
      dose: d,
      highlighted: _highlightedKey == key,
      rowKey: rowKey,
    );
  }

  /// Buckets doses into 4 fixed periods based on the hour of [scheduledAt].
  /// Each period header carries a representative time so the patient sees
  /// "الصباح 08:00" rather than "الصباح".
  static List<_ListBlock> _groupByPeriod(List<ScheduledDose> doses) {
    final Map<_Period, List<ScheduledDose>> byPeriod = <_Period, List<ScheduledDose>>{
      for (final _Period p in _Period.values) p: <ScheduledDose>[],
    };
    for (final ScheduledDose d in doses) {
      byPeriod[_periodFor(d.scheduledAt.hour)]!.add(d);
    }
    final List<_ListBlock> out = <_ListBlock>[];
    for (final _Period p in _Period.values) {
      final List<ScheduledDose> bucket = byPeriod[p]!;
      if (bucket.isEmpty) continue;
      out.add(
        _ListBlock(
          label: p.label,
          sampleTime: bucket.first.scheduledAt,
          doses: bucket,
        ),
      );
    }
    return out;
  }

  static _Period _periodFor(int hour) {
    if (hour < 12) return _Period.morning;
    if (hour < 17) return _Period.noon;
    if (hour < 21) return _Period.evening;
    return _Period.night;
  }
}

/// Stable identifier matching the deep-link payload format
/// `<scheduleId>:<scheduledAtIso>` (also accepts a fallback to
/// `<prescriptionId>:<scheduledAtIso>` so doses without a tracked
/// scheduleId still resolve consistently).
String focusKeyFor(ScheduledDose d) {
  final String head = d.scheduleId ?? d.prescriptionId;
  return '$head:${d.scheduledAt.toIso8601String()}';
}

class _PeriodHeader extends StatelessWidget {
  const _PeriodHeader({required this.label, required this.sampleTime});
  final String label;
  final DateTime sampleTime;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final String time =
        '${sampleTime.hour.toString().padLeft(2, '0')}:${sampleTime.minute.toString().padLeft(2, '0')}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: <Widget>[
          Text(
            label,
            style: Theme.of(context)
                .textTheme
                .labelLarge
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(width: 8),
          Text(
            time,
            textDirection: TextDirection.ltr,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Container(
              height: 1,
              color: scheme.outline.withValues(alpha: 0.50),
            ),
          ),
        ],
      ),
    );
  }
}

enum _Period { morning, noon, evening, night }

extension on _Period {
  String get label => switch (this) {
        _Period.morning => 'الصباح',
        _Period.noon => 'الظهيرة',
        _Period.evening => 'المساء',
        _Period.night => 'الليل',
      };
}

class _ListBlock {
  const _ListBlock({
    required this.label,
    required this.sampleTime,
    required this.doses,
  });
  final String label;
  final DateTime sampleTime;
  final List<ScheduledDose> doses;
}
