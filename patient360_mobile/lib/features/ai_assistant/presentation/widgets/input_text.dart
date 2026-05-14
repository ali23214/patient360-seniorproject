import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';

/// Multi-line free-text input with a character counter and a primary
/// "send" button. Long-press to submit (mobile equivalent of Ctrl+Enter
/// from the web atom).
///
/// The counter switches color based on usage:
///   * <75% → muted (OK)
///   * 75-90% → warning amber
///   * >90% → error red
class InputText extends StatefulWidget {
  const InputText({
    required this.controller,
    required this.onSubmit,
    required this.maxLength,
    this.hintText,
    this.disabled = false,
    this.minLines = 4,
    this.maxLines = 8,
    super.key,
  });

  final TextEditingController controller;
  final VoidCallback onSubmit;
  final int maxLength;
  final String? hintText;
  final bool disabled;
  final int minLines;
  final int maxLines;

  @override
  State<InputText> createState() => _InputTextState();
}

class _InputTextState extends State<InputText> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_handleChange);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_handleChange);
    super.dispose();
  }

  void _handleChange() {
    if (mounted) setState(() {});
  }

  bool get _hasText => widget.controller.text.trim().isNotEmpty;
  int get _length => widget.controller.text.length;

  Color _counterColor(ColorScheme scheme) {
    final double ratio = _length / widget.maxLength;
    if (ratio > 0.90) return AppColors.error;
    if (ratio >= 0.75) return AppColors.warning;
    return scheme.onSurfaceVariant;
  }

  void _clear() {
    widget.controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Container(
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: TextField(
              controller: widget.controller,
              enabled: !widget.disabled,
              maxLines: widget.maxLines,
              minLines: widget.minLines,
              maxLength: widget.maxLength,
              maxLengthEnforcement: MaxLengthEnforcement.enforced,
              textInputAction: TextInputAction.newline,
              decoration: InputDecoration(
                hintText: widget.hintText ?? 'اكتب وصفاً مفصلاً للأعراض...',
                hintStyle: TextStyle(color: scheme.onSurfaceVariant),
                border: InputBorder.none,
                isCollapsed: true,
                counterText: '',
                contentPadding:
                    const EdgeInsets.symmetric(vertical: 8),
              ),
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
            child: Row(
              children: <Widget>[
                if (_hasText && !widget.disabled)
                  IconButton(
                    onPressed: _clear,
                    icon: const Icon(LucideIcons.x, size: 18),
                    tooltip: 'مسح',
                    color: scheme.onSurfaceVariant,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(
                      minWidth: 32,
                      minHeight: 32,
                    ),
                  ),
                const Spacer(),
                Text(
                  '$_length / ${widget.maxLength}',
                  textDirection: TextDirection.ltr,
                  style: TextStyle(
                    color: _counterColor(scheme),
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 8),
                _SubmitButton(
                  enabled: !widget.disabled && _hasText,
                  onSubmit: widget.onSubmit,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SubmitButton extends StatelessWidget {
  const _SubmitButton({required this.enabled, required this.onSubmit});

  final bool enabled;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final Color bg =
        enabled ? AppColors.action : AppColors.action.withValues(alpha: 0.30);
    final Color fg =
        enabled ? Colors.white : Colors.white.withValues(alpha: 0.65);

    return Tooltip(
      message: 'اضغط مطولاً للإرسال',
      child: Material(
        color: bg,
        borderRadius: AppRadii.radiusMd,
        child: InkWell(
          borderRadius: AppRadii.radiusMd,
          onTap: enabled ? onSubmit : null,
          // Long-press also submits — matches the prompt's spec for the
          // "no Ctrl+Enter on mobile" pattern.
          onLongPress: enabled ? onSubmit : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 8,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  'إرسال',
                  style: TextStyle(
                    color: fg,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(width: 6),
                Icon(LucideIcons.send, size: 14, color: fg),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
