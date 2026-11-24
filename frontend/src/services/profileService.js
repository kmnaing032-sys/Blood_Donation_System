import apiClient from '../api/axios';
import { API_ENDPOINTS } from '../api/endpoints';

/**
 * Profile Service
 *
 * Interacts with backend user profile operations:
 *   - GET   /api/v1/auth/me      (Retrieve authenticated user's profile)
 *   - PATCH /api/v1/users/{id}   (Update allowed profile fields: full_name, email)
 *
 * Security & Backend Constraints:
 *   - Authenticated user can only update their own profile.
 *   - Regular users CANNOT change their own role or active status (rejected with 403 by backend).
 *   - Password change endpoint does NOT exist in backend and is marked NOT SUPPORTED.
 */

/**
 * Fetch the current authenticated user's profile.
 * Calls GET /api/v1/auth/me (using Bearer token via Axios interceptor).
 *
 * @returns {Promise<{
 *   id: number,
 *   full_name: string,
 *   email: string,
 *   role: string,
 *   is_active: boolean
 * }>}
 */
export const getMyProfile = async () => {
  const response = await apiClient.get(API_ENDPOINTS.AUTH.ME);
  return response.data;
};

/**
 * Update the authenticated user's own profile.
 * Calls PATCH /api/v1/users/{userId} with allowed fields only: full_name and email.
 *
 * @param {number|string} userId
 * @param {Object} profileData
 * @param {string} [profileData.full_name] - User's full name (2 to 100 characters)
 * @param {string} [profileData.email] - User's valid email address
 * @returns {Promise<{
 *   id: number,
 *   full_name: string,
 *   email: string,
 *   role: string,
 *   is_active: boolean
 * }>}
 */
export const updateMyProfile = async (userId, profileData) => {
  if (!userId) {
    throw new Error('User ID is required to update profile.');
  }

  const payload = {};
  if (profileData.full_name !== undefined) {
    payload.full_name = profileData.full_name.trim();
  }
  if (profileData.email !== undefined) {
    payload.email = profileData.email.trim().toLowerCase();
  }

  const response = await apiClient.patch(API_ENDPOINTS.USERS.UPDATE(userId), payload);
  return response.data;
};

export const profileService = {
  getMyProfile,
  updateMyProfile,
};

export default profileService;
