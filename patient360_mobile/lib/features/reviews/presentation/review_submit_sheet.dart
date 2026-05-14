import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../domain/review.dart';
import 'providers/reviews_provider.dart';
import 'widgets/star_rating_input.dart';

/// Modal sheet for composing + submitting a new review. Mirrors the web's
/// `ReviewSubmitForm` but flattens the layout to a single scrollable
/// column to fit a phone viewport.
class ReviewSubmitSheet extends ConsumerStatefulWidget {
  const ReviewSubmitSheet({super.key});

  static Future<bool?> show(BuildContext context) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext _) => const ReviewSubmitSheet(),
    );
  }

  @override
  ConsumerState<ReviewSubmitSheet> createState() =>
      _ReviewSubmitSheetState();
}

class _ReviewSubmitSheetState extends ConsumerState<ReviewSubmitSheet> {
  ReviewTargetType _targetType = ReviewTargetType.doctor;
  final TextEditingController _idController = TextEditingController();
  final TextEditingController _textController = TextEditingController();
  int _rating = 0;
  bool _anonymous = false;
  bool _busy = false;

  @override
  void dispose() {
    _idController.dispose();
    _textController.dispose();
    super.dispose();
  }

  bool get _isValid =>
      _idController.text.trim().isNotEmpty && _rating >= 1 && !_busy;

  Future<void> _submit() async {
    if (!_isValid) return;
    setState(() => _busy = true);
    try {
      await ref.read(reviewsProvider.notifier).submit(
            ReviewSubmitDto(
              targetType: _targetType,
              targetId: _idController.text.trim(),
              rating: _rating,
              isAnonymous: _anonymous,
              reviewText: _textController.text.trim().isEmpty
                  ? null
                  : _textController.text.trim(),
            ),
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم إرسال التقييم. شكراً لمشاركتك.')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toDisplayMessage())),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (BuildContext _, ScrollController controller) {
        return SingleChildScrollView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text(
                'إضافة تقييم',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 12),
              const _SectionTitle('نوع المُقيَّم'),
              const SizedBox(height: 6),
              _TargetTypePicker(
                current: _targetType,
                onChanged: (ReviewTargetType t) =>
                    setState(() => _targetType = t),
              ),
              const SizedBox(height: 14),
              const _SectionTitle('المعرّف'),
              const SizedBox(height: 6),
              TextField(
                controller: _idController,
                textDirection: TextDirection.ltr,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: 'أدخل المعرّف...',
                  hintStyle: TextStyle(color: scheme.onSurfaceVariant),
                  border: OutlineInputBorder(
                    borderRadius: AppRadii.radiusMd,
                    borderSide: BorderSide(color: scheme.outline),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: AppRadii.radiusMd,
                    borderSide: BorderSide(color: scheme.outline),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  'ستتم إضافة اختيار مباشر من قائمة الأطباء/المراكز في إصدار لاحق.',
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                ),
              ),
              const SizedBox(height: 14),
              const _SectionTitle('التقييم'),
              const SizedBox(height: 6),
              StarRatingInput(
                value: _rating,
                onChanged: (int v) => setState(() => _rating = v),
                disabled: _busy,
              ),
              const SizedBox(height: 14),
              const _SectionTitle('التعليق (اختياري)'),
              const SizedBox(height: 6),
              TextField(
                controller: _textController,
                minLines: 3,
                maxLines: 6,
                maxLength: 1000,
                decoration: InputDecoration(
                  hintText: 'شاركنا تجربتك بإيجاز...',
                  hintStyle: TextStyle(color: scheme.onSurfaceVariant),
                  counterText: '',
                  border: OutlineInputBorder(
                    borderRadius: AppRadii.radiusMd,
                    borderSide: BorderSide(color: scheme.outline),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: AppRadii.radiusMd,
                    borderSide: BorderSide(color: scheme.outline),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _anonymous,
                onChanged: _busy
                    ? null
                    : (bool? v) => setState(() => _anonymous = v ?? false),
                title: const Text('إرسال التقييم دون الكشف عن الهوية'),
                controlAffinity: ListTileControlAffinity.leading,
              ),
              const SizedBox(height: 8),
              ElevatedButton.icon(
                onPressed: _isValid ? _submit : null,
                icon: _busy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(LucideIcons.send, size: 16),
                label: Text(_busy ? 'جاري الإرسال...' : 'إرسال التقييم'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.action,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
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
      style: Theme.of(context).textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w800,
          ),
    );
  }
}

class _TargetTypePicker extends StatelessWidget {
  const _TargetTypePicker({required this.current, required this.onChanged});
  final ReviewTargetType current;
  final ValueChanged<ReviewTargetType> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: <Widget>[
        for (final ReviewTargetType t in ReviewTargetType.values)
          _TargetTypeChip(
            type: t,
            selected: t == current,
            onTap: () => onChanged(t),
          ),
      ],
    );
  }
}

class _TargetTypeChip extends StatelessWidget {
  const _TargetTypeChip({
    required this.type,
    required this.selected,
    required this.onTap,
  });

  final ReviewTargetType type;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final IconData icon = _iconFor(type);
    final Color fg = selected ? Colors.white : scheme.onSurface;
    return Material(
      color: selected ? AppColors.action : scheme.surfaceContainer,
      borderRadius: AppRadii.radiusMd,
      child: InkWell(
        borderRadius: AppRadii.radiusMd,
        onTap: onTap,
        child: Container(
          padding:
              const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: AppRadii.radiusMd,
            border: Border.all(
              color: selected ? AppColors.action : scheme.outline,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(icon, size: 16, color: fg),
              const SizedBox(width: 6),
              Text(
                type.arabicLabel,
                style: TextStyle(
                  color: fg,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
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
