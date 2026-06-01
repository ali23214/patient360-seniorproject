import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/localization/arabic_labels.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/medication_item.dart';
import '../../domain/prescription.dart';
import '../../domain/reminders/reminder_schedule.dart';
import '../providers/reminders_provider.dart';
import '../reminder_setup_sheet.dart';
import 'medication_row.dart';
import 'qr_code_card.dart';

/// Default-collapsed card for one prescription. Tap to expand.
class PrescriptionCard extends ConsumerStatefulWidget {
  const PrescriptionCard({required this.prescription, super.key});

  final Prescription prescription;

  @override
  ConsumerState<PrescriptionCard> createState() =>
      _PrescriptionCardState();
}

class _PrescriptionCardState extends ConsumerState<PrescriptionCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;
    final Prescription rx = widget.prescription;

    final bool fullyDispensed = rx.isFullyDispensed;
    final Color cardBg = fullyDispensed
        ? AppColors.success.withValues(alpha: 0.06)
        : scheme.surfaceContainer;
    final Color border = fullyDispensed
        ? AppColors.success.withValues(alpha: 0.35)
        : scheme.outline;
    final String medSummary = rx.medications
        .map((MedicationItem m) => m.displayName)
        .where((String s) => s.isNotEmpty)
        .join('، ');
    final String statusLabel = ArabicLabels.lookup(
      _prescriptionStatusLabels,
      rx.status,
    );

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
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
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
                      LucideIcons.pill,
                      color: AppColors.action,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          rx.prescriptionNumber,
                          textDirection: TextDirection.ltr,
                          style: text.titleMedium?.copyWith(
                            fontFamily: 'Inter',
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (medSummary.isNotEmpty) ...<Widget>[
                          const SizedBox(height: 2),
                          Text(
                            medSummary,
                            style: text.bodySmall?.copyWith(
                              color: scheme.onSurfaceVariant,
                            ),
                            textDirection: TextDirection.rtl,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: <Widget>[
                      _Chip(
                        label: statusLabel,
                        fg: _statusFg(rx.status),
                        bg: _statusFg(rx.status).withValues(alpha: 0.15),
                      ),
                      const SizedBox(height: 6),
                      AnimatedRotation(
                        duration: const Duration(milliseconds: 180),
                        turns: _expanded ? 0.5 : 0,
                        child: Icon(
                          LucideIcons.chevronDownDir,
                          size: 18,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (fullyDispensed)
            _DispensedBanner(when: rx.firstDispensedAt),
          if (_expanded) ...<Widget>[
            Divider(height: 1, color: border),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  if (!fullyDispensed && rx.qrCode != null)
                    QrCodeCard(
                      qrCode: rx.qrCode!,
                      verificationCode: rx.verificationCode,
                    ),
                  if (rx.isActive) ...<Widget>[
                    const SizedBox(height: 14),
                    _RemindersSection(prescription: rx),
                  ],
                  const SizedBox(height: 14),
                  Row(
                    children: <Widget>[
                      Icon(
                        LucideIcons.pill,
                        size: 16,
                        color: scheme.primary,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'الأدوية',
                        style: text.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  for (final MedicationItem m in rx.medications)
                    MedicationRow(med: m),
                  if (rx.prescriptionNotes != null &&
                      rx.prescriptionNotes!.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 6),
                    Row(
                      children: <Widget>[
                        Icon(
                          LucideIcons.fileText,
                          size: 16,
                          color: scheme.primary,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'ملاحظات',
                          style: text.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      rx.prescriptionNotes!,
                      style: text.bodyMedium,
                      textDirection: TextDirection.rtl,
                    ),
                  ],
                  if (rx.expiryDate != null) ...<Widget>[
                    const SizedBox(height: 12),
                    _ExpiryFooter(expiryDate: rx.expiryDate!),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  static const Map<String, String> _prescriptionStatusLabels =
      <String, String>{
    'active': 'نشطة',
    'partially_dispensed': 'صرف جزئي',
    'dispensed': 'تم الصرف',
    'expired': 'منتهية',
    'cancelled': 'ملغاة',
  };

  static Color _statusFg(String status) {
    return switch (status) {
      'active' => AppColors.action,
      'partially_dispensed' => AppColors.warning,
      'dispensed' => AppColors.success,
      'expired' || 'cancelled' => AppColors.error,
      _ => AppColors.action,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Subsections
// ═══════════════════════════════════════════════════════════════════════════

class _DispensedBanner extends StatelessWidget {
  const _DispensedBanner({required this.when});
  final DateTime? when;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.success.withValues(alpha: 0.12),
        border: Border(
          top: BorderSide(
            color: AppColors.success.withValues(alpha: 0.25),
          ),
        ),
      ),
      child: Row(
        children: <Widget>[
          const Icon(
            LucideIcons.circleCheck,
            color: AppColors.success,
            size: 16,
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: <InlineSpan>[
                  const TextSpan(text: 'تم الصرف'),
                  if (when != null)
                    TextSpan(
                      text:
                          ' في ${intl.DateFormat('yyyy-MM-dd', 'en').format(when!.toLocal())}',
                    ),
                ],
              ),
              style: const TextStyle(
                color: AppColors.success,
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RemindersSection extends ConsumerWidget {
  const _RemindersSection({required this.prescription});
  final Prescription prescription;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final TextTheme text = Theme.of(context).textTheme;
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Row(
          children: <Widget>[
            Icon(
              LucideIcons.bell,
              size: 16,
              color: scheme.primary,
            ),
            const SizedBox(width: 6),
            Text(
              'تذكيرات الأدوية',
              style: text.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        for (int i = 0; i < prescription.medications.length; i++)
          _ReminderMedRow(
            prescription: prescription,
            medicationIndex: i,
          ),
      ],
    );
  }
}

class _ReminderMedRow extends ConsumerWidget {
  const _ReminderMedRow({
    required this.prescription,
    required this.medicationIndex,
  });

  final Prescription prescription;
  final int medicationIndex;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ReminderSchedule? existing = ref.watch(
      reminderByMedProvider((
        prescriptionId: prescription.id,
        medicationIndex: medicationIndex,
      )),
    );
    final MedicationItem med = prescription.medications[medicationIndex];
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GestureDetector(
        onLongPress: existing == null
            ? null
            : () => ReminderSetupSheet.show(
                  context,
                  prescription: prescription,
                  medicationIndex: medicationIndex,
                  existing: existing,
                ),
        child: Container(
          padding:
              const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: scheme.surface,
            borderRadius: AppRadii.radiusMd,
            border: Border.all(color: scheme.outline),
          ),
          child: Row(
            children: <Widget>[
              Icon(
                existing == null
                    ? LucideIcons.bellOff
                    : LucideIcons.bell,
                size: 16,
                color: existing == null
                    ? scheme.onSurfaceVariant
                    : AppColors.action,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Text(
                      med.displayName,
                      style: text.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                      textDirection: TextDirection.rtl,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (existing != null) ...<Widget>[
                      const SizedBox(height: 2),
                      Text(
                        existing.times
                            .map((dynamic t) => t.label)
                            .join(' · '),
                        textDirection: TextDirection.ltr,
                        style: text.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (existing == null)
                OutlinedButton(
                  onPressed: () => ReminderSetupSheet.show(
                    context,
                    prescription: prescription,
                    medicationIndex: medicationIndex,
                  ),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 36),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                  ),
                  child: const Text(
                    'إعداد التذكير',
                    style: TextStyle(fontSize: 12),
                  ),
                )
              else
                Switch.adaptive(
                  value: existing.isEnabled,
                  activeThumbColor: AppColors.action,
                  onChanged: (bool v) async {
                    await ref
                        .read(remindersProvider.notifier)
                        .toggleEnabled(existing.id, v);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ExpiryFooter extends StatelessWidget {
  const _ExpiryFooter({required this.expiryDate});
  final DateTime expiryDate;

  @override
  Widget build(BuildContext context) {
    final int daysLeft =
        expiryDate.difference(DateTime.now()).inDays;
    final bool warn = daysLeft >= 0 && daysLeft < 7;
    final Color color = warn ? AppColors.warning : Theme.of(context).colorScheme.onSurfaceVariant;
    return Row(
      children: <Widget>[
        Icon(LucideIcons.calendar, size: 14, color: color),
        const SizedBox(width: 6),
        Text(
          'ينتهي في ${intl.DateFormat('yyyy-MM-dd', 'en').format(expiryDate.toLocal())}',
          textDirection: TextDirection.ltr,
          style: TextStyle(
            color: color,
            fontSize: 12,
            fontWeight: warn ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.fg, required this.bg});
  final String label;
  final Color fg;
  final Color bg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: AppRadii.radiusSm,
      ),
      child: Text(
        label,
        style: TextStyle(
          color: fg,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
