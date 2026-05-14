/**
 * InputText
 *
 * Multi-line text input for AI analysis. Wrapper is RTL (for label /
 * counter / button layout), but the textarea itself is dir="auto" so
 * Arabic and Latin content both render in their natural direction as
 * the user types.
 *
 * The clear (×) button used to overlap the textarea content because it
 * was layered on top via absolute positioning without any reserved
 * space inside the textarea. Fixed by adding inline padding-inline-start
 * to the textarea whenever the clear button is visible — the X now sits
 * in a reserved 36px gutter that the text never enters. (We pad
 * inline-start, not right, so the gutter is logical-direction-aware:
 * RTL text gets a left gutter where the X is rendered, LTR text gets a
 * right gutter, all without changing layout code.)
 *
 * See InputModeToggle.jsx for the AI-atom styling convention
 * (className-only; all styles live in frontend/src/styles/PatientDashboard.css
 * under the pd-ai-* prefix).
 *
 * Accessibility:
 *   - Textarea has a stable aria-label (doesn't collapse when placeholder shown)
 *   - Character counter is aria-live="polite" for screen-reader updates
 *   - Clear button has Arabic aria-label + title
 *   - Submit button shows as disabled to both sighted users and AT
 *   - Ctrl/Cmd+Enter submits (textarea-idiomatic shortcut)
 *   - Escape clears (does nothing if already empty)
 *
 * Counter has three visual states via className modifiers:
 *   - normal      (default — muted)
 *   - is-warning  (>= 90% of maxLength — tm-warning)
 *   - is-error    (>= maxLength — tm-error; reached via paste since
 *                  maxLength attr caps typing)
 *
 * @param {object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {(trimmedValue: string) => void} props.onSubmit - invoked with value.trim()
 * @param {string} [props.placeholder]
 * @param {boolean} [props.disabled=false]
 * @param {number} [props.maxLength=2000]
 */

import React, { useRef } from 'react';
import { Send, X } from 'lucide-react';

// Width reserved for the clear (×) button + a small breathing gap.
// Must stay in sync with the visual position rules in PatientDashboard.css
// (.pd-ai-input-text-clear sits at inset-inline-start: 8px, ~24px wide).
const CLEAR_BUTTON_GUTTER_PX = 36;

export default function InputText({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false,
  maxLength = 2000,
}) {
  const textareaRef = useRef(null);

  const trimmed = value.trim();
  const canSubmit = !disabled && trimmed.length > 0;

  const charCount = value.length;
  const warningThreshold = Math.floor(maxLength * 0.9);
  const counterState =
    charCount >= maxLength ? 'error' :
    charCount >= warningThreshold ? 'warning' :
    'normal';

  const showClearButton = value.length > 0 && !disabled;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  const handleClear = () => {
    if (disabled) return;
    onChange('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    // Ctrl/Cmd + Enter submits
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      handleSubmit();
      return;
    }
    // Escape clears (only if there's something to clear)
    if (event.key === 'Escape' && value.length > 0) {
      event.preventDefault();
      handleClear();
    }
  };

  const counterClass = [
    'pd-ai-input-text-counter',
    counterState === 'warning' && 'is-warning',
    counterState === 'error' && 'is-error',
  ]
    .filter(Boolean)
    .join(' ');

  // Reserve space for the X gutter inline (logical-direction aware) so the
  // text never flows underneath the button. Falls back gracefully when the
  // X isn't rendered.
  const textareaStyle = showClearButton
    ? { paddingInlineStart: `${CLEAR_BUTTON_GUTTER_PX}px` }
    : undefined;

  return (
    <div className="pd-ai-input-text" dir="rtl">
      <div className="pd-ai-input-text-field">
        <textarea
          ref={textareaRef}
          className="pd-ai-input-text-textarea"
          dir="auto"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          rows={5}
          aria-label="حقل إدخال النص"
          style={textareaStyle}
        />

        {showClearButton && (
          <button
            type="button"
            className="pd-ai-input-text-clear"
            onClick={handleClear}
            aria-label="مسح النص"
            title="مسح النص"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="pd-ai-input-text-footer">
        <span
          className={counterClass}
          aria-live="polite"
          aria-atomic="true"
        >
          {charCount}/{maxLength}
        </span>

        <button
          type="button"
          className="pd-ai-input-text-submit"
          onClick={handleSubmit}
          disabled={!canSubmit}
          aria-label="إرسال للتحليل"
        >
          <Send size={16} aria-hidden="true" />
          <span>تحليل</span>
        </button>
      </div>
    </div>
  );
}