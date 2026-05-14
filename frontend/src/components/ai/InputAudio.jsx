/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  InputAudio — Patient 360° AI Atom (Mic Recording, API-aligned WAV)
 *  ─────────────────────────────────────────────────────────────────────────
 *  Path: frontend/src/components/ai/InputAudio.jsx
 *
 *  WhatsApp-style live mic recorder for the Emergency Triage AI feature.
 *  The captured audio is encoded as 16-bit PCM WAV at 16 kHz mono — the
 *  exact format produced by the FastAPI service's `record_audio()` helper
 *  (see RadwanSenior/med_predict.py L514-L521). Aligning the recording
 *  format with the API's reference implementation eliminates Whisper's
 *  ffmpeg-based resampling step and removes a class of cross-browser
 *  codec quirks (webm/opus vs mp4/aac vs ogg/opus) from the equation.
 *
 *  Pipeline:
 *    1.  navigator.mediaDevices.getUserMedia() — request the mic with
 *        echo cancellation, noise suppression, mono channel hint
 *    2.  MediaRecorder captures the live stream (webm/opus on Chromium,
 *        mp4/aac on Safari) — we don't ship this directly to the API,
 *        we use it as a portable container
 *    3.  On stop, the captured Blob is fed through AudioContext.decodeAudioData
 *        which produces an AudioBuffer (the browser handles all codec
 *        decoding internally — no ffmpeg.js, no manual decoders)
 *    4.  OfflineAudioContext re-renders the buffer at exactly 16 kHz mono
 *        (the resampler is the same high-quality algorithm browsers use
 *        for <audio> playback rate adjustments — sinc-based, anti-aliased)
 *    5.  Float32 PCM samples are converted to int16 little-endian and
 *        wrapped in a minimal RIFF/WAVE header — the resulting Blob is
 *        a real .wav file that any audio tool (including Whisper) can
 *        consume directly with zero transcoding
 *
 *  Three UI states:
 *    • idle      — large red Mic button, hint text, "اضغط للبدء بالتسجيل"
 *                  call to action. The very first click triggers the
 *                  browser's mic permission prompt.
 *    • recording — pulsing red record-active indicator, live MM:SS timer,
 *                  stop button. Square icon doubles as the visual stop
 *                  affordance familiar from WhatsApp / Telegram.
 *    • recorded  — native <audio> playback of the captured WAV, "تحليل"
 *                  submit button, "إعادة التسجيل" to discard and re-record.
 *                  We also display the file size and exact duration so the
 *                  patient can quickly verify the capture before submitting.
 *
 *  API contract — kept identical to the previous file-upload version so
 *  the parent (PatientDashboard.jsx) does not need to change:
 *
 *    onChange(file | null)  — fired when a recording completes or is removed
 *    onSubmit(file)         — fired when the patient clicks "تحليل"
 *    disabled               — when true, all controls are inert
 *    openAlert(message)     — optional toast / modal callback for errors
 *    maxDurationSec         — hard cap on recording length (default 120s).
 *                             A safety net so a stuck recording does not run
 *                             forever; auto-stops cleanly when reached.
 *
 *  Browser support:
 *    • getUserMedia, MediaRecorder, AudioContext, OfflineAudioContext
 *      are all available in every browser shipping in the last ~5 years.
 *    • We probe for AudioContext / OfflineAudioContext (and fall back to
 *      webkitAudioContext on legacy Safari) on first use.
 *
 *  Accessibility:
 *    • Record / stop button has a clear Arabic aria-label that updates
 *      with state ("ابدأ التسجيل" → "أوقف التسجيل")
 *    • Live timer is wrapped in aria-live="polite" so screen-readers get
 *      gentle updates without interrupting the user
 *    • Recording state announces to assistive tech via role="status"
 *    • All actions reachable via keyboard (Enter / Space activate;
 *      Escape cancels an active recording)
 *    • prefers-reduced-motion respected via existing pd-ai-* CSS rules
 *
 *  Resource hygiene:
 *    • Microphone MediaStream tracks are stopped on stop / re-record / unmount
 *    • Object URLs created for playback are revoked on remove and on unmount
 *    • Timer interval is cleared on every state transition
 *    • AudioContexts are closed after use to release the browser's audio
 *      hardware resource
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Send, RotateCcw, AlertCircle, Loader2 } from 'lucide-react';

