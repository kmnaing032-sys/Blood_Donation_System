/**
 * AuthContext.test.jsx — Step 1.6 Unit Tests
 *
 * Tests the AuthProvider and useAuth hook:
 *   - AuthProvider initialization without stored refresh token (unauthenticated, loading=false)
 *   - AuthProvider initialization with valid refresh token (calls refreshSession + getCurrentUser)
 *   - AuthProvider initialization with invalid/expired refresh token (safe clear session, user=null)
 *   - Successful login updates user and loading state
 *   - Failed login sets error and keeps user null
 *   - Successful logout clears user and session
 *   - useAuth outside provider throws error
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import * as authService from '../../services/authService';

vi.mock('../../services/authService', () => {
  return {
    login: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
    refreshSession: vi.fn(),
    getStoredRefreshToken: vi.fn(),
    getStoredUser: vi.fn(),
    clearAuthSession: vi.fn(),
    default: {
      login: vi.fn(),
      logout: vi.fn(),
      getCurrentUser: vi.fn(),
      refreshSession: vi.fn(),
      getStoredRefreshToken: vi.fn(),
      getStoredUser: vi.fn(),
      clearAuthSession: vi.fn(),
    },
  };
});

// Test component consuming AuthContext
const TestConsumer = ({ onLoginError }) => {
  const { user, loading, error, isAuthenticated, login, logout } = useAuth();

  const handleLoginClick = async () => {
    try {
      await login('test@example.com', 'password123');
    } catch (err) {
      if (onLoginError) {
        onLoginError(err);
      }
    }
  };

  return (
    <div>
      <div data-testid="loading">{loading ? 'true' : 'false'}</div>
      <div data-testid="auth">{isAuthenticated ? 'authenticated' : 'unauthenticated'}</div>
      <div data-testid="user">{user ? user.full_name : 'no-user'}</div>
      <div data-testid="error">{error || 'no-error'}</div>
      <button onClick={handleLoginClick}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

const fakeUser = {
  id: 1,
  full_name: 'Test Donor',
  email: 'test@example.com',
  role: 'donor',
  is_active: true,
};

describe('AuthContext & useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('throws an error when useAuth is consumed outside AuthProvider', () => {
    const { result } = renderHook(() => {
      try {
        return useAuth();
      } catch (err) {
        return err;
      }
    });

    expect(result.current).toBeInstanceOf(Error);
    expect(result.current.message).toBe('useAuth must be used within an AuthProvider');
  });

  it('initializes in unauthenticated state when no refresh token is stored', async () => {
    authService.getStoredRefreshToken.mockReturnValue(null);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('auth').textContent).toBe('unauthenticated');
    expect(screen.getByTestId('user').textContent).toBe('no-user');
    expect(authService.refreshSession).not.toHaveBeenCalled();
    expect(authService.getCurrentUser).not.toHaveBeenCalled();
  });

  it('restores authentication on mount if a valid refresh token exists', async () => {
    authService.getStoredRefreshToken.mockReturnValue('valid-refresh-token');
    authService.refreshSession.mockResolvedValue({
      accessToken: 'new-at',
      refreshToken: 'new-rt',
    });
    authService.getCurrentUser.mockResolvedValue(fakeUser);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(authService.refreshSession).toHaveBeenCalledOnce();
    expect(authService.getCurrentUser).toHaveBeenCalledOnce();
    expect(screen.getByTestId('auth').textContent).toBe('authenticated');
    expect(screen.getByTestId('user').textContent).toBe(fakeUser.full_name);
  });

  it('handles expired/invalid refresh token on initialization gracefully', async () => {
    authService.getStoredRefreshToken.mockReturnValue('expired-token');
    authService.refreshSession.mockRejectedValue(new Error('Refresh token expired'));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(authService.clearAuthSession).toHaveBeenCalled();
    expect(screen.getByTestId('auth').textContent).toBe('unauthenticated');
    expect(screen.getByTestId('user').textContent).toBe('no-user');
  });

  it('handles successful login and updates user state', async () => {
    authService.getStoredRefreshToken.mockReturnValue(null);
    authService.login.mockResolvedValue({
      accessToken: 'at-123',
      refreshToken: 'rt-123',
    });
    authService.getCurrentUser.mockResolvedValue(fakeUser);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    await act(async () => {
      screen.getByText('Login').click();
    });

    expect(authService.login).toHaveBeenCalledWith('test@example.com', 'password123');
    expect(authService.getCurrentUser).toHaveBeenCalled();
    expect(screen.getByTestId('auth').textContent).toBe('authenticated');
    expect(screen.getByTestId('user').textContent).toBe(fakeUser.full_name);
    expect(screen.getByTestId('error').textContent).toBe('no-error');
  });

  it('handles failed login, sets error state, and preserves unauthenticated status', async () => {
    authService.getStoredRefreshToken.mockReturnValue(null);
    const loginErr = {
      response: {
        data: {
          detail: 'Incorrect email or password',
        },
      },
    };
    authService.login.mockRejectedValue(loginErr);

    const onLoginError = vi.fn();

    render(
      <AuthProvider>
        <TestConsumer onLoginError={onLoginError} />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    await act(async () => {
      screen.getByText('Login').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe('Incorrect email or password');
    });

    expect(onLoginError).toHaveBeenCalledWith(loginErr);
    expect(screen.getByTestId('auth').textContent).toBe('unauthenticated');
    expect(screen.getByTestId('user').textContent).toBe('no-user');
  });

  it('handles logout and clears auth state', async () => {
    authService.getStoredRefreshToken.mockReturnValue('valid-token');
    authService.refreshSession.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
    });
    authService.getCurrentUser.mockResolvedValue(fakeUser);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth').textContent).toBe('authenticated');
    });

    act(() => {
      screen.getByText('Logout').click();
    });

    expect(authService.logout).toHaveBeenCalledOnce();
    expect(screen.getByTestId('auth').textContent).toBe('unauthenticated');
    expect(screen.getByTestId('user').textContent).toBe('no-user');
  });
});
