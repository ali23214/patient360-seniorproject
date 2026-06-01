import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/localization/arabic_labels.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/lab_test.dart';
import '../../domain/test_ordered.dart';
import '../providers/lab_tests_provider.dart';
import 'pdf_opener.dart';
import 'results_table.dart';

/// Single lab-test card. Collapsed shows the testNumber, order date, and
/// status. Tapping it expands to reveal the ordered panel chips + results
/// table + PDF link + lab notes + sample info.
///
/// On the *first* expand of a `completed && !isViewedByPatient` test the
/// card invokes [LabTestsController.markViewed] optimistically. The
/// SnackBar reminder for critical results is fired by the parent screen
/// (which owns the `seenCritical` per-session set).
class LabTestCard extends ConsumerStatefulWidget {
  const LabTestCard({
    required this.test,
    this.onFirstExpandIfCritical,
    super.key,
  });

  final LabTest test;

  /// Called once per session per test when the card opens AND the test
  /// has `criticalCount > 0`. The screen wires this to [ScaffoldMessenger]
  /// to show the persistent reminder SnackBar.
  final ValueChanged<LabTest>? onFirstExpandIfCritical;

  @override
  ConsumerState<LabTestCard> createState() => _LabTestCardState();
}

class _LabTestCardState extends ConsumerState<LabTestCard> {
  bool _expanded = false;

  void _toggle() {
    setState(() => _expanded = !_expanded);
    if (!_expanded) return;

    final LabTest t = widget.test;
    if (t.isCompleted && !t.isViewedByPatient) {
      // ignore: discarded_futures
      ref.read(labTestsProvider.notifier).markViewed(t.id);
    }
    if (t.criticalCount > 0) {
      widget.onFirstExpandIfCritical?.call(t);
    }
  }

  @override
  Widget build(BuildContext context) {
    final LabTest t = widget.test;
    final ColorScheme scheme = Theme.of(context).colorScheme;

    final bool unread = t.isCompleted && !t.isViewedByPatient;
    final Color cardBg = scheme.surfaceContainer;
    final Color border = unread
        ? AppColors.action.withValues(alpha: 0.55)
        : scheme.outline;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          InkWell(
            borderRadius: AppRadii.radiusLg,
            onTap: _toggle,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
              child: _CollapsedHeader(test: t, expanded: _expanded),
            ),
          ),
          AnimatedCrossFade(
            crossFadeState: _expanded
                ? CrossFadeState.showSecond
                : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 220),
            firstChild: const SizedBox.shrink(),
            secondChild: Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: _ExpandedBody(test: t),
            ),
          ),
        ],
      ),
    );
  }
}

class _CollapsedHeader extends StatelessWidget {
  const _CollapsedHeader({required this.test, required this.expanded});
  final LabTest test;
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final bool unread = test.isCompleted && !test.isViewedByPatient;
    final Color tint =
        test.isCompleted ? AppColors.success : AppColors.warning;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: tint.withValues(alpha: 0.15),
            borderRadius: AppRadii.radiusMd,
          ),
          alignment: Alignment.center,
          child: Icon(LucideIcons.flaskConical, size: 22, color: tint),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Flexible(
                    child: Text(
                      test.testNumber,
                      textDirection: TextDirection.ltr,
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (unread) ...<Widget>[
                    const SizedBox(width: 6),
                    const _UnreadDot(),
                  ],
                ],
              ),
              const SizedBox(height: 4),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: <Widget>[
                  _MetaChip(
                    icon: LucideIcons.calendarDays,
                    label: _formatDate(test.orderDate),
                    direction: TextDirection.ltr,
                  ),
                  _StatusChip(status: test.status),
                  if (test.criticalCount > 0)
                    const _FlagChip(
                      icon: LucideIcons.octagonAlert,
                      label: 'حرج',
                      color: AppColors.error,
                    )
                  else if (test.abnormalCount > 0)
                    const _FlagChip(
                      icon: LucideIcons.triangleAlert,
                      label: 'غير طبيعي',
                      color: AppColors.warning,
                    ),
                ],
              ),
            ],
          ),
        ),
        Icon(
          expanded ? LucideIcons.chevronUp : LucideIcons.chevronDown,
          size: 22,
          color: scheme.onSurfaceVariant,
        ),
      ],
    );
  }

  static String _formatDate(DateTime d) =>
      intl.DateFormat('yyyy-MM-dd').format(d);
}

