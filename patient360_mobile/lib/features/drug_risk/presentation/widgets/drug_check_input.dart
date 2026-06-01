// ============================================================================
// DrugCheckInput - Patient 360 mobile (drug-risk feature)
// ----------------------------------------------------------------------------
// The input card: a multi-line text field with character counter, plus a
// primary "فحص الدواء" button and a secondary "مسح" button.
//
// Mirrors the web atom in PatientDashboard.jsx → pd-dr-input-* classes.
// The 500-char cap is enforced both client-side (here) and server-side
// (drugRiskController.js MAX_INPUT_TEXT_LENGTH).
// ============================================================================

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';

class DrugCheckInput extends StatefulWidget {
  const DrugCheckInput({
    required this.onSubmit,
    required this.onClear,
    this.isLoading = false,
    this.disabled = false,
    super.key,
  });

  /// Fired when the user taps the primary "فحص الدواء" button (or hits
  /// Enter while the field has text). Receives the trimmed text.
  final ValueChanged<String> onSubmit;

  /// Fired when the user taps "مسح". The widget also clears its own
  /// internal controller when this is called.
  final VoidCallback onClear;

  /// When true, the submit button shows a spinner and is disabled.
  final bool isLoading;

  /// When true, both buttons are disabled (e.g. while another request is
  /// in flight elsewhere).
  final bool disabled;

  @override
  State<DrugCheckInput> createState() => _DrugCheckInputState();
}

class _DrugCheckInputState extends State<DrugCheckInput> {
  static const int _maxChars = 500;

  late final TextEditingController _controller;
  late final FocusNode _focus;
  int _length = 0;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
    _focus = FocusNode();
    _controller.addListener(_onTextChanged);
  }

  @override
  void dispose() {
    _controller.removeListener(_onTextChanged);
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onTextChanged() {
    final int newLen = _controller.text.length;
    if (newLen != _length) {
      setState(() => _length = newLen);
    }
  }

  void _handleSubmit() {
    final String text = _controller.text.trim();
    if (text.isEmpty || widget.isLoading || widget.disabled) return;
    _focus.unfocus();
    widget.onSubmit(text);
  }

  void _handleClear() {
    _controller.clear();
    setState(() => _length = 0);
    widget.onClear();
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final bool isEffectivelyDisabled = widget.disabled || widget.isLoading;
    final bool canSubmit = !isEffectivelyDisabled && _length > 0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          // -- Label --
          Text(
            'اسم الدواء أو جملة عنه',
            style: TextStyle(
              color: scheme.onSurface,
              fontSize: 14,
              fontWeight: FontWeight.w700,
              fontFamily: 'Cairo',
            ),
          ),
          const SizedBox(height: 8),

          // -- Text field --
          TextField(
            controller: _controller,
            focusNode: _focus,
            enabled: !isEffectivelyDisabled,
            maxLines: 4,
            minLines: 3,
            maxLength: _maxChars,
            textInputAction: TextInputAction.newline,
            inputFormatters: <TextInputFormatter>[
              LengthLimitingTextInputFormatter(_maxChars),
            ],
            style: TextStyle(
              fontSize: 14,
              fontFamily: 'Cairo',
              color: scheme.onSurface,
              height: 1.6,
            ),
            decoration: InputDecoration(
              hintText: 'مثال: amoxicillin أو "بدي ibuprofen"',
              hintStyle: TextStyle(
                color: scheme.onSurfaceVariant,
                fontSize: 13,
                fontFamily: 'Cairo',
              ),
              filled: true,
              fillColor: scheme.surfaceContainerHighest,
              counterText: '', // We render our own counter below
              border: OutlineInputBorder(
                borderRadius: AppRadii.radiusMd,
                borderSide: BorderSide(color: scheme.outline),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: AppRadii.radiusMd,
                borderSide: BorderSide(color: scheme.outline),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: AppRadii.radiusMd,
                borderSide: BorderSide(color: AppColors.action, width: 2),
              ),
              disabledBorder: OutlineInputBorder(
                borderRadius: AppRadii.radiusMd,
                borderSide: BorderSide(
                  color: scheme.outline.withValues(alpha: 0.5),
                ),
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 12,
              ),
            ),
          ),

          // -- Custom counter (LTR always for digit stability) --
          const SizedBox(height: 6),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: Directionality(
              textDirection: TextDirection.ltr,
              child: Text(
                '$_length / $_maxChars',
                style: TextStyle(
                  color: _length >= _maxChars
                      ? AppColors.warning
                      : scheme.onSurfaceVariant,
                  fontSize: 11,
                  fontFamily: 'Inter',
                  fontFeatures: const <FontFeature>[
                    FontFeature.tabularFigures(),
                  ],
                ),
              ),
            ),
          ),

          // -- Buttons row --
          const SizedBox(height: 12),
          Row(
            children: <Widget>[
              // Primary: فحص الدواء
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: canSubmit ? _handleSubmit : null,
                  icon: widget.isLoading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              Colors.white,
                            ),
                          ),
                        )
                      : const Icon(LucideIcons.shieldCheck, size: 18),
                  label: Text(
                    widget.isLoading ? 'جارٍ الفحص...' : 'فحص الدواء',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      fontFamily: 'Cairo',
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.action,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: scheme.onSurface.withValues(
                      alpha: 0.12,
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: AppRadii.radiusMd,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              // Secondary: مسح
              // Wrapped in IntrinsicWidth so the OutlinedButton sizes to its
              // content instead of trying to fill the Row (which would force
              // infinite width inside a SingleChildScrollView).
              IntrinsicWidth(
                child: OutlinedButton.icon(
                  onPressed: (isEffectivelyDisabled || _length == 0)
                      ? null
                      : _handleClear,
                  icon: const Icon(LucideIcons.rotateCcw, size: 16),
                  label: const Text(
                    'مسح',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      fontFamily: 'Cairo',
                    ),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: scheme.onSurface,
                    side: BorderSide(color: scheme.outline),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 13,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: AppRadii.radiusMd,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
