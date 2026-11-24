
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DeveloperBranding } from '../components/branding/DeveloperBranding';
import './Login.css';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, error: apiError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect to the original page after successful login
  const from = location.state?.from?.pathname || '/';

  const validate = () => {
    const errors = {};

    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    setValidationErrors(errors);

    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSubmitting) return;

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch {
      // Authentication error is handled by AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailChange = (e) => {
    setEmail(e.target.value);

    if (validationErrors.email) {
      setValidationErrors((prev) => ({
        ...prev,
        email: null,
      }));
    }
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);

    if (validationErrors.password) {
      setValidationErrors((prev) => ({
        ...prev,
        password: null,
      }));
    }
  };

  return (
    <div className="login-container">

      {/* Login Card - Centered in Browser */}
      <div className="login-card">

        {/* Login Header */}
        <div className="login-header">
          <div className="login-brand">
            <span
              className="blood-drop-icon"
              role="img"
              aria-label="blood drop"
            >
              🩸
            </span>
          </div>

          <h1 className="login-title">
            Blood Donation System
          </h1>

          <p className="login-subtitle">
            Sign in to your account
          </p>
        </div>

        {/* API Error Message */}
        {apiError && (
          <div className="api-error-alert" role="alert">
            <span>⚠️</span>
            <span>{apiError}</span>
          </div>
        )}

        {/* Login Form */}
        <form
          className="login-form"
          onSubmit={handleSubmit}
          noValidate
        >

          {/* Email Field */}
          <div className="form-group">
            <label
              className="form-label"
              htmlFor="email"
            >
              Email Address
            </label>

            <input
              id="email"
              type="email"
              name="email"
              className={`form-input ${validationErrors.email ? 'input-error' : ''
                }`}
              placeholder="name@example.com"
              value={email}
              onChange={handleEmailChange}
              disabled={isSubmitting}
              autoComplete="email"
              autoFocus
            />

            {validationErrors.email && (
              <span className="field-error" role="alert">
                {validationErrors.email}
              </span>
            )}
          </div>

          {/* Password Field */}
          <div className="form-group">
            <label
              className="form-label"
              htmlFor="password"
            >
              Password
            </label>

            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                className={`form-input ${validationErrors.password ? 'input-error' : ''
                  }`}
                placeholder="••••••••"
                value={password}
                onChange={handlePasswordChange}
                disabled={isSubmitting}
                autoComplete="current-password"
              />

              <button
                type="button"
                className="toggle-password-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={
                  showPassword ? 'Hide password' : 'Show password'
                }
                disabled={isSubmitting}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            {validationErrors.password && (
              <span className="field-error" role="alert">
                {validationErrors.password}
              </span>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="login-submit-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>

        </form>

        {/* Login Footer */}
        <div className="login-footer">
          <p>Every donation saves a life.</p>
        </div>

      </div>

      {/* Developer Branding - Fixed at Bottom */}
      <div className="login-branding-wrapper">
        <DeveloperBranding className="branding-login" />
      </div>

    </div>
  );
};

export default Login;
