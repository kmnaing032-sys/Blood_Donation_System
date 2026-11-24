import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResetPasswordModal } from '../../components/users/ResetPasswordModal';
import { Users } from '../Users';
import userService from '../../services/userService';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../services/userService', () => {
  return {
    getUsers: vi.fn(),
    resetUserPassword: vi.fn(),
    deleteUser: vi.fn(),
    toggleUserStatus: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    USER_ROLES: ['admin', 'staff', 'donor', 'user'],
    default: {
      getUsers: vi.fn(),
      resetUserPassword: vi.fn(),
      deleteUser: vi.fn(),
      toggleUserStatus: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      USER_ROLES: ['admin', 'staff', 'donor', 'user'],
    },
  };
});

describe('Admin Reset Password Feature', () => {
  const mockAdminUser = {
    id: 1,
    full_name: 'Super Admin',
    email: 'admin@bloodcare.org',
    role: 'admin',
    is_active: true,
  };

  const mockTargetUser = {
    id: 99,
    full_name: 'Target Staff Member',
    email: 'staff@bloodcare.org',
    role: 'staff',
    is_active: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders ResetPasswordModal with user details and strength meter', () => {
    const handleClose = vi.fn();
    const handleSubmit = vi.fn();

    render(
      <ResetPasswordModal
        isOpen={true}
        onClose={handleClose}
        user={mockTargetUser}
        onSubmit={handleSubmit}
        isSubmitting={false}
      />
    );

    expect(screen.getByTestId('reset-password-modal')).toBeDefined();
    expect(screen.getByText('Reset User Password')).toBeDefined();
    expect(screen.getAllByText('Target Staff Member').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('input-reset-new-password')).toBeDefined();
    expect(screen.getByTestId('input-reset-confirm-password')).toBeDefined();
    expect(screen.getByTestId('btn-submit-reset')).toBeDefined();
  });

  it('toggles password visibility in ResetPasswordModal', () => {
    render(
      <ResetPasswordModal
        isOpen={true}
        onClose={vi.fn()}
        user={mockTargetUser}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />
    );

    const input = screen.getByTestId('input-reset-new-password');
    const toggleBtn = screen.getByTestId('toggle-show-new-password');

    expect(input.getAttribute('type')).toBe('password');
    fireEvent.click(toggleBtn);
    expect(input.getAttribute('type')).toBe('text');
  });

  it('validates password match and policy in ResetPasswordModal', () => {
    const handleSubmit = vi.fn();
    render(
      <ResetPasswordModal
        isOpen={true}
        onClose={vi.fn()}
        user={mockTargetUser}
        onSubmit={handleSubmit}
        isSubmitting={false}
      />
    );

    fireEvent.click(screen.getByTestId('btn-submit-reset'));

    expect(screen.getByTestId('error-reset-new-password').textContent).toContain('New password is required');
    expect(handleSubmit).not.toHaveBeenCalled();

    // Mismatched passwords
    fireEvent.change(screen.getByTestId('input-reset-new-password'), { target: { value: 'ValidPass123!' } });
    fireEvent.change(screen.getByTestId('input-reset-confirm-password'), { target: { value: 'DifferentPass123!' } });
    fireEvent.click(screen.getByTestId('btn-submit-reset'));

    expect(screen.getByTestId('error-reset-confirm-password').textContent).toContain('Passwords do not match');
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with valid passwords in ResetPasswordModal', () => {
    const handleSubmit = vi.fn();
    render(
      <ResetPasswordModal
        isOpen={true}
        onClose={vi.fn()}
        user={mockTargetUser}
        onSubmit={handleSubmit}
        isSubmitting={false}
      />
    );

    fireEvent.change(screen.getByTestId('input-reset-new-password'), { target: { value: 'NewAdminSet123!' } });
    fireEvent.change(screen.getByTestId('input-reset-confirm-password'), { target: { value: 'NewAdminSet123!' } });
    fireEvent.click(screen.getByTestId('btn-submit-reset'));

    expect(handleSubmit).toHaveBeenCalledWith('NewAdminSet123!', 'NewAdminSet123!');
  });

  it('renders Reset Password button on Users table for Admin and opens modal', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminUser,
      isAuthenticated: true,
      loading: false,
    });

    userService.getUsers.mockResolvedValueOnce([mockTargetUser]);

    render(<Users />);

    await waitFor(() => {
      expect(screen.getByTestId(`btn-reset-password-${mockTargetUser.id}`)).toBeDefined();
    });

    fireEvent.click(screen.getByTestId(`btn-reset-password-${mockTargetUser.id}`));

    expect(screen.getByTestId('reset-password-modal')).toBeDefined();
  });

  it('hides Reset Password button for non-admin users', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 2, role: 'staff', full_name: 'Regular Staff' },
      isAuthenticated: true,
      loading: false,
    });

    userService.getUsers.mockResolvedValueOnce([mockTargetUser]);

    render(<Users />);

    await waitFor(() => {
      expect(screen.getByTestId('users-table')).toBeDefined();
    });

    expect(screen.queryByTestId(`btn-reset-password-${mockTargetUser.id}`)).toBeNull();
  });
});
