import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';

/// Three-choice segmented control: text / image / voice.
/// Mirrors the web atom `InputModeToggle.jsx` — voice is now enabled
/// because Redwan's FastAPI service includes Whisper transcription.
enum AiInputMode { text, image, voice }

class InputModeToggle extends StatelessWidget {
  const InputModeToggle({
    required this.current,
    required this.onChanged,
    this.disabled = false,
    super.key,
  });

  final AiInputMode current;
  final ValueChanged<AiInputMode> onChanged;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: _ToggleButton(
              label: 'نص',
              icon: LucideIcons.messageSquare,
              selected: current == AiInputMode.text,
              disabled: disabled,
              onTap: () => onChanged(AiInputMode.text),
            ),
          ),
          Expanded(
            child: _ToggleButton(
              label: 'صورة',
              icon: LucideIcons.image,
              selected: current == AiInputMode.image,
              disabled: disabled,
              onTap: () => onChanged(AiInputMode.image),
            ),
          ),
          Expanded(
            child: _ToggleButton(
              label: 'صوت',
              icon: LucideIcons.mic,
              selected: current == AiInputMode.voice,
              disabled: disabled,
              onTap: () => onChanged(AiInputMode.voice),
            ),
          ),
        ],
      ),
    );
  }
}

class _ToggleButton extends StatelessWidget {
  const _ToggleButton({
    required this.label,
    required this.icon,
    required this.selected,
    required this.disabled,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final bool disabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final Color foreground = disabled
        ? scheme.onSurfaceVariant.withValues(alpha: 0.45)
        : selected
            ? Colors.white
            : scheme.onSurfaceVariant;
    return Material(
      color: selected ? AppColors.action : Colors.transparent,
      borderRadius: AppRadii.radiusMd,
      child: InkWell(
        borderRadius: AppRadii.radiusMd,
        onTap: disabled ? null : onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
          alignment: Alignment.center,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(icon, size: 16, color: foreground),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: foreground,
                    fontWeight:
                        selected ? FontWeight.w700 : FontWeight.w500,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}