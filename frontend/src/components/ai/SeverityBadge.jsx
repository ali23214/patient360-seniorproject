/**
 * SeverityBadge
 *
 * Pill-shaped badge for AI risk level. Four visual variants driven by
 * the severity prop, each mapped to a Lucide icon + Arabic label + color
 * token (defined in PatientDashboard.css via CSS variables).
 *
 * Critical variant pulses to draw attention. The CSS-side animation is
 * wrapped in a prefers-reduced-motion media query so users who opt out
 * get a solid red badge with no motion.
 *
 * Severity → visual mapping:
 *   - low       → green    (Check)
 *   - moderate  → amber    (AlertCircle)
 *   - high      → orange   (AlertTriangle)
 *   - critical  → red + pulse (AlertOctagon)
 *
 * See InputModeToggle.jsx for the AI-atom styling convention.
 *
 * Accessibility:
 *   - role="status" so AT announces the risk level when the badge
 *     mounts or re-renders after an analysis
 *   - aria-label adds an "مستوى الخطورة:" context prefix so SR users
 *     hear "مستوى الخطورة: حرج" rather than just "حرج" in isolation
 *
 * @param {object} props
 * @param {'low'|'moderate'|'high'|'critical'} props.severity
 */

import React from 'react';
import { Check, AlertCircle, AlertTriangle, AlertOctagon } from 'lucide-react';

const SEVERITY_CONFIG = {
  low:      { icon: Check,         label: 'منخفض', modifier: 'is-low'      },
  moderate: { icon: AlertCircle,   label: 'متوسط', modifier: 'is-moderate' },
  high:     { icon: AlertTriangle, label: 'مرتفع', modifier: 'is-high'     },
  critical: { icon: AlertOctagon,  label: 'حرج',   modifier: 'is-critical' },
};

export default function SeverityBadge({ severity }) {
  // Defensive: unknown severity falls back to 'low'. Safer default than
  // 'critical' — we don't want a bad/missing value to alarm users.
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low;
  const { icon: Icon, label, modifier } = config;

  return (
    <span
      className={`pd-ai-severity-badge ${modifier}`}
      role="status"
      aria-label={`مستوى الخطورة: ${label}`}
    >
      <Icon className="pd-ai-severity-badge-icon" size={16} aria-hidden="true" />
      <span className="pd-ai-severity-badge-label">{label}</span>
    </span>
  );
}
