/**
 * EmptyState
 *
 * Generic empty-state illustration: a centered Lucide icon (64px,
 * muted color) above a title and optional subtitle, with an optional
 * CTA button at the bottom.
 *
 * Not AI-specific despite living under components/ai/ — designed to be
 * reused across the whole PatientDashboard for any "no data yet"
 * scenario (empty appointments, no prescriptions, zero notifications,
 * no AI history, etc.).
 *
 * See InputModeToggle.jsx for the AI-atom styling convention.
 *
 * Accessibility:
 *   - Container is role="status" so AT announces the empty state when
 *     it mounts (useful if a list just finished loading and turned out
 *     to be empty)
 *   - Icon is aria-hidden (decorative — the title carries the meaning)
 *   - Title is an <h3> so SR users can jump to it via heading
 *     navigation; parents should have an <h1>/<h2> in their ancestor
 *     chain for a correct outline
 *
 * @param {object} props
 * @param {React.ComponentType} [props.icon] - Lucide icon component
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {{ label: string, onClick: () => void }} [props.cta]
 */

import React from 'react';

export default function EmptyState({ icon: Icon, title, subtitle, cta }) {
  return (
    <div className="pd-ai-empty-state" role="status">
      {Icon && (
        <Icon
          className="pd-ai-empty-state-icon"
          size={64}
          aria-hidden="true"
        />
      )}
      <h3 className="pd-ai-empty-state-title" dir="auto">
        {title}
      </h3>
      {subtitle && (
        <p className="pd-ai-empty-state-subtitle" dir="auto">
          {subtitle}
        </p>
      )}
      {cta && (
        <button
          type="button"
          className="pd-ai-empty-state-cta"
          onClick={cta.onClick}
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
