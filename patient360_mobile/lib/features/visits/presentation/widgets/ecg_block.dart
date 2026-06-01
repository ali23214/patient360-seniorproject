import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/utils/logger.dart';
import '../../domain/ecg_analysis.dart';

/// Displays the AI ECG result attached to a visit. The mobile app does NOT
/// run the model — it only renders the predictions saved by the doctor's
/// web dashboard.
class EcgBlock extends StatelessWidget {
  const EcgBlock({required this.analysis, super.key});

  final EcgAnalysis analysis;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme text = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.06),
        borderRadius: AppRadii.radiusMd,
        border: Border.all(
          color: AppColors.error.withValues(alpha: 0.30),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Row(
            children: <Widget>[
              const Icon(LucideIcons.heart, size: 16, color: AppColors.error),
              const SizedBox(width: 6),
              Text(
                'تحليل تخطيط القلب',
                style: text.titleSmall?.copyWith(
                  color: AppColors.error,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          if (analysis.topPrediction != null) ...<Widget>[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.12),
                borderRadius: AppRadii.radiusSm,
              ),
              child: Row(
                children: <Widget>[
                  Text(
                    'النتيجة: ',
                    style: text.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      analysis.topPrediction!,
                      style: text.bodyMedium,
                      textDirection: TextDirection.rtl,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (analysis.recommendation != null) ...<Widget>[
            const SizedBox(height: 8),
            Text(
              analysis.recommendation!,
              style: text.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
              textDirection: TextDirection.rtl,
            ),
          ],
          if (analysis.predictions.isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            Text(
              'الاحتمالات',
              style: text.bodySmall?.copyWith(
                color: scheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            for (final EcgPrediction p in analysis.predictions)
              _PredictionBar(prediction: p),
          ],
          if (analysis.ecgImageUrl != null) ...<Widget>[
            const SizedBox(height: 10),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: () => _launchExternal(analysis.ecgImageUrl!),
                icon: const Icon(LucideIcons.externalLink, size: 14),
                label: const Text('عرض صورة التخطيط'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _launchExternal(String url) async {
    try {
      final Uri uri = Uri.parse(url);
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e, st) {
      appLogger.w('failed to open $url', error: e, stackTrace: st);
    }
  }
}

class _PredictionBar extends StatelessWidget {
  const _PredictionBar({required this.prediction});
  final EcgPrediction prediction;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final double pct = (prediction.confidence ?? 0).clamp(0, 100).toDouble();
    final TextTheme text = Theme.of(context).textTheme;

    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  prediction.displayLabel,
                  style: text.bodySmall,
                  textDirection: TextDirection.rtl,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                '${pct.toStringAsFixed(0)}%',
                textDirection: TextDirection.ltr,
                style: text.bodySmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: pct / 100,
              minHeight: 6,
              backgroundColor: scheme.surfaceContainerHighest,
              valueColor: const AlwaysStoppedAnimation<Color>(
                AppColors.error,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
