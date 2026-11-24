import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Users } from '../Users';
import userService from '../../services/userService';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../services/userService', () => {
  return {
    getUsers: vi.fn(),
    getUserById: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    toggleUserStatus: vi.fn(),
    updateUserRole: vi.fn(),
    deleteUser: vi.fn(),
    USER_ROLES: ['admin', 'staff', 'donor', 'user'],
    default: {
      getUsers: vi.fn(),
      getUserById: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      toggleUserStatus: vi.fn(),
      updateUserRole: vi.fn(),
      deleteUser: vi.fn(),
      USER_ROLES: ['admin', 'staff', 'donor', 'user'],
    },
  };
});

describe('Users Page Component', () => {
  const mockAdminUser = {
    id: 1,
    email: 'admin@bloodcare.org',
    full_name: 'Super Admin',
    role: 'admin',
  };

  const mockStaffUser = {
    id: 2,
    email: 'staff@bloodcare.org',
    full_name: 'Staff Person',
    role: 'staff',
  };

  const mockUsersList = [
    {
      id: 1,
      full_name: 'Super Admin',
      email: 'admin@bloodcare.org',
      role: 'admin',
      is_active: true,
    },
    {
      id: 2,
      full_name: 'Doctor Dave',
      email: 'dave@hospital.org',
      role: 'staff',
      is_active: true,
    },
    {
      id: 3,
      full_name: 'Jane Donor',
      email: 'jane@example.com',
      role: 'donor',
      is_active: false,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminUser,
      isAuthenticated: true,
      loading: false,
    });
  });

  it('renders loading state initially', () => {
    userService.getUsers.mockReturnValue(new Promise(() => {}));

    render(<Users />);

    expect(screen.getByTestId('users-loading')).toBeDefined();
    expect(screen.getByText(/Loading user accounts/i)).toBeDefined();
  });

  it('renders user list table successfully', async () => {
    userService.getUsers.mockResolvedValueOnce(mockUsersList);

    render(<Users />);

    await waitFor(() => {
      expect(screen.queryByTestId('users-loading')).toBeNull();
    });

    expect(screen.getByTestId('users-table')).toBeDefined();
    expect(screen.getByText('Super Admin')).toBeDefined();
    expect(screen.getByText('Doctor Dave')).toBeDefined();
    expect(screen.getByText('Jane Donor')).toBeDefined();

    // Check Roles displayed
    expect(screen.getByTestId('badge-role-1').textContent).toBe('ADMIN');
    expect(screen.getByTestId('badge-role-2').textContent).toBe('STAFF');
    expect(screen.getByTestId('badge-role-3').textContent).toBe('DONOR');

    // Check Account Statuses displayed
    expect(screen.getByTestId('badge-status-1').textContent).toBe('ACTIVE');
    expect(screen.getByTestId('badge-status-3').textContent).toBe('INACTIVE');
  });

  it('renders empty state when no users match search filter', async () => {
    userService.getUsers.mockResolvedValueOnce(mockUsersList);

    render(<Users />);

    await waitFor(() => {
      expect(screen.getByTestId('input-user-search')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('input-user-search'), {
      target: { value: 'Nonexistent Person' },
    });

    expect(screen.getByTestId('users-empty')).toBeDefined();
    expect(screen.getByText(/No Users Found/i)).toBeDefined();
  });

  it('filters users by system role', async () => {
    userService.getUsers.mockResolvedValueOnce(mockUsersList);

    render(<Users />);

    await waitFor(() => {
      expect(screen.getByTestId('select-filter-role')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('select-filter-role'), {
      target: { value: 'staff' },
    });

    expect(screen.getByText('Doctor Dave')).toBeDefined();
    expect(screen.queryByText('Super Admin')).toBeNull();
    expect(screen.queryByText('Jane Donor')).toBeNull();
  });

  it('filters users by active status', async () => {
    userService.getUsers.mockResolvedValueOnce(mockUsersList);

    render(<Users />);

    await waitFor(() => {
      expect(screen.getByTestId('select-filter-status')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('select-filter-status'), {
      target: { value: 'inactive' },
    });

    expect(screen.getByText('Jane Donor')).toBeDefined();
    expect(screen.queryByText('Super Admin')).toBeNull();
    expect(screen.queryByText('Doctor Dave')).toBeNull();
  });

  it('renders error state on API failure (such as 403 Forbidden)', async () => {
    userService.getUsers.mockRejectedValueOnce({
      response: { status: 403, data: { detail: 'Forbidden' } },
    });

    render(<Users />);

    await waitFor(() => {
      expect(screen.queryByTestId('users-loading')).toBeNull();
    });

    expect(screen.getByTestId('users-error')).toBeDefined();
    expect(
      screen.getByText(/Access denied: You must be an administrator/i)
    ).toBeDefined();
  });

  it('opens and submits Create User form modal', async () => {
    userService.getUsers.mockResolvedValue(mockUsersList);
    userService.createUser.mockResolvedValueOnce({
      id: 10,
      full_name: 'Dr. Sarah Connor',
      email: 'sarah@hospital.org',
      role: 'staff',
      is_active: true,
    });

    render(<Users />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-create-user')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-create-user'));

    expect(screen.getByTestId('user-form-modal')).toBeDefined();

    fireEvent.change(screen.getByTestId('input-user-fullname'), {
      target: { value: 'Dr. Sarah Connor' },
    });
    fireEvent.change(screen.getByTestId('input-user-email'), {
      target: { value: 'sarah@hospital.org' },
    });
    fireEvent.change(screen.getByTestId('input-user-password'), {
      target: { value: 'HospitalPass123' },
    });
    fireEvent.change(screen.getByTestId('select-user-role'), {
      target: { value: 'staff' },
    });

    fireEvent.click(screen.getByTestId('btn-submit-user'));

    await waitFor(() => {
      expect(userService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Dr. Sarah Connor',
          email: 'sarah@hospital.org',
          password: 'HospitalPass123',
          role: 'staff',
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('feedback-banner').textContent).toContain(
        'User account for Dr. Sarah Connor created successfully'
      );
    });
  });

  it('opens and submits Edit User form modal', async () => {
    userService.getUsers.mockResolvedValue(mockUsersList);
    userService.updateUser.mockResolvedValueOnce({
      ...mockUsersList[1],
      full_name: 'Dr. David Miller',
      role: 'staff',
    });

    render(<Users />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-edit-user-2')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-edit-user-2'));

    expect(screen.getByTestId('user-form-modal')).toBeDefined();
    expect(screen.getByTestId('input-user-fullname').value).toBe('Doctor Dave');

    fireEvent.change(screen.getByTestId('input-user-fullname'), {
      target: { value: 'Dr. David Miller' },
    });

    fireEvent.click(screen.getByTestId('btn-submit-user'));

    await waitFor(() => {
      expect(userService.updateUser).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          full_name: 'Dr. David Miller',
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('feedback-banner').textContent).toContain(
        'User Dr. David Miller updated successfully'
      );
    });
  });

  it('opens user detail view modal', async () => {
    userService.getUsers.mockResolvedValue(mockUsersList);

    render(<Users />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-view-user-2')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-view-user-2'));

    expect(screen.getByTestId('user-detail-modal')).toBeDefined();
    expect(screen.getByTestId('detail-user-name').textContent).toBe('Doctor Dave');
    expect(screen.getByTestId('detail-user-email').textContent).toBe('dave@hospital.org');
    expect(screen.getByTestId('detail-user-role').textContent).toBe('STAFF');
    expect(screen.getByTestId('detail-user-status').textContent).toBe('ACTIVE');
  });

  it('toggles user active status directly via button', async () => {
    userService.getUsers.mockResolvedValue(mockUsersList);
    userService.toggleUserStatus.mockResolvedValueOnce({
      ...mockUsersList[2],
      is_active: true,
    });

    render(<Users />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-toggle-status-3')).toBeDefined();
    });

    // User #3 is inactive, button text is "Activate"
    expect(screen.getByTestId('btn-toggle-status-3').textContent).toBe('Activate');

    fireEvent.click(screen.getByTestId('btn-toggle-status-3'));

    await waitFor(() => {
      expect(userService.toggleUserStatus).toHaveBeenCalledWith(3, true);
    });

    await waitFor(() => {
      expect(screen.getByTestId('feedback-banner').textContent).toContain(
        'Account for Jane Donor is now ACTIVE'
      );
    });
  });

  it('opens delete confirmation modal and confirms deletion', async () => {
    userService.getUsers.mockResolvedValue(mockUsersList);
    userService.deleteUser.mockResolvedValueOnce({ message: 'User deleted successfully' });

    render(<Users />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-delete-user-3')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-delete-user-3'));

    expect(screen.getByTestId('delete-user-modal')).toBeDefined();
    expect(screen.getByText(/Are you sure you want to permanently delete/i)).toBeDefined();

    fireEvent.click(screen.getByTestId('btn-confirm-delete-user'));

    await waitFor(() => {
      expect(userService.deleteUser).toHaveBeenCalledWith(3);
    });

    await waitFor(() => {
      expect(screen.getByTestId('feedback-banner').textContent).toContain(
        'User Jane Donor was deleted successfully'
      );
    });

    // Verify row 3 was removed from the table in state
    expect(screen.queryByTestId('user-row-3')).toBeNull();
  });

  it('keeps user in table and displays error banner when deletion fails', async () => {
    userService.getUsers.mockResolvedValue(mockUsersList);
    userService.deleteUser.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          success: false,
          message: 'Cannot delete user account: this user has associated donation records',
        },
      },
    });

    render(<Users />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-delete-user-3')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-delete-user-3'));
    expect(screen.getByTestId('delete-user-modal')).toBeDefined();

    fireEvent.click(screen.getByTestId('btn-confirm-delete-user'));

    await waitFor(() => {
      expect(userService.deleteUser).toHaveBeenCalledWith(3);
    });

    await waitFor(() => {
      expect(screen.getByTestId('feedback-banner').textContent).toContain(
        'Cannot delete user account: this user has associated donation records'
      );
    });

    // Row must still be visible in table
    expect(screen.getByTestId('user-row-3')).toBeDefined();
    expect(screen.getAllByText('Jane Donor').length).toBeGreaterThanOrEqual(1);
  });

  it('cancels delete confirmation modal without calling deleteUser API', async () => {
    userService.getUsers.mockResolvedValue(mockUsersList);

    render(<Users />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-delete-user-3')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-delete-user-3'));
    expect(screen.getByTestId('delete-user-modal')).toBeDefined();

    // Click Cancel button
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByTestId('delete-user-modal')).toBeNull();
    expect(userService.deleteUser).not.toHaveBeenCalled();
    expect(screen.getByTestId('user-row-3')).toBeDefined();
  });

  it('hides destructive and role modification actions for non-admin users', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockStaffUser,
      isAuthenticated: true,
      loading: false,
    });

    userService.getUsers.mockResolvedValue(mockUsersList);

    render(<Users />);

    await waitFor(() => {
      expect(screen.queryByTestId('users-loading')).toBeNull();
    });

    expect(screen.queryByTestId('btn-create-user')).toBeNull();
    expect(screen.queryByTestId('btn-edit-user-2')).toBeNull();
    expect(screen.queryByTestId('btn-toggle-status-2')).toBeNull();
    expect(screen.queryByTestId('btn-delete-user-2')).toBeNull();
  });
});
