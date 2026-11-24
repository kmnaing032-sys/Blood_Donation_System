import React, { useState, useEffect } from 'react';
import { USER_ROLES } from '../../services/userService';
import './UserModals.css';

export const UserFormModal = ({
  isOpen,
  onClose,
  initialData,
  onSubmit,
  isSubmitting,
  currentUserId,
}) => {
  const isEditing = Boolean(initialData);
  const isSelf = isEditing && initialData?.id === currentUserId;

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'donor',
    is_active: true,
  });

  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (initialData) {
      setFormData({
        full_name: initialData.full_name || '',
        email: initialData.email || '',
        password: '',
        role: initialData.role || 'donor',
        is_active: initialData.is_active !== undefined ? initialData.is_active : true,
      });
      setFieldErrors({});
    } else {
      setFormData({
        full_name: '',
        email: '',
        password: '',
        role: 'donor',
        is_active: true,
      });
      setFieldErrors({});
    }
  }, [initialData, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const validate = () => {
    const errors = {};
    if (!formData.full_name || formData.full_name.trim().length < 2) {
      errors.full_name = 'Full name must be at least 2 characters.';
    }
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!isEditing) {
      if (!formData.password) {
        errors.password = 'Password is required.';
      } else if (formData.password.length < 8) {
        errors.password = 'Password must be at least 8 characters.';
      } else if (!/[A-Za-z]/.test(formData.password) || !/\d/.test(formData.password)) {
        errors.password = 'Password must contain at least one letter and one number.';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(formData);
  };

  return (
    <div className="modal-backdrop" data-testid="user-form-modal-backdrop" onClick={onClose}>
      <div
        className="modal-container user-form-modal"
        role="dialog"
        aria-labelledby="user-modal-title"
        data-testid="user-form-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-content">
            <div className="modal-icon-container">
              {isEditing ? (
                <svg
                  className="modal-header-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              ) : (
                <svg
                  className="modal-header-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7.5" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
              )}
            </div>
            <div>
              <h2 id="user-modal-title" className="modal-title">
                {isEditing ? 'Edit User' : 'Create New User Account'}
              </h2>
              {isEditing && (
                <p className="modal-subtitle">
                  {initialData.full_name} <span className="modal-subtitle-email">({initialData.email})</span>
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form" noValidate>
          <div className="form-group">
            <label htmlFor="full_name">
              Full Legal Name <span className="required">*</span>
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              required
              value={formData.full_name}
              onChange={handleChange}
              placeholder="e.g. John Doe"
              data-testid="input-user-fullname"
            />
            {fieldErrors.full_name && (
              <span className="field-error" data-testid="error-user-fullname">
                {fieldErrors.full_name}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="email">
              Email Address <span className="required">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              placeholder="e.g. user@example.com"
              data-testid="input-user-email"
            />
            {fieldErrors.email && (
              <span className="field-error" data-testid="error-user-email">
                {fieldErrors.email}
              </span>
            )}
          </div>

          {!isEditing && (
            <div className="form-group">
              <label htmlFor="password">
                Initial Password <span className="required">*</span>
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                placeholder="At least 8 chars with letters & numbers"
                data-testid="input-user-password"
              />
              {fieldErrors.password && (
                <span className="field-error" data-testid="error-user-password">
                  {fieldErrors.password}
                </span>
              )}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="role">
              System Role <span className="required">*</span>
            </label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              disabled={isSelf}
              data-testid="select-user-role"
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.toUpperCase()}
                </option>
              ))}
            </select>
            {isSelf && (
              <small className="field-hint">
                You cannot modify your own administrator role.
              </small>
            )}
          </div>

          {isEditing && (
            <div className="form-group toggle-group">
              <span className="toggle-label-text">
                Account Status
              </span>
              <label
                className={`switch-toggle-card ${formData.is_active ? 'status-active' : 'status-inactive'} ${isSelf && initialData?.role === 'admin' ? 'disabled' : ''}`}
                htmlFor="is_active"
              >
                <div className="switch-toggle-info">
                  <div className="switch-status-indicator">
                    <span className={`status-dot ${formData.is_active ? 'dot-active' : 'dot-inactive'}`} />
                    <span className="status-title">
                      {formData.is_active ? 'Active Account' : 'Inactive Account'}
                    </span>
                  </div>
                  <span className="status-description">
                    {formData.is_active
                      ? 'User can sign in and perform assigned duties'
                      : 'Account is locked and cannot access the system'}
                  </span>
                </div>
                <div className="switch-control-wrapper">
                  <input
                    id="is_active"
                    name="is_active"
                    type="checkbox"
                    className="switch-checkbox"
                    checked={formData.is_active}
                    onChange={handleChange}
                    disabled={isSelf && initialData?.role === 'admin'}
                    data-testid="checkbox-user-active"
                  />
                  <span className="switch-slider" aria-hidden="true" />
                </div>
              </label>
              {isSelf && initialData?.role === 'admin' && (
                <small className="field-hint">
                  You cannot deactivate your own active admin session.
                </small>
              )}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              data-testid="btn-submit-user"
            >
              {isSubmitting ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>{isEditing ? 'Saving Changes...' : 'Creating Account...'}</span>
                </>
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Create Account'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
