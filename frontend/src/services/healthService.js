import apiClient from '../api/axios';

/**
 * Service for communicating with System Health & Diagnostics endpoints.
 */
export const healthService = {
  /**
   * Basic process liveness check
   * @returns {Promise<{ status: string, application: string, version: string }>}
   */
  async getBasicHealth() {
    const response = await apiClient.get('/health/');
    return response.data;
  },

  /**
   * Application readiness check with DB connectivity
   * @returns {Promise<{ status: string, database: string, response_time_ms: number, timestamp: string }>}
   */
  async getReadiness() {
    const response = await apiClient.get('/health/ready');
    return response.data;
  },

  /**
   * Detailed system diagnostics (Admin only)
   * @returns {Promise<Object>}
   */
  async getSystemDiagnostics() {
    const response = await apiClient.get('/health/system');
    return response.data;
  },
};

export default healthService;
