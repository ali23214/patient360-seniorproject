import 'package:flutter/material.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/review.dart';

class ReviewCard extends StatelessWidget {
  const ReviewCard({required this.review, super.key});
  final Review review;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final ReviewTargetRef? target = review.target;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          if (target != null) _TargetRow(target: target),
          const SizedBox(height: 8),
          Row(
            children: <Widget>[
              for (int i = 1; i <= 5; i++)
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 2),
                  child: Icon(
                    LucideIcons.star,
                    size: 18,
                    color: i <= review.rating
                        ? AppColors.warning
                        : scheme.outline,
                  ),
                ),
            ],
          ),
          if (review.reviewText != null && review.reviewText!.isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            Text(
              review.reviewText!,
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(height: 1.6),
            ),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: <Widget>[
              _StatusChip(status: review.status),
              if (review.isAnonymous)
                const _AnonymousChip(),
              _MetaText(
                icon: LucideIcons.clock,
                text: intl.DateFormat('yyyy-MM-dd').format(review.createdAt),
                ltr: true,
              ),
            ],
          ),
          if (review.adminNote != null && review.adminNote!.isNotEmpty) ...<Widget>[
            const SizedBox(height: 10),
            _AdminNoteBlock(note: review.adminNote!),
          ],
        ],
      ),
    );
  }
}

class _TargetRow extends StatelessWidget {
  const _TargetRow({required this.target});
  final ReviewTargetRef target;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final IconData icon = _iconFor(target.type);
    return Row(
      children: <Widget>[
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: AppColors.action.withValues(alpha: 0.15),
            borderRadius: AppRadii.radiusSm,
          ),
          alignment: Alignment.center,
          child: Icon(icon, size: 16, color: AppColors.action),
        ),
        const SizedBox(width: 8),
        Text(
          target.type.arabicLabel,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            '#${target.id}',
            textDirection: TextDirection.ltr,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: scheme.onSurfaceVariant,
                  fontFamily: 'Inter',
                ),
            overflow: TextOverflow.ellipsis,
            maxLines: 1,
          ),
        ),
      ],
    );
  }

  static IconData _iconFor(ReviewTargetType t) => switch (t) {
        ReviewTargetType.doctor => LucideIcons.stethoscope,
        ReviewTargetType.dentist => LucideIcons.brushCleaning,
        ReviewTargetType.laboratory => LucideIcons.flaskConical,
        ReviewTargetType.pharmacy => LucideIcons.pill,
        ReviewTargetType.hospital => LucideIcons.hospital,
      };
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (Color color, String label) = _styleFor(status);
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

  static (Color, String) _styleFor(String s) => switch (s) {
        'approved' => (AppColors.success, 'منشور'),
        'rejected' => (AppColors.error, 'مرفوض'),
        'flagged' => (AppColors.warning, 'تمت إشارته'),
        _ => (AppColors.warning, 'بانتظار المراجعة'),
      };
}

class _AnonymousChip extends StatelessWidget {
  const _AnonymousChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.accent.withValues(alpha: 0.18),
        borderRadius: AppRadii.radiusSm,
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(LucideIcons.userCheck, size: 12, color: AppColors.primary),
          SizedBox(width: 4),
          Text(
            'مجهول الهوية',
            style: TextStyle(
              color: AppColors.primary,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetaText extends StatelessWidget {
  const _MetaText({required this.icon, required this.text, this.ltr = false});
  final IconData icon;
  final String text;
  final bool ltr;
  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Icon(icon, size: 12, color: scheme.onSurfaceVariant),
        const SizedBox(width: 4),
        Text(
          text,
          textDirection: ltr ? TextDirection.ltr : null,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
        ),
      ],
    );
  }
}

class _AdminNoteBlock extends StatelessWidget {
  const _AdminNoteBlock({required this.note});
  final String note;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: AppRadii.radiusMd,
        border: Border.all(color: scheme.outline),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(LucideIcons.shieldCheck,
              size: 14, color: scheme.onSurfaceVariant),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'ملاحظة الإدارة',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: scheme.onSurfaceVariant,
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 2),
                Text(
                  note,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
