import React from 'react';
import './DeveloperBranding.css';

export const DeveloperBranding = ({ className = '' }) => {
  return (
    <footer
      className={`developer-branding-footer ${className}`}
      data-testid="developer-branding"
      aria-label="Developer credits"
    >
      <div className="developer-branding-content">
        <div className="developer-credit-text">
          <span className="developed-by-label">Developed by</span>
          <span className="developer-name">Kyaw Moe Naing</span>
        </div>
        <div
          className="developer-logo-wrapper"
          data-testid="developer-logo"
          title="Kyaw Moe Naing Monogram"
          aria-hidden="true"
        >
          <svg
            className="km-monogram-svg"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Red circular background with subtle shadow */}
            <circle cx="50" cy="50" r="48" fill="#dc2626" />
            <circle cx="50" cy="50" r="44" stroke="#ffffff" strokeWidth="2.5" strokeOpacity="0.25" />

            {/* Clean, modern KM monogram typography in white */}
            <text
              x="50"
              y="60"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="38"
              fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
              fontWeight="800"
              letterSpacing="-1"
            >
              KM
            </text>
          </svg>
        </div>
      </div>
    </footer>
  );
};

export default DeveloperBranding;
