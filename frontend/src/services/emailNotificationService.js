import apiClient from '../api/axios';
import { API_ENDPOINTS } from '../api/endpoints';

/**
 * Service for Email Notifications, User Email Preferences and Safe SMTP Status.
 */
export const emailNotificationService = {
  /**
   * Fetch authenticated user's email preferences.
   * Calls GET /api/v1/email-preferences/me
   */
  getMyPreferences: async () => {
    const response = await apiClient.get(API_ENDPOINTS.EMAIL_PREFERENCES.ME);
    return response.data;
  },

  /**
   * Update authenticated user's email preferences.
   * Calls PATCH /api/v1/email-preferences/me
   */
  updateMyPreferences: async (preferences) => {
    const response = await apiClient.patch(API_ENDPOINTS.EMAIL_PREFERENCES.ME, preferences);
    return response.data;
  },

  /**
   * Fetch safe SMTP status (Admin only).
   * Calls GET /api/v1/email-preferences/smtp-status
   */
  getSmtpStatus: async () => {
    const response = await apiClient.get(API_ENDPOINTS.EMAIL_PREFERENCES.SMTP_STATUS);
    return response.data;
  },

  /**
   * Fetch email delivery logs (Admin only).
   * Calls GET /api/v1/email-preferences/logs
   */
  getEmailDeliveryLogs: async (params = {}) => {
    const response = await apiClient.get(API_ENDPOINTS.EMAIL_PREFERENCES.LOGS, { params });
    return response.data;
  },
};

export default emailNotificationService;
