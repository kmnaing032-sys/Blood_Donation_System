import apiClient from '../api/axios';

/**
 * Service for communicating with Database Backup & Restore endpoints.
 */
export const backupService = {
  /**
   * List all database backup history
   * @returns {Promise<{ backups: Array, total: number }>}
   */
  async getBackups() {
    const response = await apiClient.get('/backups/');
    return response.data;
  },

  /**
   * Get specific backup metadata by ID
   * @param {number} backupId
   * @returns {Promise<Object>}
   */
  async getBackup(backupId) {
    const response = await apiClient.get(`/backups/${backupId}`);
    return response.data;
  },

  /**
   * Create a new PostgreSQL database backup
   * @param {'custom' | 'plain'} format
   * @returns {Promise<Object>}
   */
  async createBackup(format = 'custom') {
    const response = await apiClient.post('/backups/', { format });
    return response.data;
  },

  /**
   * Download a backup file
   * @param {number} backupId
   * @param {string} filename
   */
  async downloadBackup(backupId, filename) {
    const response = await apiClient.get(`/backups/${backupId}/download`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename || `database_backup_${backupId}.dump`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  /**
   * Delete a database backup
   * @param {number} backupId
   * @returns {Promise<Object>}
   */
  async deleteBackup(backupId) {
    const response = await apiClient.delete(`/backups/${backupId}`);
    return response.data;
  },

  /**
   * Prepare/verify restore operation with confirmation token
   * @param {number} backupId
   * @param {string} confirmation
   * @returns {Promise<Object>}
   */
  async prepareRestore(backupId, confirmation = 'CONFIRM_RESTORE') {
    const response = await apiClient.post(`/backups/${backupId}/restore`, { confirmation });
    return response.data;
  },
};

export default backupService;
