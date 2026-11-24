/**
 * Dashboard.test.jsx — Step 1.8 Dashboard & Layout Unit Tests
 *
 * Requirements covered:
 * 1. Dashboard rendering (welcome message, placeholder stats cards).
 * 2. Placeholder statistic cards rendering (Total Donors, Total Donations, Available Blood Stock, Pending Blood Requests).
 * 3. Sidebar navigation rendering (all 5 core routes + Users link conditionally for admin).
 * 4. Active navigation state styling.
 * 5. Mobile sidebar toggle behavior (open/close).
 * 6. Logout behavior via Topbar button.
 * 7. Authenticated user information display across Topbar, Sidebar, and Dashboard.
 * 8. Protected dashboard access.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Dashboard } from '../Dashboard';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Sidebar } from '../../components/layout/Sidebar';
import { Topbar } from '../../components/layout/Topbar';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import * as AuthContextModule from '../../context/AuthContext';

const donorUser = {
  id: 1,
  full_name: 'Jane Donor',
  email: 'jane@example.com',
  role: 'donor',
};

const adminUser = {
  id: 2,
  full_name: 'Alex Admin',
  email: 'admin@example.com',
  role: 'admin',
};

describe('Dashboard & Layout Components', () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: donorUser,
      isAuthenticated: true,
      loading: false,
      logout: mockLogout,
    });
  });

  describe('Dashboard Page', () => {
    it('renders welcome message with authenticated user name', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      expect(screen.getByTestId('welcome-message').textContent).toContain('Jane Donor');
    });

    it('renders all 4 placeholder statistic cards ready for API integration', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      expect(screen.getByTestId('stat-total-donors')).toBeDefined();
      expect(screen.getByTestId('stat-total-donations')).toBeDefined();
      expect(screen.getByTestId('stat-available-blood-stock')).toBeDefined();
      expect(screen.getByTestId('stat-pending-blood-requests')).toBeDefined();

      expect(screen.getByText('Total Donors')).toBeDefined();
      expect(screen.getByText('Total Donations')).toBeDefined();
      expect(screen.getByText('Available Blood Stock')).toBeDefined();
      expect(screen.getByText('Pending Blood Requests')).toBeDefined();
    });

    it('displays authenticated user info in system status table', () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      expect(screen.getByText('jane@example.com')).toBeDefined();
      expect(screen.getByText('donor')).toBeDefined();
    });
  });

  describe('Sidebar Navigation', () => {
    it('renders the 5 core navigation links for non-admin user', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Sidebar isOpen={true} onClose={vi.fn()} />
        </MemoryRouter>
      );

      expect(screen.getByRole('link', { name: /dashboard/i })).toBeDefined();
      expect(screen.getByRole('link', { name: /donors/i })).toBeDefined();
      expect(screen.getByRole('link', { name: /donations/i })).toBeDefined();
      expect(screen.getByRole('link', { name: /blood stock/i })).toBeDefined();
      expect(screen.getByRole('link', { name: /blood requests/i })).toBeDefined();

      // Users route should NOT be present for non-admin
      expect(screen.queryByRole('link', { name: /users/i })).toBeNull();
    });

    it('renders the Users link if user has admin role', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: adminUser,
        isAuthenticated: true,
        loading: false,
        logout: mockLogout,
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <Sidebar isOpen={true} onClose={vi.fn()} />
        </MemoryRouter>
      );

      expect(screen.getByRole('link', { name: /users/i })).toBeDefined();
    });

    it('applies active class to the current route', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Sidebar isOpen={true} onClose={vi.fn()} />
        </MemoryRouter>
      );

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      expect(dashboardLink.className).toContain('active');

      const donorsLink = screen.getByRole('link', { name: /donors/i });
      expect(donorsLink.className).not.toContain('active');
    });

    it('displays user meta details in sidebar footer', () => {
      render(
        <MemoryRouter>
          <Sidebar isOpen={true} onClose={vi.fn()} />
        </MemoryRouter>
      );

      expect(screen.getByTestId('sidebar-user-name').textContent).toBe('Jane Donor');
      expect(screen.getByTestId('sidebar-user-role').textContent).toBe('donor');
    });
  });

  describe('Topbar & Mobile Toggle', () => {
    it('displays authenticated user badge and handles logout trigger', () => {
      render(
        <MemoryRouter>
          <Topbar onToggleSidebar={vi.fn()} />
        </MemoryRouter>
      );

      expect(screen.getByTestId('topbar-user-name').textContent).toBe('Jane Donor');
      expect(screen.getByTestId('topbar-user-role').textContent).toBe('donor');

      const logoutBtn = screen.getByTestId('logout-btn');
      fireEvent.click(logoutBtn);
      expect(mockLogout).toHaveBeenCalledOnce();
    });

    it('triggers mobile sidebar toggle when mobile button is clicked', () => {
      const toggleMock = vi.fn();
      render(
        <MemoryRouter>
          <Topbar onToggleSidebar={toggleMock} />
        </MemoryRouter>
      );

      const toggleBtn = screen.getByTestId('sidebar-toggle-btn');
      fireEvent.click(toggleBtn);
      expect(toggleMock).toHaveBeenCalledOnce();
    });
  });

  describe('DashboardLayout Integration', () => {
    it('renders Sidebar, Topbar, and children together in DashboardLayout', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <DashboardLayout>
            <div data-testid="test-child">Layout Child Content</div>
          </DashboardLayout>
        </MemoryRouter>
      );

      expect(screen.getByTestId('sidebar')).toBeDefined();
      expect(screen.getByTestId('topbar')).toBeDefined();
      expect(screen.getByTestId('test-child').textContent).toBe('Layout Child Content');
    });

    it('toggles mobile sidebar open state and backdrop', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <DashboardLayout>
            <div>Dashboard Content</div>
          </DashboardLayout>
        </MemoryRouter>
      );

      const sidebar = screen.getByTestId('sidebar');
      expect(sidebar.className).not.toContain('open');

      // Click mobile toggle in Topbar
      const toggleBtn = screen.getByTestId('sidebar-toggle-btn');
      fireEvent.click(toggleBtn);

      expect(sidebar.className).toContain('open');
      const backdrop = screen.getByTestId('sidebar-backdrop');
      expect(backdrop).toBeDefined();

      // Click backdrop to close
      fireEvent.click(backdrop);
      expect(sidebar.className).not.toContain('open');
    });
  });

  describe('Protected Dashboard Route Access', () => {
    it('allows access to dashboard when user is authenticated', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Dashboard />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByTestId('dashboard-page')).toBeDefined();
      expect(screen.getByTestId('welcome-message').textContent).toContain('Jane Donor');
    });

    it('redirects to /login when user is unauthenticated', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: null,
        isAuthenticated: false,
        loading: false,
        logout: mockLogout,
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Dashboard />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<div>Login Page Mock</div>} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.queryByTestId('dashboard-page')).toBeNull();
      expect(screen.getByText('Login Page Mock')).toBeDefined();
    });

    it('renders developer branding credit and logo in DashboardLayout', () => {
      render(
        <MemoryRouter>
          <DashboardLayout>
            <div>Dashboard Content</div>
          </DashboardLayout>
        </MemoryRouter>
      );

      expect(screen.getByTestId('developer-branding')).toBeDefined();
      expect(screen.getByText('Developed by')).toBeDefined();
      expect(screen.getByText('Kyaw Moe Naing')).toBeDefined();
      expect(screen.getByTestId('developer-logo')).toBeDefined();
    });
  });
});
