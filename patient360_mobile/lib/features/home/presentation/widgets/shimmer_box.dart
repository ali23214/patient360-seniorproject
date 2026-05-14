import 'package:flutter/material.dart';

/// Lightweight loading placeholder that pulses between two shades of the
/// theme's surface tokens. Avoids adding the `shimmer` package for what is
/// effectively a 30-line widget.
class ShimmerBox extends StatefulWidget {
  const ShimmerBox({
    required this.width,
    required this.height,
    this.borderRadius,
    super.key,
  });

  final double width;
  final double height;
  final BorderRadius? borderRadius;

  @override
  State<ShimmerBox> createState() => _ShimmerBoxState();
}

class _ShimmerBoxState extends State<ShimmerBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return AnimatedBuilder(
      animation: _controller,
      builder: (BuildContext _, Widget? __) {
        return Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            color: Color.lerp(
              scheme.surfaceContainerHighest,
              scheme.outline.withValues(alpha: 0.25),
              _controller.value,
            ),
            borderRadius:
                widget.borderRadius ?? BorderRadius.circular(6),
          ),
        );
      },
    );
  }
}
