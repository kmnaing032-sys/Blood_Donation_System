import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Profile } from '../Profile';
import profileService from '../../services/profileService';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../services/profileService', () => ({
  getMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
  default: {
    getMyProfile: vi.fn(),
    updateMyProfile: vi.fn(),
  },
}));

describe('Profile Page Component', () => {
  const mockAuthUser = {
    id: 15,
    full_name: 'John Donor',
    email: 'john.donor@example.com',
    role: 'donor',
    is_active: true,
  };

  let mockUpdateCurrentUser;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateCurrentUser = vi.fn();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAuthUser,
      isAuthenticated: true,
      loading: false,
      updateCurrentUser: mockUpdateCurrentUser,
    });
  });

  it('renders loading state initially', () => {
    profileService.getMyProfile.mockReturnValue(new Promise(() => {}));
    render(<Profile />);

    expect(screen.getByTestId('profile-loading')).toBeDefined();
    expect(screen.getByText(/loading your profile/i)).toBeDefined();
  });

  it('renders profile details correctly after loading', async () => {
    profileService.getMyProfile.mockResolvedValueOnce(mockAuthUser);
    render(<Profile />);

    await waitFor(() => {
      expect(screen.queryByTestId('profile-loading')).toBeNull();
    });

    expect(screen.getByTestId('profile-name-display').textContent).toBe('John Donor');
    expect(screen.getByTestId('profile-role-display').textContent).toBe('DONOR');
    expect(screen.getByTestId('profile-status-display').textContent).toBe('Active');
    expect(screen.getByTestId('info-full-name').textContent).toBe('John Donor');
    expect(screen.getByTestId('info-email').textContent).toBe('john.donor@example.com');
  });

  it('displays friendly error message and retry button when profile loading fails', async () => {
    profileService.getMyProfile.mockRejectedValueOnce(new Error('Network error'));
    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByTestId('profile-error')).toBeDefined();
    });

    expect(screen.getByText(/unable to load profile/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /retry/i })).toBeDefined();

    // Test retry
    profileService.getMyProfile.mockResolvedValueOnce(mockAuthUser);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('profile-error')).toBeNull();
    });
    expect(screen.getByTestId('info-full-name').textContent).toBe('John Donor');
  });

  it('switches to edit mode and cancels edit mode correctly', async () => {
    profileService.getMyProfile.mockResolvedValueOnce(mockAuthUser);
    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByTestId('profile-view-section')).toBeDefined();
    });

    const editBtn = screen.getByTestId('edit-profile-btn');
    fireEvent.click(editBtn);

    expect(screen.getByTestId('profile-edit-form')).toBeDefined();
    expect(screen.getByTestId('input-full-name').value).toBe('John Donor');
    expect(screen.getByTestId('input-email').value).toBe('john.donor@example.com');

    // Cancel edit
    const cancelBtn = screen.getByTestId('cancel-edit-btn');
    fireEvent.click(cancelBtn);

    expect(screen.queryByTestId('profile-edit-form')).toBeNull();
    expect(screen.getByTestId('profile-view-section')).toBeDefined();
  });

  it('validates required fields in edit form', async () => {
    const user = userEvent.setup();
    profileService.getMyProfile.mockResolvedValueOnce(mockAuthUser);
    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-profile-btn')).toBeDefined();
    });

    await user.click(screen.getByTestId('edit-profile-btn'));

    const nameInput = screen.getByTestId('input-full-name');
    const emailInput = screen.getByTestId('input-email');

    await user.clear(nameInput);
    await user.clear(emailInput);
    await user.click(screen.getByTestId('save-profile-btn'));

    expect(screen.getByTestId('error-full-name').textContent).toMatch(/full name is required/i);
    expect(screen.getByTestId('error-email').textContent).toMatch(/email address is required/i);
    expect(profileService.updateMyProfile).not.toHaveBeenCalled();
  });

  it('validates invalid email format', async () => {
    const user = userEvent.setup();
    profileService.getMyProfile.mockResolvedValueOnce(mockAuthUser);
    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-profile-btn')).toBeDefined();
    });

    await user.click(screen.getByTestId('edit-profile-btn'));

    const emailInput = screen.getByTestId('input-email');
    await user.clear(emailInput);
    await user.type(emailInput, 'notanemail');
    await user.click(screen.getByTestId('save-profile-btn'));

    expect(screen.getByTestId('error-email').textContent).toMatch(/valid email address/i);
    expect(profileService.updateMyProfile).not.toHaveBeenCalled();
  });

  it('updates profile successfully and synchronizes AuthContext', async () => {
    const user = userEvent.setup();
    profileService.getMyProfile.mockResolvedValueOnce(mockAuthUser);
    const updatedProfile = {
      ...mockAuthUser,
      full_name: 'John Updated',
      email: 'john.updated@example.com',
    };
    profileService.updateMyProfile.mockResolvedValueOnce(updatedProfile);

    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-profile-btn')).toBeDefined();
    });

    await user.click(screen.getByTestId('edit-profile-btn'));

    const nameInput = screen.getByTestId('input-full-name');
    const emailInput = screen.getByTestId('input-email');

    await user.clear(nameInput);
    await user.type(nameInput, 'John Updated');
    await user.clear(emailInput);
    await user.type(emailInput, 'john.updated@example.com');

    await user.click(screen.getByTestId('save-profile-btn'));

    await waitFor(() => {
      expect(profileService.updateMyProfile).toHaveBeenCalledWith(15, {
        full_name: 'John Updated',
        email: 'john.updated@example.com',
      });
    });

    expect(mockUpdateCurrentUser).toHaveBeenCalledWith(expect.objectContaining({
      full_name: 'John Updated',
      email: 'john.updated@example.com',
    }));

    expect(screen.getByTestId('profile-notification').textContent).toMatch(/profile updated successfully/i);
  });

  it('displays API error notification when update fails', async () => {
    const user = userEvent.setup();
    profileService.getMyProfile.mockResolvedValueOnce(mockAuthUser);
    profileService.updateMyProfile.mockRejectedValueOnce({
      response: { data: { detail: 'Email already registered' } },
    });

    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByTestId('edit-profile-btn')).toBeDefined();
    });

    await user.click(screen.getByTestId('edit-profile-btn'));
    await user.click(screen.getByTestId('save-profile-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('profile-notification').textContent).toMatch(/email already registered/i);
    });
  });

  it('displays password and security section', async () => {
    profileService.getMyProfile.mockResolvedValueOnce(mockAuthUser);
    render(<Profile />);

    await waitFor(() => {
      expect(screen.getByTestId('profile-security-section')).toBeDefined();
    });

    expect(screen.getByTestId('input-current-password')).toBeDefined();
    expect(screen.getByTestId('input-new-password')).toBeDefined();
  });
});
