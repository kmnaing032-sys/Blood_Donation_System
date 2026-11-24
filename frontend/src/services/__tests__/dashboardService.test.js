import { describe, it, expect, vi, beforeEach } from 'vitest';
import dashboardService, {
  getDashboardSummary,
  getDonationStats,
  getBloodStockStats,
  getBloodRequestStats,
  getMonthlyTrends,
  getAllDashboardData,
} from '../dashboardService';
import apiClient from '../../api/axios';
import { API_ENDPOINTS } from '../../api/endpoints';

vi.mock('../../api/axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('dashboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches summary from /dashboard/summary', async () => {
    const mockSummary = {
      total_users: 10,
      total_donors: 8,
      total_donations: 25,
      total_blood_stock_ml: 12500,
    };
    apiClient.get.mockResolvedValueOnce({ data: mockSummary });

    const result = await getDashboardSummary();
    expect(apiClient.get).toHaveBeenCalledWith(API_ENDPOINTS.DASHBOARD.SUMMARY);
    expect(result).toEqual(mockSummary);
  });

  it('fetches donation statistics from /dashboard/donations', async () => {
    const mockDonations = {
      all_time_count: 50,
      all_time_volume_ml: 22500,
      today_count: 2,
    };
    apiClient.get.mockResolvedValueOnce({ data: mockDonations });

    const result = await getDonationStats();
    expect(apiClient.get).toHaveBeenCalledWith(API_ENDPOINTS.DASHBOARD.DONATIONS);
    expect(result).toEqual(mockDonations);
  });

  it('fetches blood stock statistics from /dashboard/blood-stock', async () => {
    const mockStock = {
      total_available_ml: 8000,
      low_stock_alerts: ['O-'],
    };
    apiClient.get.mockResolvedValueOnce({ data: mockStock });

    const result = await getBloodStockStats();
    expect(apiClient.get).toHaveBeenCalledWith(API_ENDPOINTS.DASHBOARD.BLOOD_STOCK);
    expect(result).toEqual(mockStock);
  });

  it('fetches blood request statistics from /dashboard/blood-requests', async () => {
    const mockRequests = {
      total_requests: 12,
      pending_requests: 3,
    };
    apiClient.get.mockResolvedValueOnce({ data: mockRequests });

    const result = await getBloodRequestStats();
    expect(apiClient.get).toHaveBeenCalledWith(API_ENDPOINTS.DASHBOARD.BLOOD_REQUESTS);
    expect(result).toEqual(mockRequests);
  });

  it('fetches monthly trends from /dashboard/monthly-trends', async () => {
    const mockTrends = {
      trends: [{ month: '2026-10', donation_count: 5, total_volume_ml: 2250 }],
    };
    apiClient.get.mockResolvedValueOnce({ data: mockTrends });

    const result = await getMonthlyTrends();
    expect(apiClient.get).toHaveBeenCalledWith(API_ENDPOINTS.DASHBOARD.MONTHLY_TRENDS);
    expect(result).toEqual(mockTrends);
  });

  it('handles partial failures gracefully in getAllDashboardData', async () => {
    const mockSummary = { total_donors: 5 };
    const mockStock = { total_available_ml: 3000 };

    apiClient.get.mockImplementation((url) => {
      if (url === API_ENDPOINTS.DASHBOARD.SUMMARY) {
        return Promise.resolve({ data: mockSummary });
      }
      if (url === API_ENDPOINTS.DASHBOARD.BLOOD_STOCK) {
        return Promise.resolve({ data: mockStock });
      }
      return Promise.reject(new Error('Network failure on ' + url));
    });

    const result = await getAllDashboardData();

    expect(result.summary).toEqual(mockSummary);
    expect(result.stock).toEqual(mockStock);
    expect(result.donations).toBeNull();
    expect(result.requests).toBeNull();
    expect(result.trends).toBeNull();
    expect(result.errors.donations).toBeDefined();
    expect(result.errors.requests).toBeDefined();
    expect(result.errors.trends).toBeDefined();
  });
});
