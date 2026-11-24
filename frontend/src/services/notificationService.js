/**
 * Notification Service
 *
 * Interacts with FastAPI backend notification endpoints:
 *   GET    /api/v1/notifications/
 *   GET    /api/v1/notifications/unread-count
 *   PATCH  /api/v1/notifications/{id}/read
 *   POST   /api/v1/notifications/read-all
 *   DELETE /api/v1/notifications/{id}
 */

import apiClient from '../api/axios';
import { API_ENDPOINTS } from '../api/endpoints';

export const NOTIFICATIONS_SUPPORTED = true;

/**
 * Fetch paginated notifications for the current authenticated user.
 * @param {number} skip
 * @param {number} limit
 * @returns {Promise<{ items: Array, total: number, unread_count: number, supported: boolean }>}
 */
export async function getNotifications(skip = 0, limit = 50) {
  const response = await apiClient.get(API_ENDPOINTS.NOTIFICATIONS.LIST, {
    params: { skip, limit },
  });
  return {
    ...response.data,
    supported: true,
  };
}

/**
 * Fetch unread count for the current authenticated user.
 * @returns {Promise<number>}
 */
export async function getUnreadCount() {
  const response = await apiClient.get(API_ENDPOINTS.NOTIFICATIONS.UNREAD_COUNT);
  return response.data?.unread_count ?? 0;
}

/**
 * Mark a single notification as read.
 * @param {number} id
 * @returns {Promise<Object>}
 */
export async function markAsRead(id) {
  const response = await apiClient.patch(API_ENDPOINTS.NOTIFICATIONS.MARK_READ(id));
  return response.data;
}

/**
 * Mark all notifications as read for current user.
 * @returns {Promise<{ message: string, updated_count: number }>}
 */
export async function markAllAsRead() {
  const response = await apiClient.post(API_ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ);
  return response.data;
}

/**
 * Delete a single notification.
 * @param {number} id
 * @returns {Promise<{ message: string }>}
 */
export async function deleteNotification(id) {
  const response = await apiClient.delete(API_ENDPOINTS.NOTIFICATIONS.DELETE(id));
  return response.data;
}

const notificationService = {
  NOTIFICATIONS_SUPPORTED,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};

export default notificationService;
