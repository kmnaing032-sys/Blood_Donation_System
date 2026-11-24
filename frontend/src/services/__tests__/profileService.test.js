import { describe, it, expect, vi, beforeEach } from 'vitest';
import profileService, { getMyProfile, updateMyProfile } from '../profileService';
import apiClient from '../../api/axios';
import { API_ENDPOINTS } from '../../api/endpoints';

vi.mock('../../api/axios', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('profileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMyProfile', () => {
    it('fetches current user profile via GET /auth/me', async () => {
      const mockUser = {
        id: 10,
        full_name: 'Jane Doe',
        email: 'jane@example.com',
        role: 'donor',
        is_active: true,
      };

      apiClient.get.mockResolvedValueOnce({ data: mockUser });

      const result = await getMyProfile();

      expect(apiClient.get).toHaveBeenCalledTimes(1);
      expect(apiClient.get).toHaveBeenCalledWith(API_ENDPOINTS.AUTH.ME);
      expect(result).toEqual(mockUser);
    });

    it('propagates error when GET /auth/me fails', async () => {
      apiClient.get.mockRejectedValueOnce(new Error('Unauthorized'));

      await expect(getMyProfile()).rejects.toThrow('Unauthorized');
      expect(apiClient.get).toHaveBeenCalledWith(API_ENDPOINTS.AUTH.ME);
    });
  });

  describe('updateMyProfile', () => {
    it('updates allowed profile fields via PATCH /users/{id}', async () => {
      const updatedUser = {
        id: 10,
        full_name: 'Jane Smith',
        email: 'jane.smith@example.com',
        role: 'donor',
        is_active: true,
      };

      apiClient.patch.mockResolvedValueOnce({ data: updatedUser });

      const result = await updateMyProfile(10, {
        full_name: '  Jane Smith  ',
        email: '  Jane.Smith@example.com ',
      });

      expect(apiClient.patch).toHaveBeenCalledTimes(1);
      expect(apiClient.patch).toHaveBeenCalledWith(API_ENDPOINTS.USERS.UPDATE(10), {
        full_name: 'Jane Smith',
        email: 'jane.smith@example.com',
      });
      expect(result).toEqual(updatedUser);
    });

    it('throws an error if userId is missing', async () => {
      await expect(updateMyProfile(null, { full_name: 'Jane' })).rejects.toThrow(
        'User ID is required to update profile.'
      );
      expect(apiClient.patch).not.toHaveBeenCalled();
    });

    it('only sends provided defined fields', async () => {
      apiClient.patch.mockResolvedValueOnce({
        data: { id: 10, full_name: 'Jane Only', email: 'old@example.com' },
      });

      await updateMyProfile(10, { full_name: 'Jane Only' });

      expect(apiClient.patch).toHaveBeenCalledWith(API_ENDPOINTS.USERS.UPDATE(10), {
        full_name: 'Jane Only',
      });
    });

    it('propagates API error on failed update', async () => {
      const errorResponse = {
        response: { status: 422, data: { detail: 'Invalid email' } },
      };
      apiClient.patch.mockRejectedValueOnce(errorResponse);

      await expect(updateMyProfile(10, { email: 'bad-email' })).rejects.toEqual(errorResponse);
    });
  });
});
