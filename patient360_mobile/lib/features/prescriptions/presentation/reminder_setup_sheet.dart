import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:uuid/uuid.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../shared/widgets/error_snackbar.dart';
import '../../../shared/widgets/ghost_button.dart';
import '../../../shared/widgets/primary_button.dart';
import '../data/notification_scheduler.dart';
import '../domain/frequency_parser.dart';
import '../domain/medication_item.dart';
import '../domain/prescription.dart';
import '../domain/reminders/reminder_schedule.dart';
import '../domain/reminders/time_of_day_dto.dart';
import 'providers/reminders_provider.dart';

const Uuid _uuid = Uuid();

/// Bottom sheet for creating or editing a [ReminderSchedule] tied to a
/// (prescription, medicationIndex) pair.
class ReminderSetupSheet extends ConsumerStatefulWidget {
  const ReminderSetupSheet({
    required this.prescription,
    required this.medicationIndex,
    this.existing,
    super.key,
  });

  final Prescription prescription;
  final int medicationIndex;
  final ReminderSchedule? existing;

  static Future<void> show(
    BuildContext context, {
    required Prescription prescription,
    required int medicationIndex,
    ReminderSchedule? existing,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ReminderSetupSheet(
        prescription: prescription,
        medicationIndex: medicationIndex,
        existing: existing,
      ),
    );
  }

  @override
  ConsumerState<ReminderSetupSheet> createState() =>
      _ReminderSetupSheetState();
}

