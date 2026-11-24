import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import profileService from '../services/profileService';
import authService from '../services/authService';
import emailNotificationService from '../services/emailNotificationService';
import './Profile.css';

// SVG Icons (UI/UX Pro Max rule: Use clean scalable SVGs with aria-hidden for decorative icons)
const IconUser = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ui-icon">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconEye = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ui-icon">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconEyeOff = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ui-icon">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" x2="22" y1="2" y2="22" />
  </svg>
);

const IconMail = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ui-icon">
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const IconShield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ui-icon">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
  </svg>
);

const IconLock = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ui-icon">
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconEdit = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ui-icon">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

const IconCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ui-icon">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const IconAlert = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ui-icon">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" x2="12" y1="8" y2="12" />
    <line x1="12" x2="12.01" y1="16" y2="16" />
  </svg>
);

export const Profile = () => {
  const { user: authUser, updateCurrentUser } = useAuth();

  // Profile data & loading states
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Edit form state
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [notification, setNotification] = useState(null);

  // Email Notification Preferences State
  const [emailPrefs, setEmailPrefs] = useState({
    email_notifications_enabled: true,
    notify_donor_events: true,
    notify_donation_events: true,
    notify_stock_events: true,
    notify_request_events: true,
  });
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [savingPrefKey, setSavingPrefKey] = useState(null);
  const [prefNotification, setPrefNotification] = useState(null);

  // Change Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({});
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordNotification, setPasswordNotification] = useState(null);

  // Fetch current user profile & email preferences
  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await profileService.getMyProfile();
      setProfile(data);
      setFullName(data.full_name || '');
      setEmail(data.email || '');
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to load profile. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadPreferences = async () => {
    setLoadingPrefs(true);
    try {
      const prefs = await emailNotificationService.getMyPreferences();
      setEmailPrefs(prefs);
    } catch (err) {
      console.error('Failed to load email preferences:', err);
    } finally {
      setLoadingPrefs(false);
    }
  };

  useEffect(() => {
    loadProfile();
    loadPreferences();
  }, []);

  const handleTogglePreference = async (key, currentValue) => {
    const newValue = !currentValue;
    setSavingPrefKey(key);
    setPrefNotification(null);

    // Optimistic UI update
    setEmailPrefs((prev) => ({ ...prev, [key]: newValue }));

    try {
      const updated = await emailNotificationService.updateMyPreferences({ [key]: newValue });
      setEmailPrefs(updated);
      setPrefNotification({ type: 'success', message: 'Email preferences updated.' });
    } catch (err) {
      // Revert optimistic update
      setEmailPrefs((prev) => ({ ...prev, [key]: currentValue }));
      const msg = err?.response?.data?.detail || 'Failed to update email preferences.';
      setPrefNotification({ type: 'error', message: msg });
    } finally {
      setSavingPrefKey(null);
    }
  };

  // Form Validation
  const validateForm = () => {
    const errors = {};
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      errors.full_name = 'Full name is required';
    } else if (trimmedName.length < 2) {
      errors.full_name = 'Full name must be at least 2 characters';
    } else if (trimmedName.length > 100) {
      errors.full_name = 'Full name must be at most 100 characters';
    }

    if (!trimmedEmail) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email address';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit profile edit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    setNotification(null);

    try {
      const updated = await profileService.updateMyProfile(profile.id, {
        full_name: fullName,
        email: email,
      });

      setProfile(updated);
      setIsEditing(false);
      setNotification({
        type: 'success',
        message: 'Profile updated successfully!',
      });

      // Synchronize updated user profile in global AuthContext & storage
      if (updateCurrentUser) {
        updateCurrentUser({
          ...authUser,
          ...updated,
        });
      }
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to update profile. Please verify your details.';
      setNotification({
        type: 'error',
        message: msg,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setFullName(profile?.full_name || '');
    setEmail(profile?.email || '');
    setFormErrors({});
  };

  // Password Policy Checks for Profile Change Password
  const pwdChecks = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    number: /\d/.test(newPassword),
    special: /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/`~]/.test(newPassword),
  };

  const pwdScore = Object.values(pwdChecks).filter(Boolean).length;
  const getPwdStrengthMeta = () => {
    if (newPassword.length === 0) return { label: '', color: '' };
    if (pwdScore <= 2) return { label: 'Weak', color: '#EF4444', percent: '33%' };
    if (pwdScore <= 4) return { label: 'Moderate', color: '#F59E0B', percent: '66%' };
    return { label: 'Strong', color: '#10B981', percent: '100%' };
  };

  const pwdStrengthMeta = getPwdStrengthMeta();

  // Validate Change Password Form
  const validatePasswordForm = () => {
    const errs = {};
    if (!currentPassword) {
      errs.currentPassword = 'Current password is required';
    }
    if (!newPassword) {
      errs.newPassword = 'New password is required';
    } else if (pwdScore < 5) {
      errs.newPassword = 'Password does not meet all security criteria';
    } else if (newPassword === currentPassword) {
      errs.newPassword = 'New password cannot be the same as current password';
    }

    if (!confirmPassword) {
      errs.confirmPassword = 'Confirmation password is required';
    } else if (newPassword !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }

    setPasswordErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!validatePasswordForm()) return;

    setChangingPassword(true);
    setPasswordNotification(null);

    try {
      const res = await authService.changePassword(
        currentPassword,
        newPassword,
        confirmPassword
      );
      setPasswordNotification({
        type: 'success',
        message: res.message || 'Password updated successfully.',
      });
      // Clear form fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordErrors({});
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to change password. Please verify your current credentials.';
      setPasswordNotification({
        type: 'error',
        message: msg,
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleCancelPassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordErrors({});
    setPasswordNotification(null);
  };

  return (
    <div className="profile-page-container" data-testid="profile-page">
      {/* Header with Title and Breadcrumb-like Subtitle */}
      <div className="profile-header">
        <div className="profile-header-main">
          <h1 className="profile-title">Account Profile</h1>
          <p className="profile-subtitle">
            Manage your personal credentials, identity, and security preferences
          </p>
        </div>
      </div>

      {/* Global Notifications */}
      {notification && (
        <div
          className={`profile-alert alert-${notification.type}`}
          role="alert"
          data-testid="profile-notification"
        >
          <span className="alert-icon">
            {notification.type === 'success' ? <IconCheck /> : <IconAlert />}
          </span>
          <span className="alert-message">{notification.message}</span>
          <button
            type="button"
            className="alert-close-btn"
            onClick={() => setNotification(null)}
            aria-label="Dismiss alert"
          >
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="profile-loading" data-testid="profile-loading">
          <div className="profile-spinner" aria-label="Loading profile"></div>
          <p>Loading your profile...</p>
        </div>
      ) : error ? (
        <div className="profile-error-card" data-testid="profile-error">
          <div className="error-icon-wrapper">
            <IconAlert />
          </div>
          <h3>Unable to load profile</h3>
          <p>{error}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadProfile}
          >
            Retry Connection
          </button>
        </div>
      ) : (
        <div className="profile-content-grid">
          {/* Main Profile Info Card */}
          <div className="profile-card">
            <div className="profile-card-header">
              <div className="profile-avatar-container">
                <div className="profile-avatar">
                  {profile?.full_name
                    ? profile.full_name[0].toUpperCase()
                    : 'U'}
                </div>
                <div className="profile-status-dot" title="Account active" />
              </div>
              <div className="profile-identity">
                <div className="profile-identity-top">
                  <h2 data-testid="profile-name-display">{profile?.full_name}</h2>
                  <div className="badge-group">
                    <span className="profile-badge badge-role" data-testid="profile-role-display">
                      <IconShield />
                      {profile?.role?.toUpperCase()}
                    </span>
                    <span
                      className={`profile-badge ${
                        profile?.is_active ? 'badge-active' : 'badge-inactive'
                      }`}
                      data-testid="profile-status-display"
                    >
                      {profile?.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <p className="profile-identity-email">{profile?.email}</p>
              </div>
            </div>

            <div className="profile-card-body">
              {!isEditing ? (
                <div className="profile-details-view" data-testid="profile-view-section">
                  <div className="profile-section-heading">
                    <h3>Personal Information</h3>
                    <p>Your primary identity details recorded in the donation network</p>
                  </div>

                  <div className="profile-info-grid">
                    <div className="profile-info-item">
                      <span className="info-label">
                        <IconUser /> Full Legal Name
                      </span>
                      <span className="info-value" data-testid="info-full-name">
                        {profile?.full_name}
                      </span>
                    </div>

                    <div className="profile-info-item">
                      <span className="info-label">
                        <IconMail /> Email Address
                      </span>
                      <span className="info-value" data-testid="info-email">
                        {profile?.email}
                      </span>
                    </div>

                    <div className="profile-info-item">
                      <span className="info-label">
                        <IconShield /> System Role
                      </span>
                      <span className="info-value role-tag">
                        {profile?.role}
                      </span>
                    </div>

                    <div className="profile-info-item">
                      <span className="info-label">Account ID</span>
                      <span className="info-value text-mono">
                        #{profile?.id}
                      </span>
                    </div>
                  </div>

                  <div className="profile-actions-bar">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setIsEditing(true)}
                      data-testid="edit-profile-btn"
                    >
                      <IconEdit /> Edit Profile
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  noValidate
                  className="profile-edit-form"
                  data-testid="profile-edit-form"
                >
                  <div className="profile-section-heading">
                    <h3>Edit Profile Details</h3>
                    <p>Update your legal name and contact email address below</p>
                  </div>

                  <div className="form-group">
                    <label htmlFor="full_name" className="form-label">
                      Full Legal Name <span className="text-required">*</span>
                    </label>
                    <input
                      id="full_name"
                      name="full_name"
                      type="text"
                      className={`form-input ${formErrors.full_name ? 'input-error' : ''}`}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={saving}
                      placeholder="e.g. Jane Doe"
                      data-testid="input-full-name"
                    />
                    {formErrors.full_name && (
                      <span className="field-error" data-testid="error-full-name">
                        {formErrors.full_name}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="email" className="form-label">
                      Email Address <span className="text-required">*</span>
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      className={`form-input ${formErrors.email ? 'input-error' : ''}`}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={saving}
                      placeholder="name@example.com"
                      data-testid="input-email"
                    />
                    {formErrors.email && (
                      <span className="field-error" data-testid="error-email">
                        {formErrors.email}
                      </span>
                    )}
                  </div>

                  {/* Read-Only RBAC Fields (Protected from self-elevation) */}
                  <div className="form-row-duo">
                    <div className="form-group">
                      <label className="form-label">System Role</label>
                      <div className="input-with-icon">
                        <input
                          type="text"
                          className="form-input input-readonly"
                          value={profile?.role || ''}
                          disabled
                          title="Role changes must be performed by an administrator."
                        />
                        <span className="input-lock-icon"><IconLock /></span>
                      </div>
                      <small className="form-help-text">
                        Role assignments are restricted to administrators.
                      </small>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Account Status</label>
                      <div className="input-with-icon">
                        <input
                          type="text"
                          className="form-input input-readonly"
                          value={profile?.is_active ? 'Active' : 'Inactive'}
                          disabled
                          title="Account status is managed by administrators."
                        />
                        <span className="input-lock-icon"><IconLock /></span>
                      </div>
                      <small className="form-help-text">
                        Account status is managed by system administrators.
                      </small>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={saving}
                      data-testid="save-profile-btn"
                    >
                      {saving ? (
                        <>
                          <span className="btn-spinner" />
                          Saving Changes...
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCancelEdit}
                      disabled={saving}
                      data-testid="cancel-edit-btn"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Security & Password Specifications Card */}
          <div className="profile-security-card" data-testid="profile-security-section">
            <div className="security-card-header">
              <span className="security-icon-badge">
                <IconShield />
              </span>
              <div>
                <h3 className="security-card-title">Password & Security</h3>
                <p className="security-card-desc">
                  Update account password and manage authentication safeguards
                </p>
              </div>
            </div>

            {/* Password Feedback Alert */}
            {passwordNotification && (
              <div
                className={`profile-alert ${passwordNotification.type === 'error' ? 'alert-danger' : 'alert-success'}`}
                role="status"
                data-testid="password-notification"
                style={{ marginTop: '1rem', marginBottom: '1rem' }}
              >
                <span>{passwordNotification.message}</span>
                <button
                  type="button"
                  className="alert-close-btn"
                  onClick={() => setPasswordNotification(null)}
                  aria-label="Dismiss message"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Change Password Form */}
            <form onSubmit={handleChangePasswordSubmit} noValidate className="change-password-form" data-testid="change-password-form" style={{ marginTop: '1rem' }}>
              {/* Current Password Field */}
              <div className="form-group">
                <label htmlFor="current_password" className="form-label">
                  Current Password <span className="text-required">*</span>
                </label>
                <div className="password-input-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="current_password"
                    name="current_password"
                    type={showCurrent ? 'text' : 'password'}
                    className={`form-input ${passwordErrors.currentPassword ? 'input-error' : ''}`}
                    style={{ width: '100%', paddingRight: '42px', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={changingPassword}
                    placeholder="Enter current password"
                    data-testid="input-current-password"
                  />
                  <button
                    type="button"
                    className="btn-toggle-password"
                    style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: '4px' }}
                    onClick={() => setShowCurrent(!showCurrent)}
                    aria-label={showCurrent ? 'Hide password' : 'Show password'}
                    data-testid="toggle-show-current-password"
                  >
                    {showCurrent ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
                {passwordErrors.currentPassword && (
                  <span className="field-error" data-testid="error-current-password" style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                    {passwordErrors.currentPassword}
                  </span>
                )}
              </div>

              {/* New Password Field */}
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label htmlFor="new_password" className="form-label">
                  New Password <span className="text-required">*</span>
                </label>
                <div className="password-input-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="new_password"
                    name="new_password"
                    type={showNew ? 'text' : 'password'}
                    className={`form-input ${passwordErrors.newPassword ? 'input-error' : ''}`}
                    style={{ width: '100%', paddingRight: '42px', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={changingPassword}
                    placeholder="Enter new strong password"
                    data-testid="input-new-password"
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
                {passwordErrors.newPassword && (
                  <span className="field-error" data-testid="error-new-password" style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                    {passwordErrors.newPassword}
                  </span>
                )}

                {/* Password Strength Indicator */}
                {newPassword.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem', color: '#64748b' }}>
                      <span>Password Strength</span>
                      <span style={{ fontWeight: 700, color: pwdStrengthMeta.color }}>{pwdStrengthMeta.label}</span>
                    </div>
                    <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: pwdStrengthMeta.percent, height: '100%', background: pwdStrengthMeta.color, transition: 'all 0.3s ease' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password Field */}
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label htmlFor="confirm_password" className="form-label">
                  Confirm New Password <span className="text-required">*</span>
                </label>
                <div className="password-input-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="confirm_password"
                    name="confirm_password"
                    type={showConfirm ? 'text' : 'password'}
                    className={`form-input ${passwordErrors.confirmPassword ? 'input-error' : ''}`}
                    style={{ width: '100%', paddingRight: '42px', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={changingPassword}
                    placeholder="Confirm new password"
                    data-testid="input-confirm-password"
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
                {passwordErrors.confirmPassword && (
                  <span className="field-error" data-testid="error-confirm-password" style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                    {passwordErrors.confirmPassword}
                  </span>
                )}
              </div>

              {/* Password Requirements Checklist */}
              <div style={{ marginTop: '1rem', background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Password Policy</span>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', fontSize: '0.75rem' }}>
                  <li style={{ color: pwdChecks.length ? '#10B981' : '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {pwdChecks.length ? <IconCheck /> : '•'} 8+ characters
                  </li>
                  <li style={{ color: pwdChecks.upper ? '#10B981' : '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {pwdChecks.upper ? <IconCheck /> : '•'} 1+ uppercase (A-Z)
                  </li>
                  <li style={{ color: pwdChecks.lower ? '#10B981' : '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {pwdChecks.lower ? <IconCheck /> : '•'} 1+ lowercase (a-z)
                  </li>
                  <li style={{ color: pwdChecks.number ? '#10B981' : '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {pwdChecks.number ? <IconCheck /> : '•'} 1+ number (0-9)
                  </li>
                  <li style={{ color: pwdChecks.special ? '#10B981' : '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {pwdChecks.special ? <IconCheck /> : '•'} 1+ symbol (!@#$...)
                  </li>
                </ul>
              </div>

              {/* Form Buttons */}
              <div className="form-actions" style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCancelPassword}
                  disabled={changingPassword}
                  data-testid="btn-cancel-password"
                >
                  Clear
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={changingPassword}
                  data-testid="btn-update-password"
                >
                  {changingPassword ? (
                    <>
                      <span className="btn-spinner" />
                      Updating Password...
                    </>
                  ) : (
                    'Update Password'
                  )}
                </button>
              </div>
            </form>

            <div className="security-specs-list" style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #e2e8f0' }}>
              <div className="spec-item">
                <span className="spec-label">Algorithm</span>
                <span className="spec-value">Argon2id (Memory-hard)</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">Token Rotation</span>
                <span className="spec-value">Automatic Refresh Interception</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">Session Policy</span>
                <span className="spec-value">Short-lived in-memory Tokens</span>
              </div>
              <div className="spec-item">
                <span className="spec-label">Role Guard</span>
                <span className="spec-value">Backend RBAC Enforced</span>
              </div>
            </div>
          </div>

          {/* Email Notification Preferences Card (Step 1.24) */}
          <div className="email-pref-card" data-testid="email-preferences-card">
            <div className="email-pref-card-header">
              <div className="email-pref-header-left">
                <span className="email-icon-badge">
                  <IconMail />
                </span>
                <div>
                  <h3 className="email-pref-title">Email Notification Preferences</h3>
                  <p className="email-pref-desc">
                    Control which updates and alerts are forwarded to your registered email
                  </p>
                </div>
              </div>
            </div>

            {prefNotification && (
              <div
                className={`profile-alert ${prefNotification.type === 'error' ? 'alert-danger' : 'alert-success'}`}
                role="status"
              >
                <span>{prefNotification.message}</span>
              </div>
            )}

            {loadingPrefs ? (
              <div className="profile-loading" style={{ padding: '1rem 0' }}>
                <span className="spinner" />
                <span style={{ fontSize: '0.875rem', color: '#64748b' }}>Loading preferences...</span>
              </div>
            ) : (
              <div className="email-pref-list">
                <div className="email-pref-item">
                  <div className="email-pref-info">
                    <label htmlFor="pref-master" className="email-pref-label">
                      Global Email Notifications
                    </label>
                    <span className="email-pref-subtext">
                      Master toggle to enable or disable all outbound email notifications
                    </span>
                  </div>
                  <label className="switch">
                    <input
                      id="pref-master"
                      type="checkbox"
                      data-testid="pref-master-toggle"
                      checked={emailPrefs.email_notifications_enabled}
                      disabled={savingPrefKey !== null}
                      onChange={() =>
                        handleTogglePreference(
                          'email_notifications_enabled',
                          emailPrefs.email_notifications_enabled
                        )
                      }
                    />
                    <span className="slider" />
                  </label>
                </div>

                <div className="email-pref-item">
                  <div className="email-pref-info">
                    <label htmlFor="pref-donor" className="email-pref-label">
                      Donor Registration Alerts
                    </label>
                    <span className="email-pref-subtext">
                      Notifications regarding new donor onboarding and profile status
                    </span>
                  </div>
                  <label className="switch">
                    <input
                      id="pref-donor"
                      type="checkbox"
                      data-testid="pref-donor-toggle"
                      checked={emailPrefs.notify_donor_events}
                      disabled={!emailPrefs.email_notifications_enabled || savingPrefKey !== null}
                      onChange={() =>
                        handleTogglePreference('notify_donor_events', emailPrefs.notify_donor_events)
                      }
                    />
                    <span className="slider" />
                  </label>
                </div>

                <div className="email-pref-item">
                  <div className="email-pref-info">
                    <label htmlFor="pref-donation" className="email-pref-label">
                      Donation Event Updates
                    </label>
                    <span className="email-pref-subtext">
                      Confirmations when your blood donation is successfully logged
                    </span>
                  </div>
                  <label className="switch">
                    <input
                      id="pref-donation"
                      type="checkbox"
                      data-testid="pref-donation-toggle"
                      checked={emailPrefs.notify_donation_events}
                      disabled={!emailPrefs.email_notifications_enabled || savingPrefKey !== null}
                      onChange={() =>
                        handleTogglePreference(
                          'notify_donation_events',
                          emailPrefs.notify_donation_events
                        )
                      }
                    />
                    <span className="slider" />
                  </label>
                </div>

                <div className="email-pref-item">
                  <div className="email-pref-info">
                    <label htmlFor="pref-stock" className="email-pref-label">
                      Blood Stock Alerts
                    </label>
                    <span className="email-pref-subtext">
                      Low stock and critical inventory replenishment notifications
                    </span>
                  </div>
                  <label className="switch">
                    <input
                      id="pref-stock"
                      type="checkbox"
                      data-testid="pref-stock-toggle"
                      checked={emailPrefs.notify_stock_events}
                      disabled={!emailPrefs.email_notifications_enabled || savingPrefKey !== null}
                      onChange={() =>
                        handleTogglePreference('notify_stock_events', emailPrefs.notify_stock_events)
                      }
                    />
                    <span className="slider" />
                  </label>
                </div>

                <div className="email-pref-item">
                  <div className="email-pref-info">
                    <label htmlFor="pref-request" className="email-pref-label">
                      Blood Request Status
                    </label>
                    <span className="email-pref-subtext">
                      Approval, rejection, fulfillment and cancellation progress
                    </span>
                  </div>
                  <label className="switch">
                    <input
                      id="pref-request"
                      type="checkbox"
                      data-testid="pref-request-toggle"
                      checked={emailPrefs.notify_request_events}
                      disabled={!emailPrefs.email_notifications_enabled || savingPrefKey !== null}
                      onChange={() =>
                        handleTogglePreference(
                          'notify_request_events',
                          emailPrefs.notify_request_events
                        )
                      }
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
