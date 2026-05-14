import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radii.dart';

/// Teal Medica filled button (bg = action, fg = white). Shows a spinner in
/// place of the label while [loading] is true.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.icon,
    this.fullWidth = true,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final bool fullWidth;

  @override
  Widget build(BuildContext context) {
    final ButtonStyle style = ElevatedButton.styleFrom(
      backgroundColor: AppColors.action,
      foregroundColor: Colors.white,
      disabledBackgroundColor: AppColors.action.withValues(alpha: 0.5),
      disabledForegroundColor: Colors.white70,
      minimumSize: Size.fromHeight(fullWidth ? 48 : 0),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      shape: const RoundedRectangleBorder(borderRadius: AppRadii.radiusMd),
      elevation: 0,
    );

    final Widget child = loading
        ? const SizedBox(
            height: 20,
            width: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
            ),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              if (icon != null) ...<Widget>[
                Icon(icon, size: 18),
                const SizedBox(width: 8),
              ],
              Text(label),
            ],
          );

    return ElevatedButton(
      onPressed: loading ? null : onPressed,
      style: style,
      child: child,
    );
  }
}
