import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/localization/arabic_labels.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/error_snackbar.dart';
import '../../../shared/widgets/ghost_button.dart';
import '../../../shared/widgets/loading_spinner.dart';
import '../../../shared/widgets/primary_button.dart';
import '../domain/appointment.dart';
import '../domain/availability_slot.dart';
import '../domain/doctor_summary.dart';
import 'providers/booking_flow_provider.dart';

/// Full-height modal wizard for booking a doctor appointment.
///
/// Three pages, one per [BookingStep]: specialization search → slot pick →
/// confirm with reason + priority. State lives in [bookingFlowProvider] and
/// auto-disposes when the sheet closes.
class BookingFlowSheet extends ConsumerStatefulWidget {
  const BookingFlowSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const BookingFlowSheet(),
    );
  }

  @override
  ConsumerState<BookingFlowSheet> createState() => _BookingFlowSheetState();
}

class _BookingFlowSheetState extends ConsumerState<BookingFlowSheet> {
  final PageController _pageController = PageController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_pageController.hasClients) return;
      final int target =
          ref.read(bookingFlowProvider).step.index;
      if (_pageController.page?.round() != target) {
        _pageController.jumpToPage(target);
      }
    });
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<BookingFlowState>(bookingFlowProvider,
        (BookingFlowState? prev, BookingFlowState next) {
      if (prev?.step != next.step && _pageController.hasClients) {
        _pageController.animateToPage(
          next.step.index,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });

    final BookingFlowState s = ref.watch(bookingFlowProvider);
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: FractionallySizedBox(
        heightFactor: 0.92,
        child: Container(
          decoration: BoxDecoration(
            color: scheme.surfaceContainer,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(20),
            ),
          ),
          child: Column(
            children: <Widget>[
              _Header(onClose: () => Navigator.of(context).pop()),
              _StepperIndicator(current: s.step),
              const Divider(height: 1),
              Expanded(
                child: PageView(
                  controller: _pageController,
                  physics: const NeverScrollableScrollPhysics(),
                  children: const <Widget>[
                    _SearchPage(),
                    _SlotsPage(),
                    _ConfirmPage(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Header + stepper
// ═══════════════════════════════════════════════════════════════════════════

class _Header extends StatelessWidget {
  const _Header({required this.onClose});

  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 8, 8),
      child: Row(
        children: <Widget>[
          const Icon(LucideIcons.plus, color: AppColors.action),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'حجز موعد جديد',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
          ),
          IconButton(
            icon: const Icon(LucideIcons.x),
            tooltip: 'إغلاق',
            onPressed: onClose,
          ),
        ],
      ),
    );
  }
}

class _StepperIndicator extends StatelessWidget {
  const _StepperIndicator({required this.current});

  final BookingStep current;

  static const List<String> _labels = <String>[
    'اختيار الطبيب',
    'اختيار الموعد',
    'التأكيد',
  ];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        children: <Widget>[
          for (int i = 0; i < _labels.length; i++) ...<Widget>[
            _StepBubble(
              index: i + 1,
              label: _labels[i],
              active: current.index == i,
              completed: current.index > i,
            ),
            if (i < _labels.length - 1)
              const Expanded(child: Divider(height: 1, thickness: 1)),
          ],
        ],
      ),
    );
  }
}

class _StepBubble extends StatelessWidget {
  const _StepBubble({
    required this.index,
    required this.label,
    required this.active,
    required this.completed,
  });

  final int index;
  final String label;
  final bool active;
  final bool completed;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final Color bg = active || completed
        ? AppColors.action
        : scheme.surfaceContainerHighest;
    final Color fg =
        active || completed ? Colors.white : scheme.onSurfaceVariant;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
          alignment: Alignment.center,
          child: Text(
            '$index',
            style: TextStyle(
              color: fg,
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
        ),
        const SizedBox(height: 4),
        SizedBox(
          width: 88,
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: active
                      ? AppColors.action
                      : scheme.onSurfaceVariant,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                ),
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Step 1 — search
// ═══════════════════════════════════════════════════════════════════════════

class _SearchPage extends ConsumerWidget {
  const _SearchPage();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final BookingFlowState s = ref.watch(bookingFlowProvider);
    final BookingFlowController ctrl =
        ref.read(bookingFlowProvider.notifier);
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      children: <Widget>[
        Text(
          'اختر التخصص',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: s.specialization,
          isExpanded: true,
          decoration: const InputDecoration(
            prefixIcon: Icon(LucideIcons.stethoscope),
            hintText: 'اختر التخصص',
          ),
          items: <DropdownMenuItem<String>>[
            for (final MapEntry<String, String> e
                in ArabicLabels.specialization.entries)
              DropdownMenuItem<String>(
                value: e.key,
                child: Text(e.value),
              ),
          ],
          onChanged: ctrl.setSpecialization,
        ),
        const SizedBox(height: 12),
        Text(
          'المحافظة (اختياري)',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: s.governorate,
          isExpanded: true,
          decoration: const InputDecoration(
            prefixIcon: Icon(LucideIcons.mapPin),
            hintText: 'كل المحافظات',
          ),
          items: <DropdownMenuItem<String>>[
            const DropdownMenuItem<String>(
              child: Text('كل المحافظات'),
            ),
            for (final MapEntry<String, String> e
                in ArabicLabels.governorate.entries)
              DropdownMenuItem<String>(
                value: e.key,
                child: Text(e.value),
              ),
          ],
          onChanged: ctrl.setGovernorate,
        ),
        const SizedBox(height: 16),
        PrimaryButton(
          label: 'بحث',
          icon: LucideIcons.search,
          loading: s.doctors.isLoading,
          onPressed: s.specialization == null
              ? null
              : () => ctrl.searchDoctors(),
        ),
        const SizedBox(height: 16),
        s.doctors.when(
          loading: () => const LoadingSpinner(message: 'جاري البحث...'),
          error: (Object e, _) => EmptyState(
            icon: LucideIcons.circleAlert,
            title: 'تعذر البحث',
            subtitle: e is ApiException ? e.toDisplayMessage() : '$e',
          ),
          data: (List<DoctorSummary> list) {
            if (list.isEmpty) {
              return const EmptyState(
                icon: LucideIcons.stethoscope,
                title: 'اختر تخصصاً وابدأ البحث',
                subtitle: 'سنعرض هنا الأطباء المتاحين.',
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                for (final DoctorSummary d in list)
                  _DoctorTile(
                    doctor: d,
                    onTap: () => ctrl.pickDoctor(d),
                  ),
              ],
            );
          },
        ),
        const SizedBox(height: 16),
        Divider(height: 1, color: scheme.outline),
        const SizedBox(height: 12),
        GhostButton(
          label: 'إلغاء',
          onPressed: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }
}

class _DoctorTile extends StatelessWidget {
  const _DoctorTile({required this.doctor, required this.onTap});

  final DoctorSummary doctor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;
    final String specLabel = ArabicLabels.lookup(
      ArabicLabels.specialization,
      doctor.specialization,
    );
    final double? rating = doctor.averageRating;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: scheme.surface,
        borderRadius: AppRadii.radiusMd,
        child: InkWell(
          borderRadius: AppRadii.radiusMd,
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 10,
            ),
            decoration: BoxDecoration(
              border: Border.all(color: scheme.outline),
              borderRadius: AppRadii.radiusMd,
            ),
            child: Row(
              children: <Widget>[
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.action.withValues(alpha: 0.15),
                    borderRadius: AppRadii.radiusMd,
                  ),
                  alignment: Alignment.center,
                  child: const Icon(
                    LucideIcons.stethoscope,
                    color: AppColors.action,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Text(
                        doctor.displayName,
                        style: text.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                        textDirection: TextDirection.rtl,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        specLabel,
                        style: text.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                      if (rating != null || doctor.consultationFee != null) ...<Widget>[
                        const SizedBox(height: 2),
                        Row(
                          children: <Widget>[
                            if (rating != null) ...<Widget>[
                              const Icon(
                                LucideIcons.star,
                                size: 12,
                                color: Color(0xFFFFC107),
                              ),
                              const SizedBox(width: 3),
                              Text(
                                rating.toStringAsFixed(1),
                                textDirection: TextDirection.ltr,
                                style: text.bodySmall,
                              ),
                              const SizedBox(width: 8),
                            ],
                            if (doctor.consultationFee != null)
                              Text(
                                '${doctor.consultationFee!.toStringAsFixed(0)} ${doctor.currency ?? 'SYP'}',
                                textDirection: TextDirection.ltr,
                                style: text.bodySmall?.copyWith(
                                  color: scheme.onSurfaceVariant,
                                ),
                              ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  LucideIcons.chevronLeftDir,
                  size: 18,
                  color: scheme.onSurfaceVariant,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Step 2 — slot pick
// ═══════════════════════════════════════════════════════════════════════════

class _SlotsPage extends ConsumerWidget {
  const _SlotsPage();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final BookingFlowState s = ref.watch(bookingFlowProvider);
    final BookingFlowController ctrl =
        ref.read(bookingFlowProvider.notifier);
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Column(
      children: <Widget>[
        if (s.selectedDoctor != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Row(
              children: <Widget>[
                const Icon(
                  LucideIcons.stethoscope,
                  size: 16,
                  color: AppColors.action,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    s.selectedDoctor!.displayName,
                    style:
                        Theme.of(context).textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                    textDirection: TextDirection.rtl,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        Expanded(
          child: s.slots.when(
            loading: () =>
                const LoadingSpinner(message: 'جاري تحميل المواعيد...'),
            error: (Object e, _) => Center(
              child: EmptyState(
                icon: LucideIcons.circleAlert,
                title: 'تعذر تحميل المواعيد',
                subtitle:
                    e is ApiException ? e.toDisplayMessage() : '$e',
              ),
            ),
            data: (List<AvailabilitySlot> list) {
              final List<AvailabilitySlot> open =
                  list.where((AvailabilitySlot x) => !x.isBooked).toList();
              if (open.isEmpty) {
                return const Center(
                  child: EmptyState(
                    icon: LucideIcons.clock,
                    title: 'لا توجد مواعيد متاحة',
                    subtitle: 'جرّب اختيار طبيب آخر.',
                  ),
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                itemCount: open.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (BuildContext c, int i) => _SlotTile(
                  slot: open[i],
                  onTap: () => ctrl.pickSlot(open[i]),
                ),
              );
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Row(
            children: <Widget>[
              Expanded(
                child: GhostButton(
                  label: 'رجوع',
                  icon: LucideIcons.chevronRightDir,
                  onPressed: ctrl.goToSearch,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: GhostButton(
                  label: 'إلغاء',
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ],
          ),
        ),
        Container(height: 0, color: scheme.outline),
      ],
    );
  }
}

class _SlotTile extends StatelessWidget {
  const _SlotTile({required this.slot, required this.onTap});

  final AvailabilitySlot slot;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final String dateStr = intl.DateFormat('yyyy-MM-dd', 'en').format(slot.date);

    return Material(
      color: scheme.surface,
      borderRadius: AppRadii.radiusMd,
      child: InkWell(
        borderRadius: AppRadii.radiusMd,
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 12,
          ),
          decoration: BoxDecoration(
            border: Border.all(color: scheme.outline),
            borderRadius: AppRadii.radiusMd,
          ),
          child: Row(
            children: <Widget>[
              const Icon(
                LucideIcons.calendar,
                size: 20,
                color: AppColors.action,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Row(
                  children: <Widget>[
                    Text(
                      dateStr,
                      textDirection: TextDirection.ltr,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(width: 12),
                    Text(
                      '${slot.startTime} — ${slot.endTime}',
                      textDirection: TextDirection.ltr,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
              Icon(
                LucideIcons.chevronLeftDir,
                size: 18,
                color: scheme.onSurfaceVariant,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Step 3 — confirm
// ═══════════════════════════════════════════════════════════════════════════

class _ConfirmPage extends ConsumerStatefulWidget {
  const _ConfirmPage();

  @override
  ConsumerState<_ConfirmPage> createState() => _ConfirmPageState();
}

class _ConfirmPageState extends ConsumerState<_ConfirmPage> {
  final TextEditingController _reasonController = TextEditingController();

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final BookingFlowController ctrl =
        ref.read(bookingFlowProvider.notifier);
    try {
      final Appointment booked = await ctrl.confirmBooking();
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'تم الحجز بنجاح (${booked.appointmentTime})',
          ),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ErrorSnackbar.show(
        context,
        'فشل الحجز',
        e.toDisplayMessage(),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final BookingFlowState s = ref.watch(bookingFlowProvider);
    final BookingFlowController ctrl =
        ref.read(bookingFlowProvider.notifier);
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;
    final DoctorSummary? doctor = s.selectedDoctor;
    final AvailabilitySlot? slot = s.selectedSlot;

    // Keep controller text in sync with state if user went back + forward.
    if (_reasonController.text != s.reasonForVisit) {
      _reasonController.value = TextEditingValue(
        text: s.reasonForVisit,
        selection: TextSelection.collapsed(offset: s.reasonForVisit.length),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      children: <Widget>[
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: scheme.surface,
            borderRadius: AppRadii.radiusMd,
            border: Border.all(color: scheme.outline),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              _SummaryRow(
                label: 'الطبيب',
                value: doctor?.displayName ?? '—',
                valueDir: TextDirection.rtl,
              ),
              const SizedBox(height: 6),
              _SummaryRow(
                label: 'التاريخ',
                value: slot == null
                    ? '—'
                    : intl.DateFormat('yyyy-MM-dd', 'en').format(slot.date),
                valueDir: TextDirection.ltr,
              ),
              const SizedBox(height: 6),
              _SummaryRow(
                label: 'الوقت',
                value: slot == null
                    ? '—'
                    : '${slot.startTime} — ${slot.endTime}',
                valueDir: TextDirection.ltr,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Text('سبب الزيارة *', style: text.titleSmall),
        const SizedBox(height: 6),
        TextField(
          controller: _reasonController,
          maxLines: 3,
          maxLength: 500,
          inputFormatters: <TextInputFormatter>[
            LengthLimitingTextInputFormatter(500),
          ],
          decoration: const InputDecoration(
            hintText: 'صف الأعراض أو سبب الزيارة باختصار',
          ),
          onChanged: ctrl.setReason,
        ),
        const SizedBox(height: 4),
        Text('الأولوية', style: text.titleSmall),
        const SizedBox(height: 6),
        RadioGroup<String>(
          groupValue: s.priority,
          onChanged: (String? v) {
            if (v != null) ctrl.setPriority(v);
          },
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              for (final _PriorityOption p in _priorityOptions)
                RadioListTile<String>(
                  value: p.value,
                  title: Row(
                    children: <Widget>[
                      Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: p.dot,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(p.label),
                    ],
                  ),
                  controlAffinity: ListTileControlAffinity.trailing,
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: <Widget>[
            Expanded(
              child: GhostButton(
                label: 'رجوع',
                icon: LucideIcons.chevronRightDir,
                onPressed: s.isSubmitting ? null : ctrl.goToSlots,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: PrimaryButton(
                label: 'تأكيد الحجز',
                loading: s.isSubmitting,
                onPressed: s.canConfirm ? _submit : null,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.label,
    required this.value,
    required this.valueDir,
  });

  final String label;
  final String value;
  final TextDirection valueDir;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;
    return Row(
      children: <Widget>[
        SizedBox(
          width: 64,
          child: Text(
            label,
            style: text.bodySmall?.copyWith(
              color: scheme.onSurfaceVariant,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            value,
            textDirection: valueDir,
            style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}

class _PriorityOption {
  const _PriorityOption(this.value, this.label, this.dot);
  final String value;
  final String label;
  final Color dot;
}

const List<_PriorityOption> _priorityOptions = <_PriorityOption>[
  _PriorityOption('routine', 'روتيني', AppColors.success),
  _PriorityOption('urgent', 'عاجل', AppColors.warning),
  _PriorityOption('emergency', 'طارئ', AppColors.error),
];