class _ReminderSetupSheetState
    extends ConsumerState<ReminderSetupSheet> {
  late List<TimeOfDayDto> _times;
  late DateTime _startDate;
  late DateTime _endDate;
  late bool _isEnabled;
  bool _saving = false;
  bool _permissionDenied = false;

  MedicationItem get _med =>
      widget.prescription.medications[widget.medicationIndex];

  @override
  void initState() {
    super.initState();
    if (widget.existing != null) {
      _times = List<TimeOfDayDto>.from(widget.existing!.times);
      _startDate = widget.existing!.startDate;
      _endDate = widget.existing!.endDate;
      _isEnabled = widget.existing!.isEnabled;
    } else {
      _times = parseFrequencyToDefaults(_med.frequency);
      _startDate = _today();
      _endDate = _today().add(parseDurationToDays(_med.duration));
      _isEnabled = true;
    }
  }

  static DateTime _today() {
    final DateTime now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }

  Duration get _durationCovered =>
      _endDate.difference(_startDate);

  bool get _isValid =>
      _times.isNotEmpty && !_endDate.isBefore(_startDate);

  Future<void> _editTime(int index) async {
    final TimeOfDayDto current = _times[index];
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: current.hour, minute: current.minute),
    );
    if (picked == null) return;
    setState(() {
      _times[index] = TimeOfDayDto(
        hour: picked.hour,
        minute: picked.minute,
      );
      _times.sort();
    });
  }

  Future<void> _addTime() async {
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 12, minute: 0),
    );
    if (picked == null) return;
    setState(() {
      _times.add(TimeOfDayDto(
        hour: picked.hour,
        minute: picked.minute,
      ));
      _times.sort();
    });
  }

  Future<void> _maybeRemoveTime(int index) async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext c) => AlertDialog(
        title: const Text('حذف الوقت'),
        content: Text(
          'هل تريد حذف ${_times[index].label} من قائمة التذكيرات؟',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(c).pop(false),
            child: const Text('تراجع'),
          ),
          TextButton(
            onPressed: () => Navigator.of(c).pop(true),
            child: const Text('حذف'),
          ),
        ],
      ),
    );
    if (ok == true) {
      setState(() => _times.removeAt(index));
    }
  }

  Future<void> _pickDate({required bool start}) async {
    final DateTime initial = start ? _startDate : _endDate;
    final DateTime first = start
        ? DateTime.now().subtract(const Duration(days: 1))
        : _startDate;
    final DateTime last = (start ? _today() : _startDate).add(
      const Duration(days: 365),
    );
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: first,
      lastDate: last,
    );
    if (picked == null) return;
    setState(() {
      if (start) {
        _startDate = picked;
        if (_endDate.isBefore(_startDate)) _endDate = _startDate;
      } else {
        _endDate = picked;
      }
    });
  }

  Future<void> _requestPermission() async {
    final NotificationScheduler scheduler =
        ref.read(notificationSchedulerProvider);
    final bool granted = await scheduler.requestPermission(context);
    if (!mounted) return;
    setState(() => _permissionDenied = !granted);
  }

  Future<void> _save() async {
    if (!_isValid) return;
    setState(() => _saving = true);
    try {
      final ReminderSchedule schedule = (widget.existing ??
              ReminderSchedule(
                id: _uuid.v4(),
                prescriptionId: widget.prescription.id,
                medicationIndex: widget.medicationIndex,
                medicationName: _med.displayName,
                dosage: _med.dosage,
                times: _times,
                startDate: _startDate,
                endDate: _endDate,
                isEnabled: _isEnabled,
                createdAt: DateTime.now(),
                updatedAt: DateTime.now(),
              ))
          .copyWith(
        times: _times,
        startDate: _startDate,
        endDate: _endDate,
        isEnabled: _isEnabled,
        updatedAt: DateTime.now(),
      );

      await ref.read(remindersProvider.notifier).createOrUpdate(schedule);
      if (!mounted) return;

      // Best-effort permission prompt — never blocks the save.
      final NotificationScheduler scheduler =
          ref.read(notificationSchedulerProvider);
      final bool granted = await scheduler.requestPermission(context);
      if (!mounted) return;

      Navigator.of(context).pop();
      final TimeOfDayDto next = _times.first;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            granted
                ? 'تم حفظ التذكير — سيتم تذكيرك في ${next.label}'
                : 'تم حفظ التذكير. (الإشعارات معطّلة في النظام)',
          ),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ErrorSnackbar.show(
        context,
        'تعذر الحفظ',
        e.toDisplayMessage(),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ErrorSnackbar.show(context, 'تعذر الحفظ', e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;

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
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 8, 8),
                child: Row(
                  children: <Widget>[
                    const Icon(
                      LucideIcons.bell,
                      color: AppColors.action,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        widget.existing == null
                            ? 'إعداد تذكير الدواء'
                            : 'تعديل التذكير',
                        style: text.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(LucideIcons.x),
                      onPressed: _saving
                          ? null
                          : () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  children: <Widget>[
                    _SummaryCard(med: _med),
                    const SizedBox(height: 16),
                    Text(
                      'سنذكرك في الأوقات التالية:',
                      style: text.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: <Widget>[
                        for (int i = 0; i < _times.length; i++)
                          _TimeChip(
                            label: _times[i].label,
                            onTap: () => _editTime(i),
                            onLongPress: () => _maybeRemoveTime(i),
                          ),
                        _AddTimeChip(onTap: _addTime),
                      ],
                    ),
                    if (_times.isEmpty) ...<Widget>[
                      const SizedBox(height: 8),
                      Text(
                        'يجب إضافة وقت واحد على الأقل.',
                        style: text.bodySmall?.copyWith(
                          color: AppColors.error,
                        ),
                      ),
                    ],
                    const SizedBox(height: 18),
                    Text('فترة العلاج', style: text.titleSmall),
                    const SizedBox(height: 8),
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: _DatePickerField(
                            label: 'من',
                            date: _startDate,
                            onTap: () => _pickDate(start: true),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _DatePickerField(
                            label: 'إلى',
                            date: _endDate,
                            onTap: () => _pickDate(start: false),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'مدة العلاج: ${_durationCovered.inDays} يوم',
                      style: text.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 18),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text(
                        'تفعيل التذكيرات لهذا الدواء',
                      ),
                      value: _isEnabled,
                      activeThumbColor: AppColors.action,
                      onChanged: _saving
                          ? null
                          : (bool v) =>
                              setState(() => _isEnabled = v),
                    ),
                    if (_permissionDenied) ...<Widget>[
                      const SizedBox(height: 8),
                      _PermissionRationale(
                        onGrant: _requestPermission,
                      ),
                    ],
                  ],
                ),
              ),
              Padding(
                padding:
                    const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Row(
                  children: <Widget>[
                    Expanded(
                      child: GhostButton(
                        label: 'إلغاء',
                        onPressed: _saving
                            ? null
                            : () => Navigator.of(context).pop(),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: PrimaryButton(
                        label: 'حفظ',
                        loading: _saving,
                        onPressed:
                            _isValid && !_saving ? _save : null,
                      ),
                    ),
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

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.med});
  final MedicationItem med;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: AppRadii.radiusMd,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            med.displayName,
            style: text.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
            textDirection: TextDirection.rtl,
          ),
          const SizedBox(height: 4),
          Text(
            'الموصوف من الطبيب: ${med.dosage} • ${med.frequency} • ${med.duration}',
            style: text.bodySmall?.copyWith(
              color: scheme.onSurfaceVariant,
            ),
            textDirection: TextDirection.rtl,
          ),
        ],
      ),
    );
  }
}

