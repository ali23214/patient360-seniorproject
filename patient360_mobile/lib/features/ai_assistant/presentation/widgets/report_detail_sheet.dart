import 'package:flutter/material.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/utils/logger.dart';
import '../../domain/emergency_location.dart';
import '../../domain/emergency_report.dart';
import 'first_aid_steps.dart';
import 'severity_badge.dart';

/// Modal bottom sheet showing the full text + first-aid steps + recorded
/// location for a single past emergency report.
///
/// We don't embed a real map widget in v1 — that would pull in Google Maps
/// SDK and an API key. Instead we render the coordinates LTR and a button
/// that hands off to the OS map app via `geo:` URL.
class ReportDetailSheet extends StatelessWidget {
  const ReportDetailSheet({required this.report, super.key});
  final EmergencyReport report;

  static Future<void> show(BuildContext context, EmergencyReport report) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext _) => ReportDetailSheet(report: report),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (BuildContext _, ScrollController controller) {
        return SingleChildScrollView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: Text(
                      'بلاغ طوارئ',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                  ),
                  SeverityBadge(level: report.aiRiskLevel),
                ],
              ),
              const SizedBox(height: 6),
              Row(
                children: <Widget>[
                  Icon(LucideIcons.clock,
                      size: 14, color: scheme.onSurfaceVariant),
                  const SizedBox(width: 6),
                  Text(
                    intl.DateFormat('yyyy-MM-dd HH:mm')
                        .format(report.reportedAt),
                    textDirection: TextDirection.ltr,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                  ),
                ],
              ),
              if (report.textDescription != null &&
                  report.textDescription!.isNotEmpty) ...<Widget>[
                const SizedBox(height: 16),
                const _SectionTitle('وصف الأعراض'),
                const SizedBox(height: 4),
                Text(report.textDescription!,
                    style: Theme.of(context).textTheme.bodyMedium),
              ],
              const SizedBox(height: 16),
              const _SectionTitle('خطوات الإسعاف الأولي'),
              const SizedBox(height: 6),
              FirstAidSteps(steps: report.aiFirstAid),
              if (report.location != null) ...<Widget>[
                const SizedBox(height: 16),
                const _SectionTitle('الموقع المسجل'),
                const SizedBox(height: 6),
                _LocationChip(location: report.location!),
              ],
              const SizedBox(height: 24),
            ],
          ),
        );
      },
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.label);
  final String label;
  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: Theme.of(context)
          .textTheme
          .labelLarge
          ?.copyWith(fontWeight: FontWeight.w800),
    );
  }
}

class _LocationChip extends StatelessWidget {
  const _LocationChip({required this.location});
  final EmergencyLocation location;

  Future<void> _openInMaps(BuildContext context) async {
    final ScaffoldMessengerState? messenger =
        ScaffoldMessenger.maybeOf(context);
    final String coords = '${location.lat},${location.lng}';
    // Android takes geo: URLs; iOS prefers Apple/Google maps web URLs.
    // Falling back to maps.google.com works on every platform.
    final Uri uri = Uri.parse(
      'https://maps.google.com/?q=$coords',
    );
    try {
      final bool launched =
          await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!launched) {
        messenger?.showSnackBar(
          const SnackBar(content: Text('تعذر فتح الخرائط.')),
        );
      }
    } catch (e, st) {
      appLogger.w('open in maps failed', error: e, stackTrace: st);
      messenger?.showSnackBar(
        const SnackBar(content: Text('تعذر فتح الخرائط.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: AppRadii.radiusMd,
        border: Border.all(color: scheme.outline),
      ),
      child: Row(
        children: <Widget>[
          const Icon(LucideIcons.mapPin, size: 18, color: AppColors.action),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  '${location.lat.toStringAsFixed(6)}, '
                  '${location.lng.toStringAsFixed(6)}',
                  textDirection: TextDirection.ltr,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontFamily: 'Inter',
                        fontWeight: FontWeight.w700,
                      ),
                ),
                if (location.accuracy != null)
                  Text(
                    'دقة: ±${location.accuracy!.toStringAsFixed(0)} م',
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                  ),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: () => _openInMaps(context),
            icon: const Icon(LucideIcons.externalLink, size: 16),
            label: const Text('فتح في الخرائط'),
            style: TextButton.styleFrom(foregroundColor: AppColors.action),
          ),
        ],
      ),
    );
  }
}
