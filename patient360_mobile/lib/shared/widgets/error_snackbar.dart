import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/theme/app_colors.dart';

/// Floating red SnackBar with an alert icon, bold title, and optional Retry
/// action. Call sites stay short: `ErrorSnackbar.show(ctx, 'title', 'detail');`.
final class ErrorSnackbar {
  const ErrorSnackbar._();

  static ScaffoldFeatureController<SnackBar, SnackBarClosedReason> show(
    BuildContext context,
    String title,
    String message, {
    VoidCallback? onRetry,
  }) {
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();

    return messenger.showSnackBar(
      SnackBar(
        backgroundColor: AppColors.error,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 5),
        content: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Padding(
              padding: EdgeInsets.only(top: 2),
              child: Icon(LucideIcons.circleAlert, color: Colors.white),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    message,
                    style: const TextStyle(color: Colors.white),
                  ),
                ],
              ),
            ),
          ],
        ),
        action: onRetry == null
            ? null
            : SnackBarAction(
                label: 'إعادة المحاولة',
                textColor: Colors.white,
                onPressed: onRetry,
              ),
      ),
    );
  }
}