class _TimeChip extends StatelessWidget {
  const _TimeChip({
    required this.label,
    required this.onTap,
    required this.onLongPress,
  });
  final String label;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: AppRadii.radiusMd,
      onTap: onTap,
      onLongPress: onLongPress,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 8,
        ),
        decoration: BoxDecoration(
          color: AppColors.action.withValues(alpha: 0.12),
          borderRadius: AppRadii.radiusMd,
          border: Border.all(
            color: AppColors.action.withValues(alpha: 0.30),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(
              LucideIcons.clock,
              size: 14,
              color: AppColors.action,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              textDirection: TextDirection.ltr,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                color: AppColors.action,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AddTimeChip extends StatelessWidget {
  const _AddTimeChip({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: AppRadii.radiusMd,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 8,
        ),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: AppRadii.radiusMd,
          border: Border.all(
            color: scheme.outline,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              LucideIcons.plus,
              size: 14,
              color: scheme.onSurfaceVariant,
            ),
            const SizedBox(width: 6),
            Text(
              'إضافة وقت',
              style: TextStyle(
                color: scheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DatePickerField extends StatelessWidget {
  const _DatePickerField({
    required this.label,
    required this.date,
    required this.onTap,
  });
  final String label;
  final DateTime date;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;
    return InkWell(
      borderRadius: AppRadii.radiusMd,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 10,
        ),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: AppRadii.radiusMd,
          border: Border.all(color: scheme.outline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              label,
              style: text.bodySmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 2),
            Row(
              children: <Widget>[
                Icon(
                  LucideIcons.calendar,
                  size: 14,
                  color: scheme.primary,
                ),
                const SizedBox(width: 6),
                Text(
                  intl.DateFormat('yyyy-MM-dd', 'en').format(date),
                  textDirection: TextDirection.ltr,
                  style: text.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PermissionRationale extends StatelessWidget {
  const _PermissionRationale({required this.onGrant});
  final VoidCallback onGrant;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.10),
        borderRadius: AppRadii.radiusMd,
        border: Border.all(
          color: AppColors.warning.withValues(alpha: 0.40),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Icon(
            LucideIcons.circleAlert,
            color: AppColors.warning,
            size: 18,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text(
                  'التذكيرات تتطلب إذن الإشعارات من نظام التشغيل. سنطلب منك الإذن الآن.',
                  style: TextStyle(height: 1.4),
                ),
                const SizedBox(height: 6),
                TextButton(
                  onPressed: onGrant,
                  child: const Text('منح الإذن'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
