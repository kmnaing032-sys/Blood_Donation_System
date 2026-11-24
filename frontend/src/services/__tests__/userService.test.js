import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../../api/axios';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  toggleUserStatus,
  updateUserRole,
  deleteUser,
} from '../userService';

vi.mock('../../api/axios');

describe('userService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUsers', () => {
    it('calls GET /users/ and returns list of users', async () => {
      const mockUsers = [
        { id: 1, full_name: 'Admin User', email: 'admin@bloodcare.org', role: 'admin', is_active: true },
        { id: 2, full_name: 'Staff User', email: 'staff@bloodcare.org', role: 'staff', is_active: true },
      ];
      apiClient.get.mockResolvedValueOnce({ data: mockUsers });

      const result = await getUsers();

      expect(apiClient.get).toHaveBeenCalledWith('/users/');
      expect(result).toEqual(mockUsers);
    });
  });

  describe('getUserById', () => {
    it('calls GET /users/{id}', async () => {
      const mockUser = { id: 3, full_name: 'John Doe', email: 'john@example.com', role: 'donor', is_active: true };
      apiClient.get.mockResolvedValueOnce({ data: mockUser });

      const result = await getUserById(3);

      expect(apiClient.get).toHaveBeenCalledWith('/users/3');
      expect(result).toEqual(mockUser);
    });
  });

  describe('createUser', () => {
    it('calls POST /auth/register with user credentials', async () => {
      const newUser = {
        full_name: ' Alice Wonder ',
        email: ' Alice@Example.com ',
        password: 'Password123',
      };
      const created = { id: 10, full_name: 'Alice Wonder', email: 'alice@example.com', role: 'donor', is_active: true };
      apiClient.post.mockResolvedValueOnce({ data: created });

      const result = await createUser(newUser);

      expect(apiClient.post).toHaveBeenCalledWith('/auth/register', {
        full_name: 'Alice Wonder',
        email: 'alice@example.com',
        password: 'Password123',
      });
      expect(result).toEqual(created);
    });

    it('updates role via PATCH if non-default role specified', async () => {
      const newUser = {
        full_name: 'Staff Person',
        email: 'staff@example.com',
        password: 'Password123',
        role: 'staff',
      };
      const registered = { id: 12, full_name: 'Staff Person', email: 'staff@example.com', role: 'donor', is_active: true };
      const roleUpdated = { ...registered, role: 'staff' };

      apiClient.post.mockResolvedValueOnce({ data: registered });
      apiClient.patch.mockResolvedValueOnce({ data: roleUpdated });

      const result = await createUser(newUser);

      expect(apiClient.post).toHaveBeenCalledWith('/auth/register', expect.any(Object));
      expect(apiClient.patch).toHaveBeenCalledWith('/users/12', { role: 'staff' });
      expect(result.role).toBe('staff');
    });
  });

  describe('updateUser', () => {
    it('calls PATCH /users/{id} with partial update fields', async () => {
      const updateData = {
        full_name: ' Johnathan Doe ',
        email: ' NewEmail@example.com ',
        role: 'staff',
        is_active: false,
      };
      const updated = { id: 5, full_name: 'Johnathan Doe', email: 'newemail@example.com', role: 'staff', is_active: false };
      apiClient.patch.mockResolvedValueOnce({ data: updated });

      const result = await updateUser(5, updateData);

      expect(apiClient.patch).toHaveBeenCalledWith('/users/5', {
        full_name: 'Johnathan Doe',
        email: 'newemail@example.com',
        role: 'staff',
        is_active: false,
      });
      expect(result).toEqual(updated);
    });
  });

  describe('toggleUserStatus & updateUserRole', () => {
    it('toggleUserStatus delegates to updateUser with is_active flag', async () => {
      apiClient.patch.mockResolvedValueOnce({ data: { id: 1, is_active: false } });

      const result = await toggleUserStatus(1, false);

      expect(apiClient.patch).toHaveBeenCalledWith('/users/1', { is_active: false });
      expect(result.is_active).toBe(false);
    });

    it('updateUserRole delegates to updateUser with role parameter', async () => {
      apiClient.patch.mockResolvedValueOnce({ data: { id: 1, role: 'admin' } });

      const result = await updateUserRole(1, 'admin');

      expect(apiClient.patch).toHaveBeenCalledWith('/users/1', { role: 'admin' });
      expect(result.role).toBe('admin');
    });
  });

  describe('deleteUser', () => {
    it('calls DELETE /users/{id}', async () => {
      apiClient.delete.mockResolvedValueOnce({ data: { message: 'User deleted successfully' } });

      const result = await deleteUser(2);

      expect(apiClient.delete).toHaveBeenCalledWith('/users/2');
      expect(result.message).toBe('User deleted successfully');
    });
  });
});
