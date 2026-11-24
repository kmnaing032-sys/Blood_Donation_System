/**
 * Routing.test.jsx — Step 1.7 & 1.8 Routing & Navigation Unit Tests
 *
 * Requirements covered:
 * 1. Unknown route handling (404 Page).
 * 2. Authenticated user visiting /login gets redirected to '/'.
 * 3. Unauthenticated user visiting '/' gets redirected to '/login'.
 * 4. Successful login redirects back to originally requested page.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from '../Login';
import { Dashboard } from '../Dashboard';
import { NotFound } from '../NotFound';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import * as AuthContextModule from '../../context/AuthContext';

const PublicOnlyRoute = ({ children }) => {
  const { isAuthenticated, loading } = AuthContextModule.useAuth();
  if (loading) return <div>Loading...</div>;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return children;
};

const TestAppRoutes = ({ initialEntry = '/' }) => (
  <MemoryRouter initialEntries={[initialEntry]}>
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/custom-protected"
        element={
          <ProtectedRoute>
            <div>Custom Protected Page Content</div>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </MemoryRouter>
);

describe('Routing & Navigation', () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders NotFound page on unknown routes', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { id: 1, full_name: 'Test' },
    });

    render(<TestAppRoutes initialEntry="/some-random-unknown-page" />);

    expect(screen.getByText('404')).toBeDefined();
    expect(screen.getByText(/page not found/i)).toBeDefined();
    expect(screen.getByRole('link', { name: /return to dashboard/i })).toBeDefined();
  });

  it('redirects authenticated user visiting /login back to /', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { id: 1, full_name: 'Jane Doe', role: 'donor' },
    });

    render(<TestAppRoutes initialEntry="/login" />);

    expect(screen.getByTestId('dashboard-page')).toBeDefined();
    expect(screen.getByTestId('welcome-message').textContent).toContain('Jane Doe');
    expect(screen.queryByRole('heading', { name: /sign in to your account/i })).toBeNull();
  });

  it('redirects unauthenticated user visiting / to /login', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      isAuthenticated: false,
      loading: false,
      user: null,
      login: mockLogin,
    });

    render(<TestAppRoutes initialEntry="/" />);

    expect(screen.getByText(/sign in to your account/i)).toBeDefined();
    expect(screen.queryByTestId('dashboard-page')).toBeNull();
  });

  it('redirects user back to originally requested route after successful login', async () => {
    let isAuthed = false;
    mockLogin.mockImplementation(async () => {
      isAuthed = true;
    });

    vi.spyOn(AuthContextModule, 'useAuth').mockImplementation(() => ({
      isAuthenticated: isAuthed,
      loading: false,
      user: isAuthed ? { id: 1, full_name: 'Jane' } : null,
      login: mockLogin,
      error: null,
    }));

    render(<TestAppRoutes initialEntry="/custom-protected" />);

    // First redirected to login because unauthenticated
    expect(screen.getByText(/sign in to your account/i)).toBeDefined();

    // Fill credentials
    fireEvent.change(screen.getByLabelText(/^email address$/i), {
      target: { value: 'donor@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'Password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // User should be directed to /custom-protected
    await waitFor(() => {
      expect(screen.getByText(/custom protected page content/i)).toBeDefined();
    });
  });
});
