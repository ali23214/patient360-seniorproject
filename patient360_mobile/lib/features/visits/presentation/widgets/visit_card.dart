import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/localization/arabic_labels.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/prescribed_medication.dart';
import '../../domain/visit.dart';
import '../photo_viewer_screen.dart';
import '../providers/visits_provider.dart';
import 'ecg_block.dart';
import 'vital_signs_grid.dart';

class VisitCard extends ConsumerWidget {
  const VisitCard({required this.visit, super.key});

  final Visit visit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final Set<String> expanded = ref.watch(expandedVisitsProvider);
    final bool isExpanded = expanded.contains(visit.id);
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;

    final String typeLabel = ArabicLabels.lookup(
      ArabicLabels.visitType,
      visit.visitType,
    );
    final String statusLabel = ArabicLabels.lookup(
      ArabicLabels.visitStatus,
      visit.status,
    );
    final String dateStr =
        intl.DateFormat('yyyy-MM-dd', 'en').format(visit.visitDate);

    return Container(
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          InkWell(
            borderRadius: AppRadii.radiusLg,
            onTap: () => _toggle(ref),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          visit.chiefComplaint.isEmpty
                              ? typeLabel
                              : visit.chiefComplaint,
                          style: text.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                          textDirection: TextDirection.rtl,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 6),
                        Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          children: <Widget>[
                            _Chip(
                              label: typeLabel,
                              foreground: AppColors.action,
                              background: AppColors.action
                                  .withValues(alpha: 0.15),
                            ),
                            _Chip(
                              label: statusLabel,
                              foreground: _statusColor(visit.status),
                              background: _statusColor(visit.status)
                                  .withValues(alpha: 0.15),
                            ),
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: <Widget>[
                                Icon(
                                  LucideIcons.calendar,
                                  size: 12,
                                  color: scheme.onSurfaceVariant,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  dateStr,
                                  textDirection: TextDirection.ltr,
                                  style: text.bodySmall?.copyWith(
                                    color: scheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  AnimatedRotation(
                    duration: const Duration(milliseconds: 180),
                    turns: isExpanded ? 0.5 : 0,
                    child: Icon(
                      LucideIcons.chevronDown,
                      size: 20,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (isExpanded) ...<Widget>[
            Divider(height: 1, color: scheme.outline),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  if (visit.diagnosis != null && visit.diagnosis!.isNotEmpty)
                    _Subsection(
                      icon: LucideIcons.activity,
                      title: 'التشخيص',
                      child: Text(
                        visit.diagnosis!,
                        style: text.bodyMedium,
                        textDirection: TextDirection.rtl,
                      ),
                    ),
                  if (visit.vitalSigns != null && visit.vitalSigns!.hasAny)
                    _Subsection(
                      icon: LucideIcons.heartPulse,
                      title: 'العلامات الحيوية',
                      child: VitalSignsGrid(vitals: visit.vitalSigns!),
                    ),
                  if (visit.prescribedMedications.isNotEmpty)
                    _Subsection(
                      icon: LucideIcons.pill,
                      title: 'الأدوية الموصوفة',
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: <Widget>[
                          for (final PrescribedMedication m
                              in visit.prescribedMedications)
                            _MedRow(med: m),
                        ],
                      ),
                    ),
                  if (visit.doctorNotes != null &&
                      visit.doctorNotes!.isNotEmpty)
                    _Subsection(
                      icon: LucideIcons.fileText,
                      title: 'ملاحظات الطبيب',
                      child: Text(
                        visit.doctorNotes!,
                        style: text.bodyMedium,
                        textDirection: TextDirection.rtl,
                      ),
                    ),
                  if (visit.followUpDate != null)
                    _Subsection(
                      icon: LucideIcons.calendar,
                      title: 'موعد المتابعة',
                      child: Text.rich(
                        TextSpan(
                          children: <InlineSpan>[
                            TextSpan(
                              text: intl.DateFormat('yyyy-MM-dd', 'en')
                                  .format(visit.followUpDate!),
                              style: const TextStyle(
                                fontFeatures: <FontFeature>[
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                            ),
                            if (visit.followUpNotes != null &&
                                visit.followUpNotes!.isNotEmpty)
                              TextSpan(text: ' — ${visit.followUpNotes}'),
                          ],
                        ),
                        style: text.bodyMedium,
                      ),
                    ),
                  if (visit.visitPhotoUrl != null)
                    _Subsection(
                      icon: LucideIcons.image,
                      title: 'صورة مرفقة',
                      child: _VisitPhoto(url: visit.visitPhotoUrl!),
                    ),
                  if (visit.ecgAnalysis != null)
                    _Subsection(
                      icon: LucideIcons.heart,
                      title: 'تخطيط القلب',
                      child: EcgBlock(analysis: visit.ecgAnalysis!),
                    ),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Row(
                      children: <Widget>[
                        Text(
                          'حالة الدفع: ',
                          style: text.bodySmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                        _Chip(
                          label: ArabicLabels.lookup(
                            ArabicLabels.paymentStatus,
                            visit.paymentStatus,
                          ),
                          foreground:
                              _paymentColor(visit.paymentStatus),
                          background: _paymentColor(visit.paymentStatus)
                              .withValues(alpha: 0.15),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _toggle(WidgetRef ref) {
    ref.read(expandedVisitsProvider.notifier).toggle(visit.id);
  }

  static Color _statusColor(String status) {
    return switch (status) {
      'completed' => AppColors.success,
      'in_progress' => AppColors.action,
      'cancelled' => AppColors.error,
      _ => AppColors.action,
    };
  }

  static Color _paymentColor(String status) {
    return switch (status) {
      'paid' || 'free' => AppColors.success,
      'partially_paid' => AppColors.warning,
      'cancelled' => AppColors.error,
      _ => AppColors.action,
    };
  }
}

class _Subsection extends StatelessWidget {
  const _Subsection({
    required this.icon,
    required this.title,
    required this.child,
  });
  final IconData icon;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(icon, size: 16, color: scheme.primary),
              const SizedBox(width: 6),
              Text(
                title,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          child,
        ],
      ),
    );
  }
}

class _MedRow extends StatelessWidget {
  const _MedRow({required this.med});
  final PrescribedMedication med;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;
    final String routeLabel = ArabicLabels.lookup(
      ArabicLabels.medicationRoute,
      med.route,
    );
    final List<String> meta = <String>[
      med.dosage,
      med.frequency,
      med.duration,
    ].where((String s) => s.isNotEmpty).toList();

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: AppRadii.radiusMd,
          border: Border.all(color: scheme.outline),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Icon(
              LucideIcons.pill,
              size: 18,
              color: AppColors.success,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    med.medicationName,
                    style: text.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                    textDirection: TextDirection.rtl,
                  ),
                  if (meta.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 2),
                    Text(
                      meta.join(' • '),
                      style: text.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                      textDirection: TextDirection.rtl,
                    ),
                  ],
                  if (med.instructions != null &&
                      med.instructions!.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 2),
                    Text(
                      med.instructions!,
                      style: text.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                        fontStyle: FontStyle.italic,
                      ),
                      textDirection: TextDirection.rtl,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 6),
            _Chip(
              label: routeLabel,
              foreground: AppColors.action,
              background: AppColors.action.withValues(alpha: 0.12),
            ),
          ],
        ),
      ),
    );
  }
}

class _VisitPhoto extends StatelessWidget {
  const _VisitPhoto({required this.url});
  final String url;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: AppRadii.radiusMd,
      child: GestureDetector(
        onTap: () => PhotoViewerScreen.open(context, url),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 240),
          child: CachedNetworkImage(
            imageUrl: url,
            fit: BoxFit.cover,
            width: double.infinity,
            placeholder: (BuildContext _, String __) => Container(
              height: 200,
              color: Colors.black12,
              alignment: Alignment.center,
              child: const CircularProgressIndicator(strokeWidth: 2),
            ),
            errorWidget: (BuildContext _, String __, Object ___) =>
                Container(
              height: 120,
              color: Colors.black12,
              alignment: Alignment.center,
              child: const Icon(LucideIcons.imageOff),
            ),
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.foreground,
    required this.background,
  });
  final String label;
  final Color foreground;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: background,
        borderRadius: AppRadii.radiusSm,
      ),
      child: Text(
        label,
        style: TextStyle(
          color: foreground,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
