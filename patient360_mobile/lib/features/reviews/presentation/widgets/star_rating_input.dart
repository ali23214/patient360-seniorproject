import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';

/// Five interactive stars with keyboard support. Tap or use arrow keys to
/// adjust the rating; matches the web's `StarRatingInput` keyboard
/// affordances (left/right arrows, 1–5 number shortcuts).
class StarRatingInput extends StatefulWidget {
  const StarRatingInput({
    required this.value,
    required this.onChanged,
    this.disabled = false,
    super.key,
  });

  /// Current rating, 0..5. 0 means "no rating yet".
  final int value;
  final ValueChanged<int> onChanged;
  final bool disabled;

  @override
  State<StarRatingInput> createState() => _StarRatingInputState();
}

class _StarRatingInputState extends State<StarRatingInput> {
  late final FocusNode _focusNode = FocusNode(debugLabel: 'StarRatingInput');

  @override
  void dispose() {
    _focusNode.dispose();
    super.dispose();
  }

  void _set(int next) {
    if (widget.disabled) return;
    if (next < 0) next = 0;
    if (next > 5) next = 5;
    if (next == widget.value) return;
    widget.onChanged(next);
  }

  KeyEventResult _onKey(FocusNode _, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    if (event.logicalKey == LogicalKeyboardKey.arrowLeft) {
      _set(widget.value + 1); // RTL: left arrow → higher rating
      return KeyEventResult.handled;
    }
    if (event.logicalKey == LogicalKeyboardKey.arrowRight) {
      _set(widget.value - 1);
      return KeyEventResult.handled;
    }
    final String? char = event.character;
    if (char != null && RegExp(r'^[1-5]$').hasMatch(char)) {
      _set(int.parse(char));
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      focusNode: _focusNode,
      onKeyEvent: _onKey,
      child: Semantics(
        slider: true,
        label: 'تقييم',
        value: '${widget.value}/5',
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            for (int i = 1; i <= 5; i++)
              _Star(
                index: i,
                filled: i <= widget.value,
                onTap: () => _set(i),
                disabled: widget.disabled,
              ),
          ],
        ),
      ),
    );
  }
}

class _Star extends StatelessWidget {
  const _Star({
    required this.index,
    required this.filled,
    required this.onTap,
    required this.disabled,
  });

  final int index;
  final bool filled;
  final VoidCallback onTap;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final Color color =
        filled ? AppColors.warning : Theme.of(context).colorScheme.outline;
    return Semantics(
      button: true,
      label: '$index من 5',
      child: IconButton(
        onPressed: disabled ? null : onTap,
        icon: Icon(LucideIcons.star, color: color, size: 30),
        padding: const EdgeInsets.symmetric(horizontal: 4),
        splashRadius: 22,
        constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
      ),
    );
  }
}