// ── API-aligned recording format ────────────────────────────────────────────
// Match RadwanSenior/med_predict.py `record_audio()` exactly so the WAV we
// upload to /predict/voice is byte-identical in shape to what the FastAPI
// service produces internally for its own self-tests.
const TARGET_SAMPLE_RATE = 16000; // Hz — Whisper's native input rate
const TARGET_CHANNELS    = 1;     // mono
const TARGET_BIT_DEPTH   = 16;    // int16 little-endian PCM

// ── MediaRecorder MIME picking ──────────────────────────────────────────────
// We capture into whatever the browser likes best (we'll decode + resample
// ourselves afterwards). webm/opus is preferred because it's compact and
// every modern Chromium / Firefox supports it; Safari needs mp4/aac.
const PREFERRED_CAPTURE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

const DEFAULT_MAX_DURATION_SEC = 120; // 2-minute cap as a safety net
const MIN_RECORDING_BYTES      = 1024; // sub-1KB is almost certainly noise

// ── Helpers ────────────────────────────────────────────────────────────────
const pickCaptureMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mime of PREFERRED_CAPTURE_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch (_) {
      /* some browsers throw on unknown types — treat as unsupported */
    }
  }
  return '';
};

const formatDuration = (totalSeconds) => {
  const safe = Math.max(0, Number.isFinite(totalSeconds) ? totalSeconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

// Resolve AudioContext / OfflineAudioContext, including the legacy webkit
// prefix used by older Safari builds. Returning null lets the caller surface
// a friendly error instead of crashing on `undefined()`.
const resolveAudioContextCtors = () => {
  if (typeof window === 'undefined') return { AudioCtx: null, OfflineCtx: null };
  const AudioCtx   = window.AudioContext   || window.webkitAudioContext   || null;
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext || null;
  return { AudioCtx, OfflineCtx };
};

/**
 * Encode a Float32Array of PCM samples (-1..+1) into a WAV Blob.
 * Single channel, 16-bit little-endian PCM, RIFF/WAVE container.
 *
 * The output is byte-compatible with `scipy.io.wavfile.write(..., int16)`
 * which is exactly what RadwanSenior's `record_audio()` produces.
 */
const encodeWavBlob = (samples, sampleRate) => {
  const bytesPerSample = TARGET_BIT_DEPTH / 8;
  const blockAlign     = TARGET_CHANNELS * bytesPerSample;
  const byteRate       = sampleRate * blockAlign;
  const dataSize       = samples.length * bytesPerSample;
  const fileSize       = 44 + dataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view   = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // ── RIFF / WAVE header (44 bytes total) ───────────────────────────────────
  writeString(0,  'RIFF');
  view.setUint32(4,  fileSize - 8, true);   // file size minus the first 8 bytes
  writeString(8,  'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);             // PCM fmt chunk size
  view.setUint16(20, 1, true);              // audio format = 1 (PCM)
  view.setUint16(22, TARGET_CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, TARGET_BIT_DEPTH, true);

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // ── PCM samples — clamp Float32 to [-1,+1] then scale to int16 ────────────
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    // Asymmetric scaling: positive samples max at +32767, negatives at -32768
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
};

/**
 * Decode an arbitrary audio blob (webm/opus, mp4/aac, ogg, …) into a
 * Float32 PCM AudioBuffer using the browser's native decoder, then
 * resample to 16 kHz mono via OfflineAudioContext, then pack into a
 * WAV Blob suitable for the FastAPI /predict/voice endpoint.
 *
 * Throws if the browser cannot decode or resample the input.
 */
const blobToWavAt16kMono = async (inputBlob) => {
  const { AudioCtx, OfflineCtx } = resolveAudioContextCtors();
  if (!AudioCtx || !OfflineCtx) {
    throw new Error('AUDIO_API_UNSUPPORTED');
  }

  // Step 1: decode the captured container into Float32 PCM
  const arrayBuffer = await inputBlob.arrayBuffer();
  const decodeCtx   = new AudioCtx();
  let decodedBuffer;
  try {
    decodedBuffer = await new Promise((resolve, reject) => {
      // The Promise-based form is cleaner than the legacy callback form,
      // but Safari still requires a fallback path. Try Promise first and
      // fall back to the callback form if the Promise version isn't
      // implemented or rejects with a TypeError.
      try {
        const maybePromise = decodeCtx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(resolve, reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  } finally {
    // Decoder context is no longer needed; release the audio hardware lock.
    if (typeof decodeCtx.close === 'function') {
      try { await decodeCtx.close(); } catch (_) { /* swallow */ }
    }
  }

  if (!decodedBuffer || decodedBuffer.length === 0) {
    throw new Error('AUDIO_DECODE_EMPTY');
  }

  // Step 2: resample to 16 kHz mono via OfflineAudioContext
  // - We always create a 1-channel target context, which mixes any stereo
  //   input down to mono for free (the browser's resampler handles channel
  //   reduction with proper energy preservation).
  // - Length is computed from duration so we don't truncate or pad.
  const targetLength = Math.max(
    1,
    Math.ceil(decodedBuffer.duration * TARGET_SAMPLE_RATE)
  );

  const offlineCtx = new OfflineCtx(
    TARGET_CHANNELS,
    targetLength,
    TARGET_SAMPLE_RATE
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = decodedBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  const monoSamples    = renderedBuffer.getChannelData(0);

  // Step 3: encode WAV
  return encodeWavBlob(monoSamples, TARGET_SAMPLE_RATE);
};

// ── Component ──────────────────────────────────────────────────────────────
const InputAudio = ({
  onChange,
  onSubmit,
  disabled = false,
  openAlert,
  maxDurationSec = DEFAULT_MAX_DURATION_SEC,
}) => {
  // Mode: 'idle' | 'recording' | 'processing' | 'recorded'
  const [mode, setMode]                       = useState('idle');
  const [elapsed, setElapsed]                 = useState(0);
  const [recordedFile, setRecordedFile]       = useState(null);
  const [previewUrl, setPreviewUrl]           = useState(null);
  const [permissionError, setPermissionError] = useState(null);

  // Refs survive re-renders without triggering them
  const mediaRecorderRef  = useRef(null);
  const mediaStreamRef    = useRef(null);
  const recordedChunksRef = useRef([]);
  const startedAtRef      = useRef(0);
  const tickIntervalRef   = useRef(null);
  // Snapshot of the elapsed time at the moment recording stopped — we keep
  // it for the playback meta line so the displayed duration stays exact
  // even after we reset the live timer for the next session.
  const finalDurationRef  = useRef(0);

  // ─── Cleanup — stop tracks, clear timers ─────────────────────────────────
  const cleanupStream = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch (_) { /* swallow */ }
      });
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  // Revoke the playback object URL whenever it changes / on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        try { URL.revokeObjectURL(previewUrl); } catch (_) { /* swallow */ }
      }
    };
  }, [previewUrl]);

  // Full cleanup on unmount as a safety net
  useEffect(() => {
    return () => {
      cleanupStream();
    };
  }, [cleanupStream]);

  // ─── Start recording ─────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (disabled || mode === 'recording' || mode === 'processing') return;
    setPermissionError(null);

    if (typeof navigator === 'undefined'
        || !navigator.mediaDevices
        || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      const msg = 'متصفحك لا يدعم التسجيل الصوتي. يرجى استخدام متصفح حديث.';
      setPermissionError(msg);
      openAlert?.(msg);
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      const msg = 'متصفحك لا يدعم خاصية التسجيل (MediaRecorder).';
      setPermissionError(msg);
      openAlert?.(msg);
      return;
    }

    let stream;
    try {
      // Hint the browser toward our preferred capture format. Browsers may
      // ignore some constraints (notably sampleRate) and pick their own
      // hardware-native rate — that's fine, we resample to 16 kHz ourselves
      // after recording stops.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount:     1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl:  true,
          sampleRate:       TARGET_SAMPLE_RATE, // hint, may be ignored
        },
      });
    } catch (err) {
      // Permission denied, no device, or hardware busy. We treat any failure
      // here as a permission/availability issue and surface a helpful message.
      const msg = err && err.name === 'NotAllowedError'
        ? 'لم يتم منح صلاحية الميكروفون. الرجاء السماح بالوصول من إعدادات المتصفح.'
        : 'تعذر الوصول إلى الميكروفون. تأكد من توصيله وعدم استخدامه من تطبيق آخر.';
      setPermissionError(msg);
      openAlert?.(msg);
      return;
    }

    mediaStreamRef.current = stream;

    let recorder;
    try {
      const mime = pickCaptureMimeType();
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch (err) {
      cleanupStream();
      const msg = 'تعذر بدء التسجيل. حاول مرة أخرى.';
      setPermissionError(msg);
      openAlert?.(msg);
      return;
    }

    recordedChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      // Snapshot duration from the timer before we reset anything.
      const durationSnapshot = (Date.now() - startedAtRef.current) / 1000;
      const captureMime      = recorder.mimeType || pickCaptureMimeType() || 'audio/webm';
      const capturedBlob     = new Blob(recordedChunksRef.current, { type: captureMime });

      // Stop tracks immediately — we no longer need the mic.
      cleanupStream();

      // Reject empty / sub-second recordings — almost certainly accidental.
      if (capturedBlob.size < MIN_RECORDING_BYTES) {
        setMode('idle');
        setElapsed(0);
        finalDurationRef.current = 0;
        openAlert?.('التسجيل قصير جداً. يرجى المحاولة مرة أخرى.');
        return;
      }

      // ── Decode → resample → encode WAV ─────────────────────────────────
      // This is the alignment with RadwanSenior's API — instead of shipping
      // raw webm/opus, we ship a 16 kHz mono int16 WAV which Whisper can
      // consume natively without ffmpeg resampling.
      setMode('processing');

      let wavBlob;
      try {
        wavBlob = await blobToWavAt16kMono(capturedBlob);
      } catch (err) {
        const code = err && err.message;
        const msg = code === 'AUDIO_API_UNSUPPORTED'
          ? 'متصفحك لا يدعم معالجة الصوت المتقدمة. يرجى استخدام متصفح حديث.'
          : 'تعذر تجهيز التسجيل للتحليل. يرجى المحاولة مرة أخرى.';
        setPermissionError(msg);
        openAlert?.(msg);
        setMode('idle');
        setElapsed(0);
        finalDurationRef.current = 0;
        return;
      }

      const filename = `voice_note_${Date.now()}.wav`;
      const file     = new File([wavBlob], filename, { type: 'audio/wav' });
      const url      = URL.createObjectURL(wavBlob);

      finalDurationRef.current = durationSnapshot;
      setRecordedFile(file);
      setPreviewUrl(url);
      setMode('recorded');
      onChange?.(file);
    };

    recorder.onerror = () => {
      cleanupStream();
      setMode('idle');
      setElapsed(0);
      finalDurationRef.current = 0;
      const msg = 'حدث خطأ أثناء التسجيل. يرجى المحاولة مرة أخرى.';
      setPermissionError(msg);
      openAlert?.(msg);
    };

    mediaRecorderRef.current  = recorder;
    startedAtRef.current      = Date.now();
    recordedChunksRef.current = [];

    recorder.start();
    setMode('recording');
    setElapsed(0);

    // Tick four times a second for a smooth timer; auto-stop at ceiling.
    tickIntervalRef.current = setInterval(() => {
      const seconds = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(seconds);
      if (seconds >= maxDurationSec) {
        try {
          if (recorder.state === 'recording') recorder.stop();
        } catch (_) {
          /* swallow — onstop handles cleanup */
        }
      }
    }, 250);
  }, [disabled, mode, maxDurationSec, openAlert, onChange, cleanupStream]);

  // ─── Stop recording ──────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      try { recorder.stop(); }
      catch (_) { /* swallow — onerror handles surfacing */ }
    }
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  // ─── Re-record / discard the current capture ─────────────────────────────
  const handleReRecord = useCallback(() => {
    if (disabled) return;
    if (previewUrl) {
      try { URL.revokeObjectURL(previewUrl); } catch (_) { /* swallow */ }
    }
    setRecordedFile(null);
    setPreviewUrl(null);
    setElapsed(0);
    finalDurationRef.current = 0;
    setMode('idle');
    onChange?.(null);
  }, [disabled, previewUrl, onChange]);

  // ─── Submit captured recording ───────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (!recordedFile || disabled) return;
    onSubmit?.(recordedFile);
  }, [recordedFile, disabled, onSubmit]);

  // ─── Keyboard activation for the main button ─────────────────────────────
  const handleMainButtonKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (mode === 'idle')           startRecording();
    else if (mode === 'recording') stopRecording();
  };

  // Escape cancels an active recording (treated as a re-record afterwards)
  useEffect(() => {
    if (mode !== 'recording') return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') stopRecording();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, stopRecording]);

  // ─── Derived display values ──────────────────────────────────────────────
  const elapsedLabel    = formatDuration(elapsed);
  const remainingSec    = Math.max(0, maxDurationSec - Math.floor(elapsed));
  const finalDuration   = finalDurationRef.current;
  const finalLabel      = formatDuration(finalDuration);
  const recordedSize    = recordedFile ? recordedFile.size : 0;
  const recordedSizeStr = formatBytes(recordedSize);

  // ─── Render: IDLE state ──────────────────────────────────────────────────
  if (mode === 'idle') {
    return (
      <div className="pd-ai-input-audio" dir="rtl">
        <div className="pd-ai-input-audio-stage">
          <button
            type="button"
            className="pd-ai-input-audio-record-btn"
            onClick={startRecording}
            onKeyDown={handleMainButtonKeyDown}
            disabled={disabled}
            aria-label="ابدأ التسجيل"
            title="ابدأ التسجيل"
          >
            <Mic size={32} aria-hidden="true" />
          </button>

          <p className="pd-ai-input-audio-hint">
            اضغط على الميكروفون للبدء بالتسجيل
          </p>
          <p className="pd-ai-input-audio-subhint">
            صف حالتك بصوتك — الحد الأقصى {Math.floor(maxDurationSec / 60)} دقيقتان
          </p>

          {permissionError && (
            <div className="pd-ai-input-audio-error" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{permissionError}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Render: RECORDING state ─────────────────────────────────────────────
  if (mode === 'recording') {
    return (
      <div className="pd-ai-input-audio" dir="rtl">
        <div
          className="pd-ai-input-audio-stage is-recording"
          role="status"
          aria-live="polite"
        >
          <button
            type="button"
            className="pd-ai-input-audio-stop-btn"
            onClick={stopRecording}
            onKeyDown={handleMainButtonKeyDown}
            disabled={disabled}
            aria-label="أوقف التسجيل"
            title="أوقف التسجيل"
          >
            <Square size={32} aria-hidden="true" />
          </button>

          <div className="pd-ai-input-audio-pulse" aria-hidden="true">
            <span className="pd-ai-input-audio-pulse-dot" />
            <span className="pd-ai-input-audio-pulse-ring" />
            <span className="pd-ai-input-audio-pulse-ring is-delayed" />
          </div>

          <p className="pd-ai-input-audio-timer" aria-label={`المدة ${elapsedLabel}`}>
            {elapsedLabel}
          </p>

          <p className="pd-ai-input-audio-recording-label">
            جارٍ التسجيل… اضغط للإيقاف
          </p>
          <p className="pd-ai-input-audio-subhint">
            يتبقى حتى الحد الأقصى: {remainingSec} ثانية
          </p>
        </div>
      </div>
    );
  }

  // ─── Render: PROCESSING state ────────────────────────────────────────────
  // Decoding + resampling normally takes 200-800ms. We surface a friendly
  // indicator so the user understands the brief delay between hitting stop
  // and seeing the playback controls.
  if (mode === 'processing') {
    return (
      <div className="pd-ai-input-audio" dir="rtl">
        <div
          className="pd-ai-input-audio-stage is-processing"
          role="status"
          aria-live="polite"
        >
          <div className="pd-ai-input-audio-processing-spinner" aria-hidden="true">
            <Loader2 size={28} />
          </div>
          <p className="pd-ai-input-audio-recording-label">
            جارٍ تجهيز التسجيل…
          </p>
          <p className="pd-ai-input-audio-subhint">
            يتم تحويل الصوت إلى صيغة 16 كيلوهرتز للتحليل
          </p>
        </div>
      </div>
    );
  }

  // ─── Render: RECORDED state ──────────────────────────────────────────────
  return (
    <div className="pd-ai-input-audio" dir="rtl">
      <div className="pd-ai-input-audio-playback">
        <p className="pd-ai-input-audio-playback-title">
          مراجعة التسجيل
        </p>
        <p className="pd-ai-input-audio-playback-meta">
          المدة: {finalLabel} · الحجم: {recordedSizeStr} · WAV 16 كيلوهرتز
        </p>

        {previewUrl && (
          <audio
            controls
            src={previewUrl}
            className="pd-ai-input-audio-player"
            aria-label="تشغيل التسجيل"
          >
            متصفحك لا يدعم تشغيل الصوت.
          </audio>
        )}

        <div className="pd-ai-input-audio-playback-actions">
          <button
            type="button"
            className="pd-ai-input-audio-rerecord-btn"
            onClick={handleReRecord}
            disabled={disabled}
            aria-label="إعادة التسجيل"
          >
            <RotateCcw size={16} aria-hidden="true" />
            <span>إعادة التسجيل</span>
          </button>

          <button
            type="button"
            className="pd-ai-input-audio-submit-btn"
            onClick={handleSubmit}
            disabled={disabled || !recordedFile}
            aria-label="تحليل التسجيل"
          >
            <Send size={16} aria-hidden="true" />
            <span>تحليل</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default InputAudio;
