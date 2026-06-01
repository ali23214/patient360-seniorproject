import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';

/// Label/value row used inside the personal/medical/emergency cards.
/// Optional [iconLeading] sits before the label, optional [tooltip]
/// surfaces an info icon, and optional [copyable] renders a copy button
/// after the value.
class InfoPair extends StatelessWidget {
  const InfoPair({
    required this.label,
    required this.value,
    this.iconLeading,
    this.tooltip,
    this.ltr = false,
    this.copyable = false,
    this.locked = false,
    super.key,
  });

  final String label;
  final String value;
  final IconData? iconLeading;
  final String? tooltip;
  final bool ltr;
  final bool copyable;

  /// When true, renders a Lock icon next to the value to communicate
  /// "read-only in this app" (e.g. email/national ID).
  final bool locked;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (iconLeading != null) ...<Widget>[
            Icon(iconLeading, size: 14, color: scheme.onSurfaceVariant),
            const SizedBox(width: 8),
          ],
          SizedBox(
            width: 110,
            child: Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    label,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ),
                if (locked) ...<Widget>[
                  Tooltip(
                    message: tooltip ??
                        'لا يمكن تغيير هذا الحقل في هذا الإصدار',
                    child: Icon(
                      LucideIcons.lock,
                      size: 12,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Expanded(
                  child: SelectableText(
                    value.isEmpty ? '—' : value,
                    textDirection: ltr ? TextDirection.ltr : null,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontFamily: ltr ? 'Inter' : null,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ),
                if (copyable && value.isNotEmpty)
                  IconButton(
                    icon: const Icon(LucideIcons.copy, size: 14),
                    color: AppColors.action,
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(
                      minWidth: 32,
                      minHeight: 32,
                    ),
                    tooltip: 'نسخ',
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: value));
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          duration: Duration(seconds: 2),
                          content: Text('تم النسخ'),
                        ),
                      );
                    },
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
