import React, { useState, useEffect } from 'react';
import './UserModals.css';

// SVG Icons
const IconLock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconEye = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconEyeOff = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" x2="22" y1="2" y2="22" />
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const ResetPasswordModal = ({
  isOpen,
  onClose,
  user,
  onSubmit,
  isSubmitting,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      setNewPassword('');
      setConfirmPassword('');
      setShowNew(false);
      setShowConfirm(false);
      setErrors({});
    }
  }, [isOpen, user]);

  // Keyboard accessibility: Escape to dismiss
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !user) return null;

  // Password Policy Checks
  const checks = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    number: /\d/.test(newPassword),
    special: /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/`~]/.test(newPassword),
  };

  const strengthScore = Object.values(checks).filter(Boolean).length;
  const getStrengthMeta = () => {
    if (newPassword.length === 0) return { label: '', color: '' };
    if (strengthScore <= 2) return { label: 'Weak', color: '#EF4444', percent: '33%' };
    if (strengthScore <= 4) return { label: 'Moderate', color: '#F59E0B', percent: '66%' };
    return { label: 'Strong', color: '#10B981', percent: '100%' };
  };

  const strengthMeta = getStrengthMeta();

  const validate = () => {
    const errs = {};
    if (!newPassword) {
      errs.newPassword = 'New password is required';
    } else if (strengthScore < 5) {
      errs.newPassword = 'Password does not meet all security criteria';
    }

    if (!confirmPassword) {
      errs.confirmPassword = 'Confirmation password is required';
    } else if (newPassword !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(newPassword, confirmPassword);
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      data-testid="reset-password-modal"
    >
      <div className="modal-container reset-password-modal-container">
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-header-icon-wrap" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
            <IconLock />
          </div>
          <div className="modal-header-text">
            <h2 className="modal-title">Reset User Password</h2>
            <p className="modal-subtitle">
              Reset account credentials for <strong>{user.full_name}</strong> ({user.email})
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} noValidate className="modal-form">
          {/* Target User Info Badge */}
          <div className="target-user-card" style={{ padding: '0.75rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>{user.full_name}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{user.email}</div>
            </div>
            <span className={`badge-role role-${user.role}`} style={{ fontSize: '0.75rem', textTransform: 'uppercase', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
              {user.role}
            </span>
          </div>

          {/* New Password Field */}
          <div className="form-group">
            <label htmlFor="reset-new-password" className="form-label">
              New Password <span className="text-required">*</span>
            </label>
            <div className="password-input-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="reset-new-password"
                type={showNew ? 'text' : 'password'}
                className={`form-input ${errors.newPassword ? 'input-error' : ''}`}
                style={{ width: '100%', paddingRight: '42px', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isSubmitting}
                placeholder="Enter new password"
                data-testid="input-reset-new-password"
              />
              <button
                type="button"
                className="btn-toggle-password"
                style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: '4px' }}
                onClick={() => setShowNew(!showNew)}
                aria-label={showNew ? 'Hide password' : 'Show password'}
                data-testid="toggle-show-new-password"
              >
                {showNew ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
            {errors.newPassword && (
              <span className="field-error" data-testid="error-reset-new-password" style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                {errors.newPassword}
              </span>
            )}

            {/* Password Strength Indicator */}
            {newPassword.length > 0 && (
              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem', color: '#64748b' }}>
                  <span>Password Strength</span>
                  <span style={{ fontWeight: 700, color: strengthMeta.color }}>{strengthMeta.label}</span>
                </div>
                <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: strengthMeta.percent, height: '100%', background: strengthMeta.color, transition: 'all 0.3s ease' }} />
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password Field */}
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label htmlFor="reset-confirm-password" className="form-label">
              Confirm New Password <span className="text-required">*</span>
            </label>
            <div className="password-input-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="reset-confirm-password"
                type={showConfirm ? 'text' : 'password'}
                className={`form-input ${errors.confirmPassword ? 'input-error' : ''}`}
                style={{ width: '100%', paddingRight: '42px', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting}
                placeholder="Confirm new password"
                data-testid="input-reset-confirm-password"
              />
              <button
                type="button"
                className="btn-toggle-password"
                style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: '4px' }}
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                data-testid="toggle-show-confirm-password"
              >
                {showConfirm ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
            {errors.confirmPassword && (
              <span className="field-error" data-testid="error-reset-confirm-password" style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                {errors.confirmPassword}
              </span>
            )}
          </div>

          {/* Password Checklist */}
          <div style={{ marginTop: '1rem', background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Requirements</span>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', fontSize: '0.75rem' }}>
              <li style={{ color: checks.length ? '#10B981' : '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {checks.length ? <IconCheck /> : '•'} 8+ characters
              </li>
              <li style={{ color: checks.upper ? '#10B981' : '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {checks.upper ? <IconCheck /> : '•'} 1+ uppercase (A-Z)
              </li>
              <li style={{ color: checks.lower ? '#10B981' : '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {checks.lower ? <IconCheck /> : '•'} 1+ lowercase (a-z)
              </li>
              <li style={{ color: checks.number ? '#10B981' : '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {checks.number ? <IconCheck /> : '•'} 1+ number (0-9)
              </li>
              <li style={{ color: checks.special ? '#10B981' : '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {checks.special ? <IconCheck /> : '•'} 1+ symbol (!@#$...)
              </li>
            </ul>
          </div>

          {/* Modal Actions */}
          <div className="modal-actions" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
              data-testid="btn-cancel-reset"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              data-testid="btn-submit-reset"
            >
              {isSubmitting ? (
                <>
                  <span className="btn-spinner" />
                  Resetting Password...
                </>
              ) : (
                'Reset Password'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordModal;
