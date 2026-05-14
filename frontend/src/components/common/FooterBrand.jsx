/**
 * ═══════════════════════════════════════════════════════════════════
 *  Patient 360° — FooterBrand
 *  ───────────────────────────────────────────────────────────────────
 *  Reusable animated heart-pulse logo for use in all page footers.
 *
 *  Visual: Animated pulse line drawing left-to-right, moving dot
 *          following the line, and "PATIENT 360°" wordmark with a
 *          flashing degree symbol.
 *
 *  Usage:
 *    import FooterBrand from '../components/common/FooterBrand';
 *    <FooterBrand />
 *
 *  Sizing: Pass `size="sm" | "md" | "lg"` to control scale (default md).
 * ═══════════════════════════════════════════════════════════════════
 */

import React from 'react';
import '../../styles/FooterBrand.css';

const FooterBrand = ({ size = 'md', className = '' }) => {
  return (
    <div className={`p360-footer-brand p360-footer-brand--${size} ${className}`}>
      <div className="p360-footer-brand__pulse">
        <svg
          className="p360-footer-brand__svg"
          viewBox="0 0 50 25"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="p360FooterPulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#a23f97" stopOpacity="0.6" />
              <stop offset="50%"  stopColor="#ff4444" stopOpacity="1" />
              <stop offset="100%" stopColor="#a23f97" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          <path
            className="p360-footer-brand__line"
            d="M2,12.5 Q6,12.5 8,8 T12,12.5 T16,8 T20,12.5 T24,8 T28,12.5 T32,8 T36,12.5 T40,8 T44,12.5 L48,12.5"
            fill="none"
            stroke="url(#p360FooterPulseGrad)"
            strokeWidth="2"
          />
          <circle
            className="p360-footer-brand__dot"
            cx="2"
            cy="12.5"
            r="2"
            fill="#ff4444"
          />
        </svg>
      </div>

      <span className="p360-footer-brand__text">
        PATIENT 360<span className="p360-footer-brand__degree">°</span>
      </span>
    </div>
  );
};

export default FooterBrand;