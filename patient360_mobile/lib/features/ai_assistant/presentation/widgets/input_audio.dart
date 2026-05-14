// ════════════════════════════════════════════════════════════════════════════
//  InputAudio — Patient 360° (mobile)
//  ──────────────────────────────────────────────────────────────────────────
//  Mirrors the web atom `InputAudio.jsx`. WhatsApp-style live mic recorder
//  for the Emergency Triage AI feature. Records to WAV @ 16 kHz mono so
//  Redwan's FastAPI Whisper service can consume it without resampling.
//
//  Three states:
//    • idle      — large red Mic button (72×72), Arabic CTA
//    • recording — pulsing red stop button + MM:SS timer + remaining
//    • recorded  — file metadata + "إعادة التسجيل" + "تحليل"
//
//  Permissions:
//    • Android: RECORD_AUDIO (declared in AndroidManifest.xml)
//    • iOS: NSMicrophoneUsageDescription (declared in Info.plist)
//    • The `record` package's hasPermission() prompts the user the first
//      time and returns true/false thereafter.
// ════════════════════════════════════════════════════════════════════════════

import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../../../core/utils/logger.dart';

/// WhatsApp-style mic recorder. Output is a real .wav file the parent
/// receives via [onChanged] (and submits via [onSubmit]).
class InputAudio extends StatefulWidget {
  const InputAudio({
    required this.onChanged,
    required this.onSubmit,
    this.disabled = false,
    this.maxDurationSec = 120,
    this.onAlert,
    super.key,
  });

  /// Fired with the resulting File when a recording completes, or null
  /// when the patient hits "إعادة التسجيل" / unmounts.
  final ValueChanged<File?> onChanged;

  /// Fired when the patient hits "تحليل" with a captured recording.
  final ValueChanged<File> onSubmit;

  /// When true, all controls are inert.
  final bool disabled;

  /// Hard cap in seconds. Recording auto-stops cleanly when reached.
  final int maxDurationSec;

  /// Optional snackbar/toast hook for error messages. If omitted, errors
  /// fall back to [appLogger.w] silently.
  final void Function(String message)? onAlert;

  @override
  State<InputAudio> createState() => _InputAudioState();
}

enum _AudioMode { idle, recording, recorded }

class _InputAudioState extends State<InputAudio> {
  final AudioRecorder _recorder = AudioRecorder();

  _AudioMode _mode = _AudioMode.idle;
  Timer? _ticker;
  DateTime? _startedAt;
  Duration _elapsed = Duration.zero;
  Duration _finalDuration = Duration.zero;
  File? _recordedFile;
  String? _permissionError;

  @override
  void dispose() {
    _ticker?.cancel();
    // Stop any in-flight recording defensively. Ignore errors.
    // ignore: discarded_futures
    _recorder.stop().catchError((_) => null).whenComplete(() async {
      await _recorder.dispose();
    });
    super.dispose();
  }

