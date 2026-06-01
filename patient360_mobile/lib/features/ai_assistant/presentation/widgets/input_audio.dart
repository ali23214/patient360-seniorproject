// ============================================================================
// InputAudio - Patient 360 (mobile)
// ----------------------------------------------------------------------------
// Mirrors the web atom InputAudio.jsx. WhatsApp-style live mic recorder
// for the Emergency Triage AI feature. Records to WAV @ 16 kHz mono so
// Redwan's FastAPI Whisper service can consume it without resampling.
//
// Three states:
//   - idle      : large red Mic button (72x72), Arabic CTA
//   - recording : pulsing red stop button + MM:SS timer + remaining
//   - recorded  : file metadata + audio playback bar + re-record + analyze
//
// NEW (this rev):
//   - The "recorded" state now embeds a playback bar so the patient can
//     listen to their recording before submitting for AI analysis. The
//     web side ships an HTML5 <audio controls>; we replicate the same
//     UX with a custom Flutter widget driven by the audioplayers package.
//
// Permissions:
//   - Android: RECORD_AUDIO (declared in AndroidManifest.xml)
//   - iOS    : NSMicrophoneUsageDescription (declared in Info.plist)
// ============================================================================

import 'dart:async';
import 'dart:io';

import 'package:audioplayers/audioplayers.dart';
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
  /// when the patient hits "Re-record" / unmounts.
  final ValueChanged<File?> onChanged;

  /// Fired when the patient hits "Analyze" with a captured recording.
  final ValueChanged<File> onSubmit;

  /// When true, all controls are inert.
  final bool disabled;

  /// Hard cap in seconds. Recording auto-stops cleanly when reached.
  final int maxDurationSec;

  /// Optional snackbar/toast hook for error messages.
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

  // -- Format helpers --------------------------------------------------------
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

  // -- Start recording -------------------------------------------------------
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

      // 16 kHz mono PCM WAV matches Redwan's FastAPI input shape exactly.
      //
      // ─── Audio filter flags (CRITICAL for Android emulator path) ────────
      // The `record` package defaults all three to FALSE. On real hardware
      // this is fine, but on the Android emulator the host PC microphone
      // signal arrives via the QEMU audio HAL with low gain, ambient
      // noise, and routing-induced echo — Whisper transcription then
      // hallucinates ("اشتركوا في القناة" pattern, observed 2026-05-16
      // AND 2026-05-29) and AraBERT classifies the bogus text as
      // out_of_scope. Enabling these filters is the Flutter Sound cookbook
      // recommendation for any speech-to-text pipeline.
      //   autoGain      — normalises capture volume to a usable range
      //   echoCancel    — removes echo introduced by the emulator audio
      //                   routing layer
      //   noiseSuppress — strips the steady background hiss from the
      //                   host PC microphone
      // All three are no-ops or near-no-ops on real Android devices, so
      // shipping them does not hurt production builds.
      const RecordConfig config = RecordConfig(
        encoder: AudioEncoder.wav,
        sampleRate: 16000,
        numChannels: 1,
        autoGain: true,
        echoCancel: true,
        noiseSuppress: true,
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

  // -- Stop recording --------------------------------------------------------
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

  // -- Re-record (discard current) -------------------------------------------
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
      } catch (_) {
        /* swallow */
      }
    }
  }

  // -- Submit captured recording ---------------------------------------------
  void _submit() {
    if (_recordedFile == null || widget.disabled) return;
    widget.onSubmit(_recordedFile!);
  }

  // ============================================================================
  // RENDER
  // ============================================================================
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

  // -- IDLE state ------------------------------------------------------------
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
            'صف حالتك بصوتك - الحد الأقصى $maxMin دقيقتان',
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

  // -- RECORDING state -------------------------------------------------------
  Widget _buildRecording() {
    final int remaining = widget.maxDurationSec - _elapsed.inSeconds;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
      constraints: const BoxConstraints(minHeight: 220),
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.04),
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: AppColors.error.withValues(alpha: 0.25)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          _PulsingStopButton(disabled: widget.disabled, onTap: _stopRecording),
          const SizedBox(height: 16),
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
            'جارٍ التسجيل... اضغط للإيقاف',
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

  // -- RECORDED state (with playback bar) ------------------------------------
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
          // -- Header: icon + success label --
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
          // -- Metadata (duration | size | format) --
          Text(
            'المدة: $durationLabel · الحجم: $sizeLabel · WAV 16 كيلوهرتز',
            style: TextStyle(
              color: scheme.onSurfaceVariant,
              fontSize: 12,
              fontFamily: 'Inter',
            ),
            textDirection: TextDirection.ltr,
          ),
          const SizedBox(height: 12),
          // -- NEW: Audio playback bar --
          // Lets the patient listen to their recording before submitting.
          // Mirrors the web side's HTML5 <audio controls> element.
          if (_recordedFile != null)
            _AudioPlaybackBar(
              file: _recordedFile!,
              fallbackDuration: _finalDuration,
            ),
          const SizedBox(height: 14),
          // -- Action buttons row --
          Row(
            children: <Widget>[
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
              Expanded(
                child: ElevatedButton.icon(
                  icon: const Icon(LucideIcons.send, size: 16),
                  label: const Text('تحليل'),
                  onPressed: (widget.disabled || _recordedFile == null)
                      ? null
                      : _submit,
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

// ============================================================================
// Sub-widgets
// ============================================================================

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
  const _PulsingStopButton({required this.disabled, required this.onTap});

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
          Material(
            color: AppColors.error,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: widget.disabled ? null : widget.onTap,
              child: const SizedBox(
                width: 72,
                height: 72,
                child: Icon(LucideIcons.square, size: 28, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _ring(double t) {
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
          const Icon(LucideIcons.circleAlert, size: 16, color: AppColors.error),
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

// ============================================================================
// _AudioPlaybackBar - NEW
// ----------------------------------------------------------------------------
// Compact audio player bar shown inside the "recorded" state. Provides:
//   - Play/Pause toggle button
//   - Draggable seek slider with progress
//   - "MM:SS / MM:SS" time readout
//
// Always rendered LTR (audio players are universally read left-to-right
// regardless of UI language).
// ============================================================================
class _AudioPlaybackBar extends StatefulWidget {
  const _AudioPlaybackBar({required this.file, required this.fallbackDuration});

  final File file;

  /// Duration as measured during recording. Used as a fallback display
  /// value until the audio player reports the true duration (which can
  /// take a frame or two for short WAV files).
  final Duration fallbackDuration;

  @override
  State<_AudioPlaybackBar> createState() => _AudioPlaybackBarState();
}

class _AudioPlaybackBarState extends State<_AudioPlaybackBar> {
  final AudioPlayer _player = AudioPlayer();

  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  bool _isPlaying = false;
  bool _ready = false;

  StreamSubscription<Duration>? _posSub;
  StreamSubscription<Duration>? _durSub;
  StreamSubscription<void>? _completeSub;
  StreamSubscription<PlayerState>? _stateSub;

  @override
  void initState() {
    super.initState();
    _duration = widget.fallbackDuration;
    _init();
  }

  Future<void> _init() async {
    try {
      // Source the local recorded WAV file directly.
      await _player.setSourceDeviceFile(widget.file.path);

      // Some platforms report duration synchronously, some only via stream.
      // Try a one-shot read first; the stream listener below covers the rest.
      try {
        final Duration? d = await _player.getDuration();
        if (mounted && d != null && d > Duration.zero) {
          setState(() => _duration = d);
        }
      } catch (_) {
        /* ignore, stream will provide it */
      }

      _durSub = _player.onDurationChanged.listen((Duration d) {
        if (!mounted) return;
        if (d > Duration.zero) setState(() => _duration = d);
      });

      _posSub = _player.onPositionChanged.listen((Duration p) {
        if (!mounted) return;
        setState(() => _position = p);
      });

      _completeSub = _player.onPlayerComplete.listen((_) {
        if (!mounted) return;
        setState(() {
          _isPlaying = false;
          _position = Duration.zero;
        });
      });

      _stateSub = _player.onPlayerStateChanged.listen((PlayerState s) {
        if (!mounted) return;
        setState(() => _isPlaying = s == PlayerState.playing);
      });

      if (mounted) setState(() => _ready = true);
    } catch (e, st) {
      appLogger.w('AudioPlaybackBar init failed', error: e, stackTrace: st);
      if (mounted) setState(() => _ready = false);
    }
  }

  @override
  void dispose() {
    _posSub?.cancel();
    _durSub?.cancel();
    _completeSub?.cancel();
    _stateSub?.cancel();
    _player.dispose();
    super.dispose();
  }

  Future<void> _togglePlay() async {
    if (!_ready) return;
    try {
      if (_isPlaying) {
        await _player.pause();
        return;
      }

      // If the playback finished (position at end OR reset to 0 after
      // onPlayerComplete), `resume()` is a no-op because the underlying
      // engine is in the "completed" state. We need to re-play from the
      // start by re-feeding the source — `seek(zero) + resume()` alone
      // is not reliable across all audioplayers platform backends.
      final bool atOrPastEnd =
          _duration.inMilliseconds > 0 &&
          _position.inMilliseconds >= _duration.inMilliseconds - 50;
      final bool atStart = _position.inMilliseconds < 50;

      if (atOrPastEnd || atStart) {
        // Restart from the beginning. `play()` is the safest way to
        // reset the engine state in audioplayers when the source has
        // already been consumed.
        await _player.play(DeviceFileSource(widget.file.path));
      } else {
        await _player.resume();
      }
    } catch (e, st) {
      appLogger.w('AudioPlaybackBar toggle failed', error: e, stackTrace: st);
    }
  }

  Future<void> _seek(double seconds) async {
    if (!_ready) return;
    try {
      await _player.seek(Duration(milliseconds: (seconds * 1000).round()));
    } catch (_) {
      /* swallow */
    }
  }

  String _fmt(Duration d) {
    final int m = d.inMinutes;
    final int s = d.inSeconds.remainder(60);
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    // Slider math: cap position into [0, duration]. Guard against
    // duration == 0 (would crash Slider with NaN).
    final double maxSec = _duration.inMilliseconds > 0
        ? _duration.inMilliseconds / 1000.0
        : 1.0;
    final double posSec = (_position.inMilliseconds / 1000.0).clamp(
      0.0,
      maxSec,
    );

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: AppRadii.radiusMd,
        border: Border.all(color: scheme.outline.withValues(alpha: 0.6)),
      ),
      // Audio players are universally LTR.
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Row(
          children: <Widget>[
            // -- Play / Pause button --
            Material(
              color: Colors.transparent,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: _ready ? _togglePlay : null,
                child: SizedBox(
                  width: 40,
                  height: 40,
                  child: Icon(
                    _isPlaying ? LucideIcons.pause : LucideIcons.play,
                    size: 20,
                    color: _ready
                        ? scheme.primary
                        : scheme.onSurfaceVariant.withValues(alpha: 0.4),
                  ),
                ),
              ),
            ),
            // -- Seek slider --
            Expanded(
              child: SliderTheme(
                data: SliderTheme.of(context).copyWith(
                  trackHeight: 3,
                  thumbShape: const RoundSliderThumbShape(
                    enabledThumbRadius: 6,
                  ),
                  overlayShape: const RoundSliderOverlayShape(
                    overlayRadius: 12,
                  ),
                  activeTrackColor: scheme.primary,
                  inactiveTrackColor: scheme.outline.withValues(alpha: 0.3),
                  thumbColor: scheme.primary,
                  overlayColor: scheme.primary.withValues(alpha: 0.12),
                ),
                child: Slider(
                  value: posSec,
                  min: 0,
                  max: maxSec,
                  onChanged: _ready ? _seek : null,
                ),
              ),
            ),
            // -- MM:SS / MM:SS readout --
            Padding(
              padding: const EdgeInsets.only(left: 6, right: 10),
              child: Text(
                '${_fmt(_position)} / ${_fmt(_duration)}',
                style: TextStyle(
                  color: scheme.onSurfaceVariant,
                  fontSize: 12,
                  fontFamily: 'Inter',
                  fontFeatures: const <FontFeature>[
                    FontFeature.tabularFigures(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
