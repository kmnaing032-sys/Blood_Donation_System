import apiClient from '../api/axios';
import { API_ENDPOINTS } from '../api/endpoints';

/**
 * User Service
 *
 * Interacts with backend user management endpoints:
 *   - GET    /api/v1/users/      (admin only - list all users)
 *   - GET    /api/v1/users/{id}  (admin or profile owner)
 *   - PATCH  /api/v1/users/{id}  (admin or profile owner - role/status change requires admin)
 *   - DELETE /api/v1/users/{id}  (admin only - delete user)
 *   - POST   /api/v1/auth/register (user registration)
 */

export const USER_ROLES = ['admin', 'staff', 'donor', 'user'];

/**
 * Fetch all users (Admin only).
 *
 * @returns {Promise<Array<{
 *   id: number,
 *   full_name: string,
 *   email: string,
 *   role: 'admin' | 'staff' | 'donor' | 'user',
 *   is_active: boolean
 * }>>}
 */
export const getUsers = async () => {
  const response = await apiClient.get(API_ENDPOINTS.USERS.LIST);
  return response.data;
};

/**
 * Fetch a single user by ID (Admin or profile owner).
 *
 * @param {number|string} userId
 * @returns {Promise<{
 *   id: number,
 *   full_name: string,
 *   email: string,
 *   role: string,
 *   is_active: boolean
 * }>}
 */
export const getUserById = async (userId) => {
  const response = await apiClient.get(API_ENDPOINTS.USERS.DETAIL(userId));
  return response.data;
};

/**
 * Create a new user account via the registration endpoint.
 *
 * @param {Object} userData
 * @param {string} userData.full_name
 * @param {string} userData.email
 * @param {string} userData.password
 * @param {'admin'|'staff'|'donor'|'user'} [userData.role] - Optional: if admin assigns role, updated via PATCH after creation
 * @returns {Promise<Object>}
 */
export const createUser = async (userData) => {
  const payload = {
    full_name: userData.full_name?.trim(),
    email: userData.email?.trim().toLowerCase(),
    password: userData.password,
  };

  const response = await apiClient.post(API_ENDPOINTS.AUTH.REGISTER, payload);
  let createdUser = response.data;

  // If a specific role other than default donor was chosen, and creator is admin, update it
  if (userData.role && userData.role !== 'donor' && createdUser.id) {
    createdUser = await updateUser(createdUser.id, { role: userData.role });
  }

  return createdUser;
};

/**
 * Update user profile, role, or active status (PATCH /api/v1/users/{id}).
 *
 * @param {number|string} userId
 * @param {Object} updateData
 * @param {string} [updateData.full_name]
 * @param {string} [updateData.email]
 * @param {'admin'|'staff'|'donor'|'user'} [updateData.role]
 * @param {boolean} [updateData.is_active]
 * @returns {Promise<Object>}
 */
export const updateUser = async (userId, updateData) => {
  const payload = {};
  if (updateData.full_name !== undefined) payload.full_name = updateData.full_name?.trim();
  if (updateData.email !== undefined) payload.email = updateData.email?.trim().toLowerCase();
  if (updateData.role !== undefined) payload.role = updateData.role;
  if (updateData.is_active !== undefined) payload.is_active = Boolean(updateData.is_active);

  const response = await apiClient.patch(API_ENDPOINTS.USERS.UPDATE(userId), payload);
  return response.data;
};

/**
 * Convenience helper to activate or deactivate a user account.
 *
 * @param {number|string} userId
 * @param {boolean} isActive
 * @returns {Promise<Object>}
 */
export const toggleUserStatus = async (userId, isActive) => {
  return updateUser(userId, { is_active: isActive });
};

/**
 * Convenience helper to update a user's role.
 *
 * @param {number|string} userId
 * @param {'admin'|'staff'|'donor'|'user'} role
 * @returns {Promise<Object>}
 */
export const updateUserRole = async (userId, role) => {
  return updateUser(userId, { role });
};

/**
 * Delete a user account (Admin only).
 *
 * @param {number|string} userId
 * @returns {Promise<{ message: string }>}
 */
export const deleteUser = async (userId) => {
  const response = await apiClient.delete(API_ENDPOINTS.USERS.DELETE(userId));
  return response.data;
};

/**
 * Reset a user's password (Admin only).
 *
 * POST /users/{id}/reset-password
 * Body: { new_password, confirm_password }
 *
 * @param {number|string} userId - Target user ID
 * @param {string} newPassword
 * @param {string} confirmPassword
 * @returns {Promise<{ message: string }>}
 */
export const resetUserPassword = async (userId, newPassword, confirmPassword) => {
  const response = await apiClient.post(API_ENDPOINTS.USERS.RESET_PASSWORD(userId), {
    new_password: newPassword,
    confirm_password: confirmPassword,
  });
  return response.data;
};

export default {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  toggleUserStatus,
  updateUserRole,
  deleteUser,
  resetUserPassword,
  USER_ROLES,
};
