import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';

/// Free-text → chip-list input. Pressing Enter, comma `,`, or Arabic
/// comma `،` commits the current text as a new chip. Used for allergies
/// and chronic-diseases editing in [ProfileEditSheet].
class ChipInput extends StatefulWidget {
  const ChipInput({
    required this.values,
    required this.onChanged,
    required this.label,
    this.hintText,
    this.tint = AppColors.action,
    super.key,
  });

  final List<String> values;
  final ValueChanged<List<String>> onChanged;
  final String label;
  final String? hintText;
  final Color tint;

  @override
  State<ChipInput> createState() => _ChipInputState();
}

class _ChipInputState extends State<ChipInput> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focus = FocusNode(debugLabel: 'ChipInput');

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _commit(String raw) {
    // Split on either comma so paste-friendly multi-entry input works in
    // one field. Trims and dedupes against existing values.
    final List<String> parts = raw
        .split(RegExp('[,،]'))
        .map((String s) => s.trim())
        .where((String s) => s.isNotEmpty)
        .toList();
    if (parts.isEmpty) return;
    final List<String> next = List<String>.from(widget.values);
    for (final String p in parts) {
      if (!next.contains(p)) next.add(p);
    }
    widget.onChanged(next);
    _controller.clear();
  }

  void _remove(String value) {
    final List<String> next =
        widget.values.where((String s) => s != value).toList();
    widget.onChanged(next);
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(
          widget.label,
          style: Theme.of(context)
              .textTheme
              .labelLarge
              ?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 6),
        if (widget.values.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: <Widget>[
                for (final String v in widget.values)
                  _ValueChip(
                    label: v,
                    tint: widget.tint,
                    onRemove: () => _remove(v),
                  ),
              ],
            ),
          ),
        TextField(
          controller: _controller,
          focusNode: _focus,
          decoration: InputDecoration(
            hintText: widget.hintText ??
                'اكتب ثم اضغط Enter أو فاصلة لإضافة عنصر',
            hintStyle: TextStyle(color: scheme.onSurfaceVariant),
            border: OutlineInputBorder(
              borderRadius: AppRadii.radiusMd,
              borderSide: BorderSide(color: scheme.outline),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: AppRadii.radiusMd,
              borderSide: BorderSide(color: scheme.outline),
            ),
            suffixIcon: IconButton(
              icon: const Icon(LucideIcons.plus),
              onPressed: () => _commit(_controller.text),
            ),
          ),
          inputFormatters: <TextInputFormatter>[
            // Live commit when the user types a comma — easier than waiting
            // for an Enter on a phone keyboard.
            TextInputFormatter.withFunction(
              (TextEditingValue old, TextEditingValue next) {
                final RegExp delim = RegExp('[,،]');
                if (!delim.hasMatch(next.text)) return next;
                final String pending = next.text.replaceAll(delim, ' ');
                _commit(pending);
                return const TextEditingValue();
              },
            ),
          ],
          onSubmitted: _commit,
        ),
      ],
    );
  }
}

class _ValueChip extends StatelessWidget {
  const _ValueChip({
    required this.label,
    required this.tint,
    required this.onRemove,
  });

  final String label;
  final Color tint;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsetsDirectional.fromSTEB(10, 4, 4, 4),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.16),
        borderRadius: AppRadii.radiusSm,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(
            label,
            style: TextStyle(
              color: tint,
              fontWeight: FontWeight.w700,
              fontSize: 12,
            ),
          ),
          const SizedBox(width: 4),
          InkWell(
            onTap: onRemove,
            customBorder: const CircleBorder(),
            child: Padding(
              padding: const EdgeInsets.all(2),
              child: Icon(LucideIcons.x, size: 14, color: tint),
            ),
          ),
        ],
      ),
    );
  }
}
