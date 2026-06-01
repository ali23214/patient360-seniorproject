import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/localization/arabic_labels.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../shared/widgets/error_snackbar.dart';
import '../../../shared/widgets/ghost_button.dart';
import '../data/appointments_repository.dart';
import '../domain/appointment.dart';
import 'providers/appointments_provider.dart';

/// Confirmation sheet for cancelling an upcoming appointment.
///
/// Mirrors the web `AppointmentCancelForm` component: warning strip header,
/// a 5-option radio group (matches the `cancellationReason` enum exactly),
/// and a danger-styled confirm button.
class CancelSheet extends ConsumerStatefulWidget {
  const CancelSheet({required this.appointment, super.key});

  final Appointment appointment;

  static Future<bool?> show(
    BuildContext context, {
    required Appointment appointment,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => CancelSheet(appointment: appointment),
    );
  }

  @override
  ConsumerState<CancelSheet> createState() => _CancelSheetState();
}

class _CancelSheetState extends ConsumerState<CancelSheet> {
  String _reason = 'patient_request';
  bool _submitting = false;

  Future<void> _submit() async {
    setState(() => _submitting = true);
    try {
      await ref
          .read(appointmentsRepositoryProvider)
          .cancelAppointment(
            widget.appointment.id,
            cancellationReason: _reason,
          );
      if (!mounted) return;
      ref.invalidate(appointmentsProvider);
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم إلغاء الموعد'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      ErrorSnackbar.show(
        context,
        'تعذر الإلغاء',
        e.toDisplayMessage(),
      );
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
      child: Container(
        decoration: BoxDecoration(
          color: scheme.surfaceContainer,
          borderRadius: const BorderRadius.vertical(
            top: Radius.circular(20),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            // Warning strip header.
            Container(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
              decoration: BoxDecoration(
                color: AppColors.warning.withValues(alpha: 0.15),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(20),
                ),
              ),
              child: Row(
                children: <Widget>[
                  const Icon(
                    LucideIcons.triangleAlert,
                    color: AppColors.warning,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'إلغاء الموعد',
                      style: text.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(LucideIcons.x),
                    tooltip: 'إغلاق',
                    onPressed: _submitting
                        ? null
                        : () => Navigator.of(context).pop(false),
                  ),
                ],
              ),
            ),
            // Body.
            Flexible(
              child: SingleChildScrollView(
                padding:
                    const EdgeInsets.fromLTRB(20, 16, 20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Text.rich(
                      TextSpan(
                        children: <InlineSpan>[
                          const TextSpan(text: 'هل أنت متأكد من إلغاء موعد '),
                          TextSpan(
                            text: '«${widget.appointment.reasonForVisit}»',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const TextSpan(text: '؟'),
                        ],
                      ),
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'سبب الإلغاء',
                      style: text.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    RadioGroup<String>(
                      groupValue: _reason,
                      onChanged: _submitting
                          ? (_) {}
                          : (String? v) {
                              if (v != null) {
                                setState(() => _reason = v);
                              }
                            },
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: <Widget>[
                          for (final MapEntry<String, String> entry
                              in ArabicLabels.cancellationReason.entries)
                            RadioListTile<String>(
                              value: entry.key,
                              title: Text(entry.value),
                              controlAffinity:
                                  ListTileControlAffinity.trailing,
                              contentPadding: EdgeInsets.zero,
                              shape: const RoundedRectangleBorder(
                                borderRadius: AppRadii.radiusSm,
                              ),
                              dense: true,
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Footer.
            Padding(
              padding:
                  const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: GhostButton(
                      label: 'تراجع',
                      onPressed: _submitting
                          ? null
                          : () => Navigator.of(context).pop(false),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _submitting ? null : _submit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.error,
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(48),
                        shape: const RoundedRectangleBorder(
                          borderRadius: AppRadii.radiusMd,
                        ),
                      ),
                      child: _submitting
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor:
                                    AlwaysStoppedAnimation<Color>(
                                  Colors.white,
                                ),
                              ),
                            )
                          : const Text('تأكيد الإلغاء'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
