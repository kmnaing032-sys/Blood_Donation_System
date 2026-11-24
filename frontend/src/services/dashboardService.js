import apiClient from '../api/axios';
import { API_ENDPOINTS } from '../api/endpoints';

/**
 * Dashboard Statistics API Service
 *
 * Connects to verified backend endpoints in app/api/v1/endpoints/dashboard.py:
 *   - GET /api/v1/dashboard/summary
 *   - GET /api/v1/dashboard/donations
 *   - GET /api/v1/dashboard/blood-stock
 *   - GET /api/v1/dashboard/blood-requests
 *   - GET /api/v1/dashboard/monthly-trends
 *
 * RBAC Constraint:
 *   - Backend requires "admin" or "staff" role for all dashboard metrics.
 *   - For ordinary "donor" or "user" roles, the backend returns 403 Forbidden.
 */

/**
 * Fetch top-level dashboard summary metrics.
 * @returns {Promise<Object>} DashboardSummaryResponse
 */
export const getDashboardSummary = async () => {
  const response = await apiClient.get(API_ENDPOINTS.DASHBOARD.SUMMARY);
  return response.data;
};

/**
 * Fetch detailed donation statistics (today, month, year, all-time, by blood group).
 * @returns {Promise<Object>} DashboardDonationsResponse
 */
export const getDonationStats = async () => {
  const response = await apiClient.get(API_ENDPOINTS.DASHBOARD.DONATIONS);
  return response.data;
};

/**
 * Fetch real-time blood stock analytics (by group, low stock, out of stock alerts).
 * @returns {Promise<Object>} DashboardBloodStockResponse
 */
export const getBloodStockStats = async () => {
  const response = await apiClient.get(API_ENDPOINTS.DASHBOARD.BLOOD_STOCK);
  return response.data;
};

/**
 * Fetch blood request status breakdowns and distributions.
 * @returns {Promise<Object>} DashboardBloodRequestsResponse
 */
export const getBloodRequestStats = async () => {
  const response = await apiClient.get(API_ENDPOINTS.DASHBOARD.BLOOD_REQUESTS);
  return response.data;
};

/**
 * Fetch historical monthly donation volume and count trends.
 * @returns {Promise<Object>} DashboardMonthlyTrendsResponse
 */
export const getMonthlyTrends = async () => {
  const response = await apiClient.get(API_ENDPOINTS.DASHBOARD.MONTHLY_TRENDS);
  return response.data;
};

/**
 * Fetch all dashboard datasets concurrently with resilient partial-failure handling.
 * @returns {Promise<{
 *   summary: Object|null,
 *   donations: Object|null,
 *   stock: Object|null,
 *   requests: Object|null,
 *   trends: Object|null,
 *   errors: Object
 * }>}
 */
export const getAllDashboardData = async () => {
  const results = await Promise.allSettled([
    getDashboardSummary(),
    getDonationStats(),
    getBloodStockStats(),
    getBloodRequestStats(),
    getMonthlyTrends(),
  ]);

  const [summaryRes, donationsRes, stockRes, requestsRes, trendsRes] = results;

  return {
    summary: summaryRes.status === 'fulfilled' ? summaryRes.value : null,
    donations: donationsRes.status === 'fulfilled' ? donationsRes.value : null,
    stock: stockRes.status === 'fulfilled' ? stockRes.value : null,
    requests: requestsRes.status === 'fulfilled' ? requestsRes.value : null,
    trends: trendsRes.status === 'fulfilled' ? trendsRes.value : null,
    errors: {
      summary: summaryRes.status === 'rejected' ? summaryRes.reason : null,
      donations: donationsRes.status === 'rejected' ? donationsRes.reason : null,
      stock: stockRes.status === 'rejected' ? stockRes.reason : null,
      requests: requestsRes.status === 'rejected' ? requestsRes.reason : null,
      trends: trendsRes.status === 'rejected' ? trendsRes.reason : null,
    },
  };
};

export const dashboardService = {
  getDashboardSummary,
  getDonationStats,
  getBloodStockStats,
  getBloodRequestStats,
  getMonthlyTrends,
  getAllDashboardData,
};

export default dashboardService;
