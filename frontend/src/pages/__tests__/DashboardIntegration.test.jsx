import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from '../Dashboard';
import dashboardService from '../../services/dashboardService';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../services/dashboardService');

const mockAdminUser = {
  id: 1,
  full_name: 'Dr. Admin Officer',
  email: 'admin@hospital.org',
  role: 'admin',
};

const mockDonorUser = {
  id: 5,
  full_name: 'Donor Dave',
  email: 'dave@donor.org',
  role: 'donor',
};

const mockSummaryData = {
  total_users: 15,
  total_donors: 12,
  total_donations: 42,
  total_blood_stock_ml: 18900,
  total_reserved_stock_ml: 1350,
  pending_requests: 3,
  approved_requests: 5,
  fulfilled_requests: 8,
  rejected_requests: 1,
  cancelled_requests: 0,
};

const mockDonationsData = {
  today_count: 2,
  today_volume_ml: 900,
  this_month_count: 14,
  this_month_volume_ml: 6300,
  this_year_count: 42,
  this_year_volume_ml: 18900,
  all_time_count: 42,
  all_time_volume_ml: 18900,
  by_blood_group: [
    { blood_group: 'O+', count: 15, total_volume_ml: 6750 },
    { blood_group: 'A+', count: 12, total_volume_ml: 5400 },
  ],
};

const mockStockData = {
  total_available_ml: 18900,
  total_reserved_ml: 1350,
  total_inventory_ml: 20250,
  stocks_by_group: [
    { blood_group: 'O+', available_quantity_ml: 4500, reserved_quantity_ml: 450, total_quantity_ml: 4950, status: 'sufficient' },
    { blood_group: 'A+', available_quantity_ml: 3200, reserved_quantity_ml: 0, total_quantity_ml: 3200, status: 'sufficient' },
    { blood_group: 'B-', available_quantity_ml: 450, reserved_quantity_ml: 0, total_quantity_ml: 450, status: 'low_stock' },
    { blood_group: 'AB-', available_quantity_ml: 0, reserved_quantity_ml: 0, total_quantity_ml: 0, status: 'out_of_stock' },
  ],
  low_stock_alerts: ['B-'],
  out_of_stock_alerts: ['AB-'],
};

const mockRequestsData = {
  total_requests: 17,
  pending_requests: 3,
  approved_requests: 5,
  fulfilled_requests: 8,
  rejected_requests: 1,
  cancelled_requests: 0,
  by_blood_group: [],
};

const mockTrendsData = {
  trends: [
    { month: '2026-08', donation_count: 8, total_volume_ml: 3600 },
    { month: '2026-09', donation_count: 12, total_volume_ml: 5400 },
    { month: '2026-10', donation_count: 14, total_volume_ml: 6300 },
  ],
};

const renderDashboard = (user = mockAdminUser) => {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user,
    isAuthenticated: true,
    loading: false,
  });

  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
};

describe('Dashboard Integration Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and renders real API operational metrics for Admin user', async () => {
    dashboardService.getAllDashboardData.mockResolvedValueOnce({
      summary: mockSummaryData,
      donations: mockDonationsData,
      stock: mockStockData,
      requests: mockRequestsData,
      trends: mockTrendsData,
      errors: {},
    });

    renderDashboard(mockAdminUser);

    await waitFor(() => {
      expect(screen.getByTestId('value-total-donors').textContent).toBe('12');
      expect(screen.getByTestId('value-total-donations').textContent).toBe('42');
      expect(screen.getByTestId('value-available-blood-stock').textContent).toBe('18.9 L');
      expect(screen.getByTestId('value-pending-blood-requests').textContent).toBe('3');
    });

    // Check request breakdowns
    expect(screen.getByTestId('count-pending').textContent).toBe('3');
    expect(screen.getByTestId('count-approved').textContent).toBe('5');
    expect(screen.getByTestId('count-fulfilled').textContent).toBe('8');
    expect(screen.getByTestId('count-rejected').textContent).toBe('1');
    expect(screen.getByTestId('count-cancelled').textContent).toBe('0');

    // Check stock breakdown list
    expect(screen.getByTestId('stock-row-O+')).toBeDefined();
    expect(screen.getByTestId('stock-row-B-')).toBeDefined();

    // Check low stock alert banner text
    expect(screen.getByText(/1 Low Stock Alert/i)).toBeDefined();

    // Check trends chart
    expect(screen.getByTestId('trends-chart')).toBeDefined();
    expect(screen.getByTestId('trend-month-2026-10')).toBeDefined();
  });

  it('renders Donor Portal welcome card for non-admin/staff users', async () => {
    renderDashboard(mockDonorUser);

    expect(screen.getByTestId('donor-welcome-card')).toBeDefined();
    expect(screen.getByText(/Donor & Community Portal/i)).toBeDefined();
    expect(dashboardService.getAllDashboardData).not.toHaveBeenCalled();
  });

  it('handles partial API failure gracefully by displaying available summary data with warning banner', async () => {
    dashboardService.getAllDashboardData.mockResolvedValueOnce({
      summary: mockSummaryData,
      donations: null,
      stock: null,
      requests: null,
      trends: null,
      errors: {
        donations: new Error('Failed to load donations'),
      },
    });

    renderDashboard(mockAdminUser);

    await waitFor(() => {
      expect(screen.getByTestId('value-total-donors').textContent).toBe('12');
    });

    expect(screen.getByTestId('partial-error-banner')).toBeDefined();
    expect(screen.getByText(/Some specialized metrics could not be loaded completely/i)).toBeDefined();
  });

  it('displays full error card with retry button when summary fails', async () => {
    dashboardService.getAllDashboardData.mockResolvedValueOnce({
      summary: null,
      donations: null,
      stock: null,
      requests: null,
      trends: null,
      errors: {
        summary: new Error('Internal Server Error'),
      },
    });

    renderDashboard(mockAdminUser);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error')).toBeDefined();
    });

    expect(screen.getByText(/Operational Overview Unavailable/i)).toBeDefined();

    // Test retry click
    dashboardService.getAllDashboardData.mockResolvedValueOnce({
      summary: mockSummaryData,
      donations: mockDonationsData,
      stock: mockStockData,
      requests: mockRequestsData,
      trends: mockTrendsData,
      errors: {},
    });

    fireEvent.click(screen.getByTestId('retry-dashboard-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('value-total-donors').textContent).toBe('12');
    });
  });

  it('allows manual refresh via header button', async () => {
    dashboardService.getAllDashboardData.mockResolvedValue({
      summary: mockSummaryData,
      donations: mockDonationsData,
      stock: mockStockData,
      requests: mockRequestsData,
      trends: mockTrendsData,
      errors: {},
    });

    renderDashboard(mockAdminUser);

    await waitFor(() => {
      expect(screen.getByTestId('value-total-donors').textContent).toBe('12');
    });

    const refreshBtn = screen.getByTestId('refresh-dashboard-btn');
    fireEvent.click(refreshBtn);

    expect(dashboardService.getAllDashboardData).toHaveBeenCalledTimes(2);
  });
});
