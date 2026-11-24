import axiosInstance from '../api/axios';

const BASE_URL = '/reports';

export const reportService = {
  /**
   * Fetch operational overview summary report.
   * @param {Object} params
   * @param {string} [params.startDate]
   * @param {string} [params.endDate]
   */
  async getOverview(params = {}) {
    const query = {};
    if (params.startDate) query.start_date = params.startDate;
    if (params.endDate) query.end_date = params.endDate;
    const res = await axiosInstance.get(`${BASE_URL}/overview`, { params: query });
    return res.data;
  },

  /**
   * Fetch donor report statistics.
   * @param {Object} params
   */
  async getDonors(params = {}) {
    const query = {};
    if (params.startDate) query.start_date = params.startDate;
    if (params.endDate) query.end_date = params.endDate;
    if (params.bloodGroup) query.blood_group = params.bloodGroup;
    const res = await axiosInstance.get(`${BASE_URL}/donors`, { params: query });
    return res.data;
  },

  /**
   * Fetch donation report statistics.
   * @param {Object} params
   */
  async getDonations(params = {}) {
    const query = {};
    if (params.startDate) query.start_date = params.startDate;
    if (params.endDate) query.end_date = params.endDate;
    if (params.bloodGroup) query.blood_group = params.bloodGroup;
    if (params.status) query.status = params.status;
    const res = await axiosInstance.get(`${BASE_URL}/donations`, { params: query });
    return res.data;
  },

  /**
   * Fetch blood stock report statistics.
   * @param {Object} params
   */
  async getBloodStock(params = {}) {
    const query = {};
    if (params.bloodGroup) query.blood_group = params.bloodGroup;
    const res = await axiosInstance.get(`${BASE_URL}/blood-stock`, { params: query });
    return res.data;
  },

  /**
   * Fetch blood request report statistics.
   * @param {Object} params
   */
  async getBloodRequests(params = {}) {
    const query = {};
    if (params.startDate) query.start_date = params.startDate;
    if (params.endDate) query.end_date = params.endDate;
    if (params.bloodGroup) query.blood_group = params.bloodGroup;
    if (params.status) query.status = params.status;
    const res = await axiosInstance.get(`${BASE_URL}/blood-requests`, { params: query });
    return res.data;
  },

  /**
   * Download CSV export.
   * @param {Object} params
   */
  async exportCsv(params = {}) {
    const query = { report_type: params.reportType || 'overview' };
    if (params.startDate) query.start_date = params.startDate;
    if (params.endDate) query.end_date = params.endDate;
    if (params.bloodGroup) query.blood_group = params.bloodGroup;
    if (params.status) query.status = params.status;

    const res = await axiosInstance.get(`${BASE_URL}/export/csv`, {
      params: query,
      responseType: 'blob',
    });
    return res.data;
  },

  /**
   * Download PDF export.
   * @param {Object} params
   */
  async exportPdf(params = {}) {
    const query = { report_type: params.reportType || 'overview' };
    if (params.startDate) query.start_date = params.startDate;
    if (params.endDate) query.end_date = params.endDate;
    if (params.bloodGroup) query.blood_group = params.bloodGroup;
    if (params.status) query.status = params.status;

    const res = await axiosInstance.get(`${BASE_URL}/export/pdf`, {
      params: query,
      responseType: 'blob',
    });
    return res.data;
  },
};

export default reportService;
