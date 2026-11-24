import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Profile } from '../Profile';
import profileService from '../../services/profileService';
import authService from '../../services/authService';
import emailNotificationService from '../../services/emailNotificationService';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../services/profileService', () => ({
  default: {
    getMyProfile: vi.fn(),
    updateMyProfile: vi.fn(),
  },
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
}));

vi.mock('../../services/authService', () => ({
  default: {
    changePassword: vi.fn(),
  },
  changePassword: vi.fn(),
}));

vi.mock('../../services/emailNotificationService', () => ({
  default: {
    getMyPreferences: vi.fn(),
    updateMyPreferences: vi.fn(),
  },
  getMyPreferences: vi.fn(),
  updateMyPreferences: vi.fn(),
}));

describe('Profile Page - Password Management Section', () => {
  const mockUser = {
    id: 42,
    full_name: 'Sarah Connor',
    email: 'sarah@example.com',
    role: 'donor',
    is_active: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      updateCurrentUser: vi.fn(),
    });
    profileService.getMyProfile.mockResolvedValue(mockUser);
    emailNotificationService.getMyPreferences.mockResolvedValue({
      email_notifications_enabled: true,
      notify_donor_events: true,
      notify_donation_events: true,
      notify_stock_events: true,
      notify_request_events: true,
    });
  });

  it('renders Password & Security section with all inputs and policy checklist', async () => {
    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByTestId('profile-security-section')).toBeDefined();
    });

    expect(screen.getByTestId('input-current-password')).toBeDefined();
    expect(screen.getByTestId('input-new-password')).toBeDefined();
    expect(screen.getByTestId('input-confirm-password')).toBeDefined();
    expect(screen.getByTestId('btn-update-password')).toBeDefined();
    expect(screen.getByText(/8\+ characters/i)).toBeDefined();
    expect(screen.getByText(/1\+ uppercase/i)).toBeDefined();
    expect(screen.getByText(/1\+ symbol/i)).toBeDefined();
  });

  it('toggles password visibility between text and password types', async () => {
    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByTestId('input-current-password')).toBeDefined();
    });

    const currentInput = screen.getByTestId('input-current-password');
    const toggleCurrentBtn = screen.getByTestId('toggle-show-current-password');

    expect(currentInput.getAttribute('type')).toBe('password');
    fireEvent.click(toggleCurrentBtn);
    expect(currentInput.getAttribute('type')).toBe('text');
    fireEvent.click(toggleCurrentBtn);
    expect(currentInput.getAttribute('type')).toBe('password');
  });

  it('displays validation error if required fields are empty or mismatched', async () => {
    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-update-password')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-update-password'));

    expect(screen.getByTestId('error-current-password').textContent).toContain('Current password is required');
    expect(screen.getByTestId('error-new-password').textContent).toContain('New password is required');
    expect(screen.getByTestId('error-confirm-password').textContent).toContain('Confirmation password is required');
  });

  it('displays validation error when new password does not meet strength policy', async () => {
    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-update-password')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('input-current-password'), { target: { value: 'OldPass123!' } });
    fireEvent.change(screen.getByTestId('input-new-password'), { target: { value: 'weakpass' } });
    fireEvent.change(screen.getByTestId('input-confirm-password'), { target: { value: 'weakpass' } });

    fireEvent.click(screen.getByTestId('btn-update-password'));

    expect(screen.getByTestId('error-new-password').textContent).toContain('does not meet all security criteria');
  });

  it('submits change password successfully and clears inputs', async () => {
    authService.changePassword.mockResolvedValueOnce({
      message: 'Password changed successfully.',
    });

    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-update-password')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('input-current-password'), { target: { value: 'OldPass123!' } });
    fireEvent.change(screen.getByTestId('input-new-password'), { target: { value: 'StrongPass456#' } });
    fireEvent.change(screen.getByTestId('input-confirm-password'), { target: { value: 'StrongPass456#' } });

    fireEvent.click(screen.getByTestId('btn-update-password'));

    await waitFor(() => {
      expect(authService.changePassword).toHaveBeenCalledWith(
        'OldPass123!',
        'StrongPass456#',
        'StrongPass456#'
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('password-notification').textContent).toContain('Password changed successfully');
    });

    // Inputs cleared
    expect(screen.getByTestId('input-current-password').value).toBe('');
    expect(screen.getByTestId('input-new-password').value).toBe('');
    expect(screen.getByTestId('input-confirm-password').value).toBe('');
  });

  it('handles backend error gracefully when current password is wrong', async () => {
    authService.changePassword.mockRejectedValueOnce({
      response: { data: { detail: 'Incorrect current password' } },
    });

    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-update-password')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('input-current-password'), { target: { value: 'WrongPass123!' } });
    fireEvent.change(screen.getByTestId('input-new-password'), { target: { value: 'StrongPass456#' } });
    fireEvent.change(screen.getByTestId('input-confirm-password'), { target: { value: 'StrongPass456#' } });

    fireEvent.click(screen.getByTestId('btn-update-password'));

    await waitFor(() => {
      expect(screen.getByTestId('password-notification').textContent).toContain('Incorrect current password');
    });
  });
});
