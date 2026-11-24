/**
 * Login.test.jsx — Step 1.7 Login Page Unit Tests
 *
 * Requirements covered:
 * 1. Login page rendering (title, inputs, button, blood drop icon).
 * 2. Required field validation (empty email, invalid email, empty password, short password).
 * 3. Successful login (calls login with sanitized inputs, navigates).
 * 4. Failed login error display (shows API error message).
 * 5. Password visibility toggle (switches between password and text).
 * 6. Duplicate submission prevention (disables submit button while submitting).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Login } from '../Login';
import * as AuthContextModule from '../../context/AuthContext';

describe('Login Page', () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      login: mockLogin,
      error: null,
      isAuthenticated: false,
      loading: false,
    });
  });

  it('renders login form elements with accessible labels', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /blood donation system/i })).toBeDefined();
    expect(screen.getByLabelText(/^email address$/i)).toBeDefined();
    expect(screen.getByLabelText(/^password$/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined();
  });

  it('validates required fields on empty submit without calling login', async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/email is required/i)).toBeDefined();
    expect(await screen.findByText(/password is required/i)).toBeDefined();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('validates email format and password minimum length', async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/^email address$/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'short' },
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/please enter a valid email address/i)).toBeDefined();
    expect(await screen.findByText(/password must be at least 8 characters/i)).toBeDefined();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('toggles password visibility between text and password types', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/^password$/i);
    const toggleBtn = screen.getByRole('button', { name: /show password/i });

    expect(passwordInput.getAttribute('type')).toBe('password');

    fireEvent.click(toggleBtn);
    expect(passwordInput.getAttribute('type')).toBe('text');
    expect(screen.getByRole('button', { name: /hide password/i })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(passwordInput.getAttribute('type')).toBe('password');
  });

  it('submits valid credentials and calls login from AuthContext', async () => {
    mockLogin.mockResolvedValueOnce({ id: 1, full_name: 'Test Donor' });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/^email address$/i), {
      target: { value: 'donor@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'SecurePass123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('donor@example.com', 'SecurePass123');
    });
  });

  it('displays API authentication error when error is provided in AuthContext', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      login: mockLogin,
      error: 'Incorrect email or password',
      isAuthenticated: false,
      loading: false,
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/incorrect email or password/i)).toBeDefined();
  });

  it('prevents duplicate submissions while request is in flight', async () => {
    let resolveLogin;
    mockLogin.mockReturnValueOnce(
      new Promise((res) => {
        resolveLogin = res;
      })
    );

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/^email address$/i), {
      target: { value: 'donor@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'SecurePass123' },
    });

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    // Button should now be disabled and text updated
    expect(submitBtn.hasAttribute('disabled')).toBe(true);
    expect(submitBtn.textContent).toBe('Signing in...');

    // Attempt second click
    fireEvent.click(submitBtn);

    expect(mockLogin).toHaveBeenCalledTimes(1);

    resolveLogin({ id: 1 });
    await waitFor(() => {
      expect(submitBtn.hasAttribute('disabled')).toBe(false);
    });
  });

  it('renders developer branding credit and logo on the login page', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByTestId('developer-branding')).toBeDefined();
    expect(screen.getByText('Developed by')).toBeDefined();
    expect(screen.getByText('Kyaw Moe Naing')).toBeDefined();
    expect(screen.getByTestId('developer-logo')).toBeDefined();
  });
});
