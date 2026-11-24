/**
 * ProtectedRoute.test.jsx — Step 1.7 Protected Route Unit Tests
 *
 * Requirements covered:
 * 1. Protected route redirect for unauthenticated users.
 * 2. Protected route access for authenticated users.
 * 3. Authentication initialization loading state rendering.
 * 4. Preserving the requested location and redirecting back after login.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ProtectedRoute } from '../ProtectedRoute';
import * as AuthContextModule from '../../context/AuthContext';

// Helper component to check redirected location state
const LoginPageStub = () => {
  const location = useLocation();
  return (
    <div>
      <h1>Login Page Stub</h1>
      <div data-testid="redirect-from">{location.state?.from?.pathname || 'none'}</div>
    </div>
  );
};

const DashboardStub = () => <h1>Protected Dashboard Stub</h1>;

describe('ProtectedRoute Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state while authentication is initializing', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      isAuthenticated: false,
      loading: true,
      user: null,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <ProtectedRoute>
          <DashboardStub />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('auth-loading')).toBeDefined();
    expect(screen.getByText(/initializing session/i)).toBeDefined();
    expect(screen.queryByText(/protected dashboard stub/i)).toBeNull();
  });

  it('redirects unauthenticated users to /login and preserves requested pathname', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      isAuthenticated: false,
      loading: false,
      user: null,
    });

    render(
      <MemoryRouter initialEntries={['/donations']}>
        <Routes>
          <Route
            path="/donations"
            element={
              <ProtectedRoute>
                <DashboardStub />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPageStub />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/login page stub/i)).toBeDefined();
    expect(screen.getByTestId('redirect-from').textContent).toBe('/donations');
    expect(screen.queryByText(/protected dashboard stub/i)).toBeNull();
  });

  it('renders protected child component for authenticated users', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { id: 1, full_name: 'John Doe', role: 'donor' },
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <ProtectedRoute>
          <DashboardStub />
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText(/protected dashboard stub/i)).toBeDefined();
    expect(screen.queryByText(/login page stub/i)).toBeNull();
  });

  it('redirects to / when user does not have requiredRole', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { id: 1, full_name: 'Regular Donor', role: 'donor' },
    });

    render(
      <MemoryRouter initialEntries={['/users']}>
        <Routes>
          <Route
            path="/users"
            element={
              <ProtectedRoute requiredRole="admin">
                <div>Admin Users Area</div>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<div>Home Dashboard Stub</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Admin Users Area')).toBeNull();
    expect(screen.getByText('Home Dashboard Stub')).toBeDefined();
  });

  it('allows access when user matches requiredRole', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { id: 2, full_name: 'Admin User', role: 'admin' },
    });

    render(
      <MemoryRouter initialEntries={['/users']}>
        <Routes>
          <Route
            path="/users"
            element={
              <ProtectedRoute requiredRole="admin">
                <div>Admin Users Area</div>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<div>Home Dashboard Stub</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Admin Users Area')).toBeDefined();
  });
});
