import apiClient from '../api/axios';

/**
 * Service for communicating with System Settings endpoints.
 */
export const systemSettingService = {
  /**
   * Get all settings grouped by category
   * @returns {Promise<{ settings: Record<string, Array> }>}
   */
  async getSettings() {
    const response = await apiClient.get('/system-settings/');
    return response.data;
  },

  /**
   * Get a single setting by key
   * @param {string} key
   * @returns {Promise<Object>}
   */
  async getSetting(key) {
    const response = await apiClient.get(`/system-settings/${key}`);
    return response.data;
  },

  /**
   * Update a single setting
   * @param {string} key
   * @param {string} value
   * @returns {Promise<Object>}
   */
  async updateSetting(key, value) {
    const response = await apiClient.patch(`/system-settings/${key}`, { value: String(value) });
    return response.data;
  },

  /**
   * Bulk update settings
   * @param {Array<{key: string, value: string}>} settings
   * @returns {Promise<Array<Object>>}
   */
  async bulkUpdateSettings(settings) {
    const response = await apiClient.patch('/system-settings/bulk', {
      settings: settings.map((s) => ({ key: s.key, value: String(s.value) })),
    });
    return response.data;
  },
};

export default systemSettingService;
