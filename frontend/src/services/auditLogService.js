import axiosInstance from '../api/axios';

const BASE_URL = '/audit-logs';

export const auditLogService = {
  /**
   * Fetch paginated audit logs with optional filtering.
   * @param {Object} params
   * @param {number} [params.page=1]
   * @param {number} [params.pageSize=20]
   * @param {string} [params.action]
   * @param {string} [params.entityType]
   * @param {number} [params.userId]
   * @param {string} [params.startDate]
   * @param {string} [params.endDate]
   * @returns {Promise<{items: Array, total: number, page: number, page_size: number, total_pages: number}>}
   */
  async getAuditLogs(params = {}) {
    const query = {
      page: params.page || 1,
      page_size: params.pageSize || 20,
    };
    if (params.action) query.action = params.action;
    if (params.entityType) query.entity_type = params.entityType;
    if (params.userId) query.user_id = params.userId;
    if (params.startDate) query.start_date = params.startDate;
    if (params.endDate) query.end_date = params.endDate;

    const response = await axiosInstance.get(BASE_URL, { params: query });
    return response.data;
  },

  /**
   * Fetch a single audit log entry by ID.
   * @param {number} logId
   * @returns {Promise<Object>}
   */
  async getAuditLogById(logId) {
    const response = await axiosInstance.get(`${BASE_URL}/${logId}`);
    return response.data;
  },
};

export default auditLogService;
