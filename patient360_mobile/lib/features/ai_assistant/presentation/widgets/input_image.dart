import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';

/// Outcome of [ImageValidator.validate]. `null` for the rejection reason
/// means the file is valid; a non-null reason is meant to be shown to the
/// user via the host screen's `onAlert` callback.
@immutable
class ImageValidationResult {
  const ImageValidationResult({this.rejectionReason});
  final String? rejectionReason;
  bool get isValid => rejectionReason == null;
}

/// Pure validation logic, exposed so unit tests can pin the size + MIME
/// rules without instantiating the full [InputImage] widget.
class ImageValidator {
  const ImageValidator({this.maxBytes = 10 * 1024 * 1024});

  /// 10 MB default — matches the web `<InputImage maxSizeMB={10} />` atom.
  final int maxBytes;

  static const Set<String> _allowedExtensions = <String>{
    'jpg', 'jpeg', 'png', 'webp',
  };

  ImageValidationResult validate({
    required String path,
    required int sizeBytes,
  }) {
    if (sizeBytes > maxBytes) {
      final int mb = (maxBytes / (1024 * 1024)).round();
      return ImageValidationResult(
        rejectionReason: 'حجم الصورة يتجاوز $mb ميغابايت.',
      );
    }
    final String lowered = path.toLowerCase();
    final int dotIndex = lowered.lastIndexOf('.');
    final String ext = dotIndex == -1 ? '' : lowered.substring(dotIndex + 1);
    if (!_allowedExtensions.contains(ext)) {
      return const ImageValidationResult(
        rejectionReason: 'يُسمح فقط بصور JPG / PNG / WEBP.',
      );
    }
    return const ImageValidationResult();
  }
}

/// Two-button row + preview. Wraps `image_picker` for gallery and camera
/// sources, validates the picked file, and yields the [XFile] to its
/// [onChanged] handler when valid.
class InputImage extends StatefulWidget {
  const InputImage({
    required this.value,
    required this.onChanged,
    this.onAlert,
    this.maxSizeMB = 10,
    this.disabled = false,
    this.picker,
    super.key,
  });

  final XFile? value;
  final ValueChanged<XFile?> onChanged;

  /// Callback invoked with an Arabic message when the picked file fails
  /// validation. The host screen surfaces this as a SnackBar so the user
  /// understands why the image wasn't accepted.
  final ValueChanged<String>? onAlert;
  final int maxSizeMB;
  final bool disabled;

  /// Visible-for-tests injection point. Production wiring uses the
  /// real `image_picker` plugin; tests pass a fake.
  final ImagePicker? picker;

  @override
  State<InputImage> createState() => _InputImageState();
}

class _InputImageState extends State<InputImage> {
  late final ImagePicker _picker = widget.picker ?? ImagePicker();
  bool _busy = false;

  Future<void> _pick(ImageSource source) async {
    if (widget.disabled || _busy) return;
    setState(() => _busy = true);
    try {
      final XFile? file = await _picker.pickImage(
        source: source,
        maxWidth: 1920,
        imageQuality: 85,
      );
      if (file == null) return;
      final ImageValidator validator =
          ImageValidator(maxBytes: widget.maxSizeMB * 1024 * 1024);
      final int size = await file.length();
      final ImageValidationResult result =
          validator.validate(path: file.path, sizeBytes: size);
      if (!result.isValid) {
        widget.onAlert?.call(result.rejectionReason!);
        return;
      }
      widget.onChanged(file);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _remove() {
    widget.onChanged(null);
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: _SourceButton(
                  icon: LucideIcons.images,
                  label: 'من المعرض',
                  busy: _busy,
                  disabled: widget.disabled,
                  onTap: () => _pick(ImageSource.gallery),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _SourceButton(
                  icon: LucideIcons.camera,
                  label: 'التقاط صورة',
                  busy: _busy,
                  disabled: widget.disabled,
                  onTap: () => _pick(ImageSource.camera),
                ),
              ),
            ],
          ),
          if (widget.value != null) ...<Widget>[
            const SizedBox(height: 12),
            _Preview(file: widget.value!, onRemove: _remove),
          ],
        ],
      ),
    );
  }
}

class _SourceButton extends StatelessWidget {
  const _SourceButton({
    required this.icon,
    required this.label,
    required this.busy,
    required this.disabled,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool busy;
  final bool disabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final bool effectivelyDisabled = disabled || busy;
    final Color fg = effectivelyDisabled
        ? scheme.onSurfaceVariant
        : AppColors.action;
    return OutlinedButton.icon(
      onPressed: effectivelyDisabled ? null : onTap,
      icon: Icon(icon, size: 18, color: fg),
      label: Text(label, style: TextStyle(color: fg)),
      style: OutlinedButton.styleFrom(
        side: BorderSide(color: fg.withValues(alpha: 0.55)),
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.radiusMd),
        padding: const EdgeInsets.symmetric(vertical: 12),
      ),
    );
  }
}

class _Preview extends StatelessWidget {
  const _Preview({required this.file, required this.onRemove});
  final XFile file;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: AlignmentDirectional.topEnd,
      children: <Widget>[
        ClipRRect(
          borderRadius: AppRadii.radiusMd,
          child: kIsWeb
              ? const SizedBox(
                  height: 180,
                  child: Center(child: Text('preview unavailable on web')),
                )
              : Image.file(
                  File(file.path),
                  height: 180,
                  width: double.infinity,
                  fit: BoxFit.cover,
                ),
        ),
        Positioned(
          top: 6,
          right: 6,
          child: Material(
            color: Colors.black.withValues(alpha: 0.55),
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: onRemove,
              child: const Padding(
                padding: EdgeInsets.all(6),
                child: Icon(LucideIcons.x, color: Colors.white, size: 16),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
