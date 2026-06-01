/**
 * FirstAidSteps
 *
 * Numbered list of first-aid instructions. Each step renders as a card
 * with a filled numbered badge and the instruction text. Steps animate
 * in with a 100ms stagger on mount; CSS honors prefers-reduced-motion
 * and drops the animation entirely for users who opt out.
 *
 * Semantically an <ol> so screen readers announce step numbers
 * automatically. The visual numbered badge is aria-hidden (decorative)
 * to avoid redundancy with the <li> count.
 *
 * On the "filled numbered badge": we render a CSS-styled circle with
 * the index+1 as text, rather than layering a Lucide Circle icon + an
 * absolutely-positioned number. CSS is simpler, always renders at the
 * same size as the text, and scales with the user's font-size settings.
 *
 * See InputModeToggle.jsx for the AI-atom styling convention.
 *
 * @param {object} props
 * @param {string[]} props.steps - Arabic instructions, one per step
 */

import React from 'react';

export default function FirstAidSteps({ steps }) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return null;
  }

  return (
    <ol className="pd-ai-first-aid-steps" aria-label="خطوات الإسعاف الأولي">
      {steps.map((step, idx) => (
        <li
          key={idx}
          className="pd-ai-first-aid-step"
          style={{ '--step-index': idx }}
        >
          <span className="pd-ai-first-aid-step-number" aria-hidden="true">
            {idx + 1}
          </span>
          <p className="pd-ai-first-aid-step-text" dir="auto">
            {step}
          </p>
        </li>
      ))}
    </ol>
  );
}
