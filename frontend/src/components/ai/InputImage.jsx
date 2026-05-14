/**
 * InputImage
 *
 * Image file input with drag-and-drop, preview, and client-side MIME +
 * size validation. Intended for AI analysis workflows where the user
 * uploads a wound, eye, or ECG photo.
 *
 * Uncontrolled: the component owns file + preview state and emits the
 * File via onChange on selection/removal. Parents don't deal with data
 * URLs.
 *
 * Errors flow through the parent-provided openAlert callback so they
 * render in the dashboard's modal system. If openAlert is omitted, we
 * fall back to console.error (dev safety net; shouldn't ship).
 *
 * See InputModeToggle.jsx for the AI-atom styling convention.
 *
 * Accessibility:
 *   - Drop zone is role="button" with a stable Arabic aria-label so
 *     keyboard users can trigger the native picker with Enter/Space
 *   - Visible focus ring via CSS
 *   - Preview image uses the file name as its alt text (falls back to
 *     "معاينة الصورة" if unnamed)
 *   - Remove button has Arabic aria-label + title
 *
 * @param {object} props
 * @param {(file: File|null) => void} props.onChange - fired on select/remove
 * @param {(file: File) => void} props.onSubmit - fired when submit clicked
 * @param {number} [props.maxSizeMB=10]
 * @param {boolean} [props.disabled=false]
 * @param {(variant: 'error'|'warning'|'info'|'success', title: string, message: string) => void} [props.openAlert]
 *   Dashboard modal trigger. Falls back to console.error if omitted.
 */

import React, { useRef, useState } from 'react';
import { Upload, Send, X, Image as ImageIcon } from 'lucide-react';

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png'];

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} م.ب`;
}

export default function InputImage({
  onChange,
  onSubmit,
  maxSizeMB = 10,
  disabled = false,
  openAlert,
}) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const reportError = (title, message) => {
    if (typeof openAlert === 'function') {
      openAlert('error', title, message);
    } else {
      // eslint-disable-next-line no-console
      console.error(`[InputImage] ${title}: ${message}`);
    }
  };

  const validateAndLoad = (candidate) => {
    if (!candidate) return;

    if (!ACCEPTED_MIME_TYPES.includes(candidate.type)) {
      reportError(`نوع ملف غير مدعوم`, `يرجى رفع صورة بصيغة JPEG أو PNG فقط.`);
      return;
    }

    if (candidate.size > maxSizeBytes) {
      reportError(`الملف كبير جداً`, `حجم الملف يجب ألا يتجاوز ${maxSizeMB} م.ب.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      // Success: set both state atomically and emit to parent.
      setPreview(reader.result);
      setFile(candidate);
      onChange(candidate);
    };
    reader.onerror = () => {
      reportError(`تعذر قراءة الملف`, `حدث خطأ أثناء قراءة الصورة. حاول مرة أخرى.`);
    };
    reader.readAsDataURL(candidate);
  };

  const handleFileInputChange = (event) => {
    const selected = event.target.files?.[0];
    validateAndLoad(selected);
    // Reset so selecting the same file again re-fires change
    event.target.value = '';
  };

  const handleRemove = () => {
    if (disabled) return;
    setFile(null);
    setPreview(null);
    onChange(null);
  };

  const handleSubmit = () => {
    if (!file || disabled) return;
    onSubmit(file);
  };

  const openFilePicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleDropZoneKeyDown = (event) => {
    if (disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFilePicker();
    }
  };

  // ── Drag and drop handlers ───────────────────────────────────────────
  const handleDragEnter = (event) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragOver = (event) => {
    if (disabled) return;
    // preventDefault is required for onDrop to fire
    event.preventDefault();
    event.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
    if (disabled) return;

    const dropped = event.dataTransfer?.files?.[0];
    validateAndLoad(dropped);
  };

  const dropZoneClass = [
    'pd-ai-input-image-dropzone',
    isDraggingOver && 'is-dragging-over',
    disabled && 'is-disabled',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="pd-ai-input-image" dir="rtl">
      {/* Hidden native file input. Styling in CSS (visually hidden, but
          focusable only via the drop zone to keep one Tab stop). */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={handleFileInputChange}
        disabled={disabled}
        className="pd-ai-input-image-native-input"
        aria-hidden="true"
        tabIndex={-1}
      />

      {!preview && (
        <div
          className={dropZoneClass}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="اختر صورة أو اسحبها إلى هنا"
          aria-disabled={disabled}
          onClick={openFilePicker}
          onKeyDown={handleDropZoneKeyDown}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload
            className="pd-ai-input-image-dropzone-icon"
            size={40}
            aria-hidden="true"
          />
          <p className="pd-ai-input-image-dropzone-title">
            اسحب الصورة إلى هنا أو انقر للاختيار
          </p>
          <p className="pd-ai-input-image-dropzone-hint">
            JPEG أو PNG — الحد الأقصى {maxSizeMB} م.ب
          </p>
        </div>
      )}

      {preview && (
        <div className="pd-ai-input-image-preview">
          <img
            src={preview}
            alt={file?.name || 'معاينة الصورة'}
            className="pd-ai-input-image-preview-img"
          />

          <div className="pd-ai-input-image-preview-meta">
            <ImageIcon
              className="pd-ai-input-image-preview-icon"
              size={18}
              aria-hidden="true"
            />
            <div className="pd-ai-input-image-preview-info">
              <span
                className="pd-ai-input-image-preview-name"
                dir="auto"
                title={file?.name}
              >
                {file?.name}
              </span>
              <span className="pd-ai-input-image-preview-size">
                {file ? formatFileSize(file.size) : ''}
              </span>
            </div>
            <button
              type="button"
              className="pd-ai-input-image-preview-remove"
              onClick={handleRemove}
              disabled={disabled}
              aria-label="إزالة الصورة"
              title="إزالة الصورة"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="pd-ai-input-image-footer">
            <button
              type="button"
              className="pd-ai-input-image-submit"
              onClick={handleSubmit}
              disabled={disabled}
              aria-label="إرسال الصورة للتحليل"
            >
              <Send size={16} aria-hidden="true" />
              <span>تحليل الصورة</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
