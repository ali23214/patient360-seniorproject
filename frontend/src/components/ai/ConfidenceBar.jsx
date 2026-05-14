/**
 * ConfidenceBar
 *
 * Horizontal progress bar visualizing an AI confidence score. The fill
 * animates from empty to the target percentage on mount (CSS keyframe
 * using transform: scaleX, honoring prefers-reduced-motion). The
 * percentage text is centered over the bar for quick scanning.
 *
 * Color thresholds (driven by a className modifier; actual color
 * tokens live in CSS):
 *   - confidence >= 0.8  → var(--tm-success)  (high)
 *   - 0.5 <= c < 0.8     → var(--tm-action)   (moderate)
 *   - c < 0.5            → var(--tm-warning)  (low)
 *
 * See InputModeToggle.jsx for the AI-atom styling convention.
 *
 * Accessibility:
 *   - role="progressbar" with aria-valuenow / aria-valuemin / aria-valuemax
 *   - aria-label combines "الثقة" + the percentage so AT announces
 *     the metric in full context
 *   - Decorative visible label and percentage spans are aria-hidden to
 *     avoid redundant SR announcements
 *
 * @param {object} props
 * @param {number} props.confidence - 0..1 (clamped defensively)
 */

import React from 'react';

function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function confidenceModifier(c) {
  if (c >= 0.8) return 'is-high';
  if (c >= 0.5) return 'is-moderate';
  return 'is-low';
}

export default function ConfidenceBar({ confidence }) {
  const value = clamp01(confidence);
  const percentage = (value * 100).toFixed(1);
  const modifier = confidenceModifier(value);

  return (
    <div
      className={`pd-ai-confidence-bar ${modifier}`}
      role="progressbar"
      aria-valuenow={Number(percentage)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`الثقة: ${percentage}%`}
    >
      <div className="pd-ai-confidence-bar-label" aria-hidden="true">
        <span>الثقة</span>
      </div>
      <div className="pd-ai-confidence-bar-track">
        <div
          className="pd-ai-confidence-bar-fill"
          style={{ width: `${percentage}%` }}
        />
        <span className="pd-ai-confidence-bar-percentage" aria-hidden="true">
          {percentage}%
        </span>
      </div>
    </div>
  );
}