  // ── Format helpers ────────────────────────────────────────────────────────
  String _formatMmSs(Duration d) {
    final int m = d.inMinutes;
    final int s = d.inSeconds.remainder(60);
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes بايت';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} ك.ب';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} م.ب';
  }

  // ── Start recording ───────────────────────────────────────────────────────
  Future<void> _startRecording() async {
    if (widget.disabled) return;
    setState(() => _permissionError = null);

    try {
      final bool ok = await _recorder.hasPermission();
      if (!ok) {
        setState(() {
          _permissionError =
              'لم يتم منح إذن الوصول إلى الميكروفون. يرجى تفعيله من إعدادات التطبيق.';
        });
        return;
      }

      final Directory dir = await getTemporaryDirectory();
      final String fileName =
          'emergency_${DateTime.now().millisecondsSinceEpoch}.wav';
      final String filePath = '${dir.path}/$fileName';

      // 16 kHz mono PCM WAV — matches Redwan's FastAPI input shape exactly.
      const RecordConfig config = RecordConfig(
        encoder: AudioEncoder.wav,
        sampleRate: 16000,
        numChannels: 1,
      );

      await _recorder.start(config, path: filePath);

      _startedAt = DateTime.now();
      _ticker?.cancel();
      _ticker = Timer.periodic(const Duration(milliseconds: 200), (_) {
        if (!mounted) return;
        final Duration el = DateTime.now().difference(_startedAt!);
        setState(() => _elapsed = el);
        // Auto-stop at the cap.
        if (el.inSeconds >= widget.maxDurationSec) {
          // ignore: discarded_futures
          _stopRecording();
        }
      });

      setState(() => _mode = _AudioMode.recording);
    } catch (e, st) {
      appLogger.w('InputAudio start failed', error: e, stackTrace: st);
      widget.onAlert?.call('تعذر بدء التسجيل. حاول مرة أخرى.');
      setState(() => _mode = _AudioMode.idle);
    }
  }

  // ── Stop recording ────────────────────────────────────────────────────────
  Future<void> _stopRecording() async {
    _ticker?.cancel();
    _ticker = null;

    try {
      final String? path = await _recorder.stop();
      if (path == null) {
        widget.onAlert?.call('تعذر حفظ التسجيل.');
        setState(() => _mode = _AudioMode.idle);
        return;
      }
      final File file = File(path);
      if (!file.existsSync()) {
        widget.onAlert?.call('لم يتم إنشاء ملف التسجيل.');
        setState(() => _mode = _AudioMode.idle);
        return;
      }

      _finalDuration = _elapsed;
      _recordedFile = file;
      widget.onChanged(file);
      setState(() => _mode = _AudioMode.recorded);
    } catch (e, st) {
      appLogger.w('InputAudio stop failed', error: e, stackTrace: st);
      widget.onAlert?.call('حدث خطأ أثناء إيقاف التسجيل.');
      setState(() => _mode = _AudioMode.idle);
    }
  }

  // ── Re-record (discard current) ───────────────────────────────────────────
  Future<void> _reRecord() async {
    if (widget.disabled) return;
    final File? old = _recordedFile;
    _recordedFile = null;
    _elapsed = Duration.zero;
    _finalDuration = Duration.zero;
    widget.onChanged(null);
    setState(() => _mode = _AudioMode.idle);
    // Best-effort cleanup of the old temp file.
    if (old != null && old.existsSync()) {
      try {
        await old.delete();
      } catch (_) {/* swallow */}
    }
  }

  // ── Submit captured recording ─────────────────────────────────────────────
  void _submit() {
    if (_recordedFile == null || widget.disabled) return;
    widget.onSubmit(_recordedFile!);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  @override
  Widget build(BuildContext context) {
    switch (_mode) {
      case _AudioMode.idle:
        return _buildIdle();
      case _AudioMode.recording:
        return _buildRecording();
      case _AudioMode.recorded:
        return _buildRecorded();
    }
  }

  // ── IDLE state ────────────────────────────────────────────────────────────
  Widget _buildIdle() {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final int maxMin = (widget.maxDurationSec / 60).floor();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
      constraints: const BoxConstraints(minHeight: 220),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          // ── Big red mic button ──
          _RecordButton(
            icon: LucideIcons.mic,
            disabled: widget.disabled,
            onTap: _startRecording,
            tooltip: 'ابدأ التسجيل',
          ),
          const SizedBox(height: 14),
          Text(
            'اضغط على الميكروفون للبدء بالتسجيل',
            style: TextStyle(
              color: scheme.primary,
              fontSize: 14,
              fontWeight: FontWeight.w600,
              fontFamily: 'Cairo',
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            'صف حالتك بصوتك — الحد الأقصى $maxMin دقيقتان',
            style: TextStyle(
              color: scheme.onSurfaceVariant,
              fontSize: 12,
              height: 1.5,
              fontFamily: 'Cairo',
            ),
            textAlign: TextAlign.center,
          ),
          if (_permissionError != null) ...<Widget>[
            const SizedBox(height: 12),
            _ErrorBanner(message: _permissionError!),
          ],
        ],
      ),
    );
  }

  // ── RECORDING state ───────────────────────────────────────────────────────
  Widget _buildRecording() {
    final int remaining = widget.maxDurationSec - _elapsed.inSeconds;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
      constraints: const BoxConstraints(minHeight: 220),
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.04),
        borderRadius: AppRadii.radiusLg,
        border: Border.all(
          color: AppColors.error.withValues(alpha: 0.25),
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          // ── Stop button surrounded by pulsing ring ──
          _PulsingStopButton(
            disabled: widget.disabled,
            onTap: _stopRecording,
          ),
          const SizedBox(height: 16),
          // ── MM:SS timer ──
          Text(
            _formatMmSs(_elapsed),
            style: const TextStyle(
              color: AppColors.error,
              fontSize: 28,
              fontWeight: FontWeight.w700,
              fontFamily: 'Inter',
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'جارٍ التسجيل… اضغط للإيقاف',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              fontFamily: 'Cairo',
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            'يتبقى حتى الحد الأقصى: $remaining ثانية',
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontSize: 12,
              fontFamily: 'Cairo',
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  // ── RECORDED state ────────────────────────────────────────────────────────
  Widget _buildRecorded() {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final int sizeBytes = _recordedFile?.lengthSync() ?? 0;
    final String durationLabel = _formatMmSs(_finalDuration);
    final String sizeLabel = _formatBytes(sizeBytes);

    return Container(
      padding: const EdgeInsets.all(16),
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
              Icon(LucideIcons.audioLines, size: 18, color: scheme.primary),
              const SizedBox(width: 8),
              Text(
                'تم التسجيل بنجاح',
                style: TextStyle(
                  color: scheme.primary,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  fontFamily: 'Cairo',
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'المدة: $durationLabel · الحجم: $sizeLabel · WAV 16 كيلوهرتز',
            style: TextStyle(
              color: scheme.onSurfaceVariant,
              fontSize: 12,
              fontFamily: 'Inter',
            ),
            textDirection: TextDirection.ltr,
          ),
          const SizedBox(height: 14),
          Row(
            children: <Widget>[
              // Re-record (ghost / outline)
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(LucideIcons.rotateCcw, size: 16),
                  label: const Text('إعادة التسجيل'),
                  onPressed: widget.disabled ? null : _reRecord,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: scheme.onSurface,
                    side: BorderSide(color: scheme.outline),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              // Analyze (primary)
              Expanded(
                child: ElevatedButton.icon(
                  icon: const Icon(LucideIcons.send, size: 16),
                  label: const Text('تحليل'),
                  onPressed:
                      (widget.disabled || _recordedFile == null) ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.action,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
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

// ════════════════════════════════════════════════════════════════════════════
// Sub-widgets
// ════════════════════════════════════════════════════════════════════════════

class _RecordButton extends StatelessWidget {
  const _RecordButton({
    required this.icon,
    required this.disabled,
    required this.onTap,
    required this.tooltip,
  });

  final IconData icon;
  final bool disabled;
  final VoidCallback onTap;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: AppColors.error,
        shape: const CircleBorder(),
        elevation: disabled ? 0 : 6,
        shadowColor: AppColors.error.withValues(alpha: 0.4),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: disabled ? null : onTap,
          child: SizedBox(
            width: 72,
            height: 72,
            child: Icon(
              icon,
              size: 32,
              color: disabled ? Colors.white70 : Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}

/// Pulsing stop button: a square red button with two concentric expanding
/// rings driven by a single AnimationController.
class _PulsingStopButton extends StatefulWidget {
  const _PulsingStopButton({
    required this.disabled,
    required this.onTap,
  });

  final bool disabled;
  final VoidCallback onTap;

  @override
  State<_PulsingStopButton> createState() => _PulsingStopButtonState();
}

class _PulsingStopButtonState extends State<_PulsingStopButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 130,
      height: 130,
      child: Stack(
        alignment: Alignment.center,
        children: <Widget>[
          // ── Two pulsing rings (ring + delayed ring) ──
          AnimatedBuilder(
            animation: _ctrl,
            builder: (BuildContext context, Widget? _) {
              return Stack(
                alignment: Alignment.center,
                children: <Widget>[
                  _ring(_ctrl.value),
                  _ring((_ctrl.value + 0.5) % 1.0),
                ],
              );
            },
          ),
          // ── Central stop button ──
          Material(
            color: AppColors.error,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: widget.disabled ? null : widget.onTap,
              child: const SizedBox(
                width: 72,
                height: 72,
                child: Icon(
                  LucideIcons.square,
                  size: 28,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _ring(double t) {
    // t ∈ [0, 1]: scale grows 0.85 → 1.65, opacity fades 0.55 → 0
    final double scale = 0.85 + (t * 0.8);
    final double opacity = (1.0 - t) * 0.55;
    return IgnorePointer(
      child: Transform.scale(
        scale: scale,
        child: Container(
          width: 112,
          height: 112,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
              color: AppColors.error.withValues(alpha: opacity),
              width: 2,
            ),
          ),
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFFFEBEE),
        borderRadius: AppRadii.radiusMd,
        border: Border.all(color: const Color(0xFFFFCDD2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Icon(
            LucideIcons.circleAlert,
            size: 16,
            color: AppColors.error,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: AppColors.error,
                fontSize: 12,
                height: 1.5,
                fontFamily: 'Cairo',
              ),
            ),
          ),
        ],
      ),
    );
  }
}