class _ExpandedBody extends StatelessWidget {
  const _ExpandedBody({required this.test});
  final LabTest test;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextStyle? mutedSmall =
        Theme.of(context).textTheme.bodySmall?.copyWith(
              color: scheme.onSurfaceVariant,
            );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (test.testsOrdered.isNotEmpty) ...<Widget>[
          const _SectionTitle(label: 'الفحوصات المطلوبة'),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: <Widget>[
              for (final TestOrdered o in test.testsOrdered)
                _TestOrderedChip(item: o),
            ],
          ),
          const SizedBox(height: 14),
        ],
        const _SectionTitle(label: 'النتائج'),
        const SizedBox(height: 6),
        ResultsTable(results: test.testResults),
        if (test.resultPdfUrl != null && test.resultPdfUrl!.isNotEmpty) ...<Widget>[
          const SizedBox(height: 12),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: PdfOpener(resultPdfUrl: test.resultPdfUrl!),
          ),
        ],
        if (test.labNotes != null && test.labNotes!.isNotEmpty) ...<Widget>[
          const SizedBox(height: 14),
          const _SectionTitle(label: 'ملاحظات المختبر'),
          const SizedBox(height: 4),
          Text(test.labNotes!, style: Theme.of(context).textTheme.bodyMedium),
        ],
        if (_hasSampleInfo(test)) ...<Widget>[
          const SizedBox(height: 14),
          Wrap(
            spacing: 14,
            runSpacing: 4,
            children: <Widget>[
              if (test.sampleType != null && test.sampleType!.isNotEmpty)
                _SampleInfo(
                  label: 'العينة',
                  value: test.sampleType!,
                  ltr: false,
                  style: mutedSmall,
                ),
              if (test.sampleId != null && test.sampleId!.isNotEmpty)
                _SampleInfo(
                  label: 'رقم العينة',
                  value: test.sampleId!,
                  ltr: true,
                  style: mutedSmall,
                ),
              if (test.sampleCollectedAt != null)
                _SampleInfo(
                  label: 'تاريخ الأخذ',
                  value: intl.DateFormat('yyyy-MM-dd HH:mm')
                      .format(test.sampleCollectedAt!),
                  ltr: true,
                  style: mutedSmall,
                ),
            ],
          ),
        ],
      ],
    );
  }

  static bool _hasSampleInfo(LabTest t) =>
      (t.sampleType != null && t.sampleType!.isNotEmpty) ||
      (t.sampleId != null && t.sampleId!.isNotEmpty) ||
      t.sampleCollectedAt != null;
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: Theme.of(context)
          .textTheme
          .labelLarge
          ?.copyWith(fontWeight: FontWeight.w700),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({
    required this.icon,
    required this.label,
    this.direction,
  });
  final IconData icon;
  final String label;
  final TextDirection? direction;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Icon(icon, size: 14, color: scheme.onSurfaceVariant),
        const SizedBox(width: 4),
        Text(
          label,
          textDirection: direction,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
        ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final String label = ArabicLabels.lookup(ArabicLabels.labStatus, status);
    final Color color = _colorFor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: AppRadii.radiusSm,
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          height: 1.0,
        ),
      ),
    );
  }

  static Color _colorFor(String s) => switch (s) {
        'completed' => AppColors.success,
        'cancelled' || 'rejected' => AppColors.error,
        _ => AppColors.warning,
      };
}

class _FlagChip extends StatelessWidget {
  const _FlagChip({
    required this.icon,
    required this.label,
    required this.color,
  });
  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: AppRadii.radiusSm,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _UnreadDot extends StatelessWidget {
  const _UnreadDot();
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 8,
      height: 8,
      decoration: const BoxDecoration(
        color: AppColors.action,
        shape: BoxShape.circle,
      ),
    );
  }
}

class _TestOrderedChip extends StatelessWidget {
  const _TestOrderedChip({required this.item});
  final TestOrdered item;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.18),
        borderRadius: AppRadii.radiusSm,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (item.testCode.isNotEmpty) ...<Widget>[
            Text(
              item.testCode,
              textDirection: TextDirection.ltr,
              style: TextStyle(
                color: scheme.onSurface,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                fontFamily: 'Inter',
              ),
            ),
            const SizedBox(width: 6),
            Container(
              width: 1,
              height: 10,
              color: scheme.outline,
            ),
            const SizedBox(width: 6),
          ],
          Flexible(
            child: Text(
              item.testName,
              style: TextStyle(
                color: scheme.onSurface,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _SampleInfo extends StatelessWidget {
  const _SampleInfo({
    required this.label,
    required this.value,
    required this.ltr,
    required this.style,
  });
  final String label;
  final String value;
  final bool ltr;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text('$label: ', style: style),
        Text(
          value,
          textDirection: ltr ? TextDirection.ltr : null,
          style: style?.copyWith(fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}
