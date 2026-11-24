import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Profile from '../Profile';
import profileService from '../../services/profileService';
import emailNotificationService from '../../services/emailNotificationService';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, full_name: 'Test Donor', email: 'donor@example.com', role: 'donor' },
    updateCurrentUser: vi.fn(),
  }),
}));

vi.mock('../../services/profileService');
vi.mock('../../services/emailNotificationService');

describe('Profile - Email Preferences Component (Step 1.24)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    profileService.getMyProfile.mockResolvedValue({
      id: 1,
      full_name: 'Test Donor',
      email: 'donor@example.com',
      role: 'donor',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    });

    emailNotificationService.getMyPreferences.mockResolvedValue({
      id: 10,
      user_id: 1,
      email_notifications_enabled: true,
      notify_donor_events: true,
      notify_donation_events: true,
      notify_stock_events: false,
      notify_request_events: true,
      updated_at: '2026-11-22T00:00:00Z',
    });
  });

  it('renders email notification preferences correctly', async () => {
    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('email-preferences-card')).toBeDefined();
    });

    expect(screen.getByText('Email Notification Preferences')).toBeDefined();
    expect(screen.getByText('Global Email Notifications')).toBeDefined();
    expect(screen.getByText('Blood Stock Alerts')).toBeDefined();

    const masterToggle = screen.getByTestId('pref-master-toggle');
    expect(masterToggle.checked).toBe(true);

    const stockToggle = screen.getByTestId('pref-stock-toggle');
    expect(stockToggle.checked).toBe(false);
  });

  it('toggles email preference and updates state', async () => {
    emailNotificationService.updateMyPreferences.mockResolvedValue({
      id: 10,
      user_id: 1,
      email_notifications_enabled: true,
      notify_donor_events: true,
      notify_donation_events: true,
      notify_stock_events: true,
      notify_request_events: true,
      updated_at: '2026-11-22T00:00:00Z',
    });

    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('pref-stock-toggle')).toBeDefined();
    });

    const stockToggle = screen.getByTestId('pref-stock-toggle');
    fireEvent.click(stockToggle);

    await waitFor(() => {
      expect(emailNotificationService.updateMyPreferences).toHaveBeenCalledWith({
        notify_stock_events: true,
      });
      expect(screen.getByText('Email preferences updated.')).toBeDefined();
    });
  });

  it('handles error when preference update fails and reverts state', async () => {
    emailNotificationService.updateMyPreferences.mockRejectedValue({
      response: { data: { detail: 'Network connectivity failed' } },
    });

    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('pref-stock-toggle')).toBeDefined();
    });

    const stockToggle = screen.getByTestId('pref-stock-toggle');
    expect(stockToggle.checked).toBe(false);

    fireEvent.click(stockToggle);

    await waitFor(() => {
      expect(screen.getByText('Network connectivity failed')).toBeDefined();
      expect(stockToggle.checked).toBe(false);
    });
  });
});
