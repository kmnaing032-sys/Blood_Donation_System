import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BloodStock } from '../BloodStock';
import bloodStockService from '../../services/bloodStockService';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../services/bloodStockService', () => {
  return {
    getBloodStockSummary: vi.fn(),
    getBloodStocks: vi.fn(),
    getBloodStockByGroup: vi.fn(),
    getBloodStockById: vi.fn(),
    updateBloodStock: vi.fn(),
    default: {
      getBloodStockSummary: vi.fn(),
      getBloodStocks: vi.fn(),
      getBloodStockByGroup: vi.fn(),
      getBloodStockById: vi.fn(),
      updateBloodStock: vi.fn(),
    },
  };
});

describe('BloodStock Page Component', () => {
  const mockUserAdmin = {
    id: 1,
    email: 'admin@bloodcare.org',
    full_name: 'Admin User',
    role: 'admin',
  };

  const mockUserDonor = {
    id: 2,
    email: 'donor@example.com',
    full_name: 'Donor User',
    role: 'donor',
  };

  const mockSummary = {
    total_available_ml: 12500,
    total_reserved_ml: 1500,
    total_inventory_ml: 14000,
    stock_by_group: [
      { blood_group: 'A+', available_ml: 2500, reserved_ml: 500, total_ml: 3000, status: 'sufficient' },
      { blood_group: 'A-', available_ml: 1200, reserved_ml: 200, total_ml: 1400, status: 'normal' },
      { blood_group: 'B+', available_ml: 3500, reserved_ml: 300, total_ml: 3800, status: 'sufficient' },
      { blood_group: 'B-', available_ml: 800, reserved_ml: 100, total_ml: 900, status: 'low' },
      { blood_group: 'AB+', available_ml: 2000, reserved_ml: 200, total_ml: 2200, status: 'normal' },
      { blood_group: 'AB-', available_ml: 0, reserved_ml: 0, total_ml: 0, status: 'critical' },
      { blood_group: 'O+', available_ml: 2100, reserved_ml: 150, total_ml: 2250, status: 'normal' },
      { blood_group: 'O-', available_ml: 400, reserved_ml: 50, total_ml: 450, status: 'low' },
    ],
  };

  const mockStockListResponse = {
    items: [
      {
        id: 1,
        blood_group: 'A+',
        available_quantity_ml: 2500,
        reserved_quantity_ml: 500,
        total_quantity_ml: 3000,
        updated_at: '2026-11-18T10:00:00Z',
      },
      {
        id: 2,
        blood_group: 'AB-',
        available_quantity_ml: 0,
        reserved_quantity_ml: 0,
        total_quantity_ml: 0,
        updated_at: '2026-11-18T10:00:00Z',
      },
    ],
    total: 2,
    page: 1,
    page_size: 10,
    total_pages: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUserAdmin,
      isAuthenticated: true,
      loading: false,
    });
  });

  it('renders loading state initially', () => {
    bloodStockService.getBloodStockSummary.mockReturnValue(new Promise(() => {}));
    bloodStockService.getBloodStocks.mockReturnValue(new Promise(() => {}));

    render(<BloodStock />);

    expect(screen.getByTestId('stock-loading')).toBeDefined();
    expect(screen.getByText(/Loading blood stock data/i)).toBeDefined();
  });

  it('renders summary metric cards and blood group grid cards after successful fetch', async () => {
    bloodStockService.getBloodStockSummary.mockResolvedValueOnce(mockSummary);
    bloodStockService.getBloodStocks.mockResolvedValueOnce(mockStockListResponse);

    render(<BloodStock />);

    await waitFor(() => {
      expect(screen.queryByTestId('stock-loading')).toBeNull();
    });

    // Check summary metric cards
    expect(screen.getByTestId('total-available-ml').textContent).toContain('12,500 ml');
    expect(screen.getByTestId('total-reserved-ml').textContent).toContain('1,500 ml');
    expect(screen.getByTestId('total-inventory-ml').textContent).toContain('14,000 ml');

    // Check blood group cards
    expect(screen.getByTestId('blood-card-A+')).toBeDefined();
    expect(screen.getByTestId('blood-card-AB-')).toBeDefined();
    expect(screen.getByTestId('blood-card-O-')).toBeDefined();

    // Check table rows
    expect(screen.getByTestId('stock-row-A+')).toBeDefined();
    expect(screen.getByTestId('stock-row-AB-')).toBeDefined();
  });

  it('renders error state when API fails', async () => {
    bloodStockService.getBloodStockSummary.mockRejectedValueOnce(new Error('Summary error'));
    bloodStockService.getBloodStocks.mockRejectedValueOnce({
      response: { data: { detail: 'Database connection failed' } },
    });

    render(<BloodStock />);

    await waitFor(() => {
      expect(screen.queryByTestId('stock-loading')).toBeNull();
    });

    expect(screen.getByTestId('stock-error')).toBeDefined();
    expect(screen.getByText('Database connection failed')).toBeDefined();
  });

  it('renders empty state when no stock items match filter criteria', async () => {
    bloodStockService.getBloodStockSummary.mockResolvedValueOnce(mockSummary);
    bloodStockService.getBloodStocks.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
      total_pages: 0,
    });

    render(<BloodStock />);

    await waitFor(() => {
      expect(screen.queryByTestId('stock-loading')).toBeNull();
    });

    expect(screen.getByTestId('stock-empty')).toBeDefined();
    expect(screen.getByText(/No Blood Stock Found/i)).toBeDefined();
  });

  it('allows filtering by blood group', async () => {
    bloodStockService.getBloodStockSummary.mockResolvedValue(mockSummary);
    bloodStockService.getBloodStocks.mockResolvedValue(mockStockListResponse);

    render(<BloodStock />);

    await waitFor(() => {
      expect(screen.getByTestId('filter-blood-group')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('filter-blood-group'), {
      target: { value: 'A+' },
    });

    await waitFor(() => {
      expect(bloodStockService.getBloodStocks).toHaveBeenCalledWith(
        expect.objectContaining({
          blood_group: 'A+',
          page: 1,
        })
      );
    });
  });

  it('allows filtering by min and max quantity', async () => {
    bloodStockService.getBloodStockSummary.mockResolvedValue(mockSummary);
    bloodStockService.getBloodStocks.mockResolvedValue(mockStockListResponse);

    render(<BloodStock />);

    await waitFor(() => {
      expect(screen.getByTestId('filter-min-qty')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('filter-min-qty'), { target: { value: '1000' } });
    fireEvent.change(screen.getByTestId('filter-max-qty'), { target: { value: '4000' } });

    await waitFor(() => {
      expect(bloodStockService.getBloodStocks).toHaveBeenCalledWith(
        expect.objectContaining({
          min_quantity: '1000',
          max_quantity: '4000',
        })
      );
    });
  });

  it('allows changing sorting options', async () => {
    bloodStockService.getBloodStockSummary.mockResolvedValue(mockSummary);
    bloodStockService.getBloodStocks.mockResolvedValue(mockStockListResponse);

    render(<BloodStock />);

    await waitFor(() => {
      expect(screen.getByTestId('select-sort-by')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('select-sort-by'), {
      target: { value: 'available_quantity_ml' },
    });
    fireEvent.change(screen.getByTestId('select-sort-order'), {
      target: { value: 'desc' },
    });

    await waitFor(() => {
      expect(bloodStockService.getBloodStocks).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: 'available_quantity_ml',
          sort_order: 'desc',
        })
      );
    });
  });

  it('shows adjust buttons for admin/staff and opens adjust modal', async () => {
    bloodStockService.getBloodStockSummary.mockResolvedValue(mockSummary);
    bloodStockService.getBloodStocks.mockResolvedValue(mockStockListResponse);

    render(<BloodStock />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-adjust-A+')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-adjust-A+'));

    expect(screen.getByTestId('stock-adjust-modal')).toBeDefined();
    expect(screen.getByTestId('input-available-quantity').value).toBe('2500');
    expect(screen.getByTestId('input-reserved-quantity').value).toBe('500');
  });

  it('submits stock adjustment successfully', async () => {
    bloodStockService.getBloodStockSummary.mockResolvedValue(mockSummary);
    bloodStockService.getBloodStocks.mockResolvedValue(mockStockListResponse);
    bloodStockService.updateBloodStock.mockResolvedValueOnce({
      id: 1,
      blood_group: 'A+',
      available_quantity_ml: 2800,
      reserved_quantity_ml: 500,
      total_quantity_ml: 3300,
    });

    render(<BloodStock />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-adjust-A+')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-adjust-A+'));

    fireEvent.change(screen.getByTestId('input-available-quantity'), {
      target: { value: '2800' },
    });

    fireEvent.click(screen.getByTestId('btn-save-stock'));

    await waitFor(() => {
      expect(bloodStockService.updateBloodStock).toHaveBeenCalledWith(1, {
        available_quantity_ml: 2800,
        reserved_quantity_ml: 500,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('feedback-banner').textContent).toContain(
        'Successfully calibrated blood stock for A+'
      );
    });
  });

  it('hides adjustment actions for regular donor users', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUserDonor,
      isAuthenticated: true,
      loading: false,
    });

    bloodStockService.getBloodStockSummary.mockResolvedValue(mockSummary);
    bloodStockService.getBloodStocks.mockResolvedValue(mockStockListResponse);

    render(<BloodStock />);

    await waitFor(() => {
      expect(screen.queryByTestId('stock-loading')).toBeNull();
    });

    expect(screen.queryByTestId('btn-adjust-A+')).toBeNull();
    expect(screen.queryByText('Actions')).toBeNull();
  });
});
