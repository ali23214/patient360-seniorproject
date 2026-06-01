// ════════════════════════════════════════════════════════════════════════════
//  VisitNoteCard           — generic single-section text card (notes / etc.)
//  VisitPhotoCard          — preview thumbnail for an attached image.
//  VisitEcgCard            — compact summary card for ECG analysis.
//  Each card lives in its own widget tree so the detail page can decide
//  conditionally whether to emit it.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/ecg_analysis.dart';
import 'visit_info_section.dart' show VisitSectionHeader;

// ════════════════════════════════════════════════════════════════════════════
// Generic note card — used for doctorNotes and followUpNotes
// ════════════════════════════════════════════════════════════════════════════

class VisitNoteCard extends StatelessWidget {
  const VisitNoteCard({
    super.key,
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          VisitSectionHeader(icon: icon, title: title),
          const SizedBox(height: 10),
          Text(
            body.trim().isEmpty ? '—' : body,
            style: const TextStyle(
              fontSize: 13,
              color: AppColors.textPrimary,
              fontFamily: 'Cairo',
              height: 1.6,
            ),
          ),
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Photo card — thumbnail with tap-to-zoom
// ════════════════════════════════════════════════════════════════════════════

class VisitPhotoCard extends StatelessWidget {
  const VisitPhotoCard({super.key, required this.imageUrl, this.onOpen});

  final String imageUrl;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const VisitSectionHeader(
            icon: LucideIcons.image,
            title: 'صورة الزيارة',
          ),
          const SizedBox(height: 12),
          Material(
            color: AppColors.background,
            borderRadius: AppRadii.radiusMd,
            child: InkWell(
              borderRadius: AppRadii.radiusMd,
              onTap: onOpen,
              child: Container(
                height: 180,
                width: double.infinity,
                decoration: BoxDecoration(
                  borderRadius: AppRadii.radiusMd,
                  border: Border.all(color: AppColors.border),
                ),
                clipBehavior: Clip.antiAlias,
                child: Image.network(
                  imageUrl,
                  fit: BoxFit.cover,
                  loadingBuilder:
                      (
                        BuildContext ctx,
                        Widget child,
                        ImageChunkEvent? progress,
                      ) {
                        if (progress == null) return child;
                        return const Center(
                          child: SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        );
                      },
                  errorBuilder: (BuildContext ctx, Object e, StackTrace? st) =>
                      const Center(
                        child: Padding(
                          padding: EdgeInsets.all(16),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: <Widget>[
                              Icon(
                                LucideIcons.imageOff,
                                size: 32,
                                color: AppColors.textSecondary,
                              ),
                              SizedBox(height: 6),
                              Text(
                                'تعذر تحميل الصورة',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textSecondary,
                                  fontFamily: 'Cairo',
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                ),
              ),
            ),
          ),
          if (onOpen != null) ...<Widget>[
            const SizedBox(height: 8),
            const Row(
              children: <Widget>[
                Icon(
                  LucideIcons.zoomIn,
                  size: 14,
                  color: AppColors.textSecondary,
                ),
                SizedBox(width: 6),
                Text(
                  'اضغط على الصورة لعرضها بحجم أكبر',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                    fontFamily: 'Cairo',
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ECG analysis card
// ════════════════════════════════════════════════════════════════════════════

class VisitEcgCard extends StatelessWidget {
  const VisitEcgCard({super.key, required this.ecg});

  final EcgAnalysis ecg;

  @override
  Widget build(BuildContext context) {
    final String top = (ecg.topPrediction ?? '').isNotEmpty
        ? ecg.topPrediction!
        : (ecg.predictions.isNotEmpty
              ? ecg.predictions.first.displayLabel
              : '—');

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const VisitSectionHeader(
            icon: LucideIcons.heartPulse,
            title: 'تحليل ECG',
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: const BorderRadius.all(Radius.circular(8)),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Icon(
                  LucideIcons.activity,
                  size: 18,
                  color: AppColors.action,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const Text(
                        'التوقع الرئيسي',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textSecondary,
                          fontFamily: 'Cairo',
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        top,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: AppColors.primary,
                          fontFamily: 'Cairo',
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if ((ecg.recommendation ?? '').trim().isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: const BorderRadius.all(Radius.circular(8)),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Icon(
                    LucideIcons.lightbulb,
                    size: 14,
                    color: AppColors.action,
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      ecg.recommendation!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textPrimary,
                        fontFamily: 'Cairo',
                        height: 1.5,
                      ),
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
}
