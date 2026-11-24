import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Reports } from '../Reports';
import reportService from '../../services/reportService';

vi.mock('../../services/reportService', () => ({
  default: {
    getOverview: vi.fn(),
    getDonors: vi.fn(),
    getDonations: vi.fn(),
    getBloodStock: vi.fn(),
    getBloodRequests: vi.fn(),
    exportCsv: vi.fn(),
    exportPdf: vi.fn(),
  },
}));

describe('Reports Component', () => {
  const mockOverview = {
    total_donors: 120,
    new_donors_in_period: 15,
    total_donations: 85,
    total_donated_volume_ml: 38250,
    total_available_stock_ml: 24500,
    total_requests: 30,
    pending_requests: 5,
    fulfilled_requests: 20,
  };

  const mockDonors = {
    total_donors: 120,
    by_blood_group: [
      { blood_group: 'A+', count: 40 },
      { blood_group: 'O+', count: 50 },
    ],
    by_gender: [{ gender: 'male', count: 70 }, { gender: 'female', count: 50 }],
    new_donors_in_period: 15,
  };

  const mockDonations = {
    total_donations: 85,
    total_volume_ml: 38250,
    by_blood_group: [
      { blood_group: 'A+', count: 35, total_volume_ml: 15750 },
      { blood_group: 'O+', count: 50, total_volume_ml: 22500 },
    ],
    trends: [{ period: '2026-11', count: 85, volume_ml: 38250 }],
  };

  const mockStock = {
    total_available_volume_ml: 24500,
    total_reserved_volume_ml: 3500,
    total_inventory_volume_ml: 28000,
    by_blood_group: [
      {
        blood_group: 'A+',
        available_quantity_ml: 12000,
        reserved_quantity_ml: 1000,
        total_quantity_ml: 13000,
        percentage_of_total: 46.43,
      },
      {
        blood_group: 'O+',
        available_quantity_ml: 12500,
        reserved_quantity_ml: 2500,
        total_quantity_ml: 15000,
        percentage_of_total: 53.57,
      },
    ],
    low_stock_groups: [],
    critical_stock_groups: [],
  };

  const mockRequests = {
    total_requests: 30,
    by_status: [
      { status: 'pending', count: 5 },
      { status: 'approved', count: 3 },
      { status: 'fulfilled', count: 20 },
      { status: 'rejected', count: 1 },
      { status: 'cancelled', count: 1 },
    ],
    by_blood_group: [
      { blood_group: 'A+', count: 10, total_quantity_ml: 4500 },
      { blood_group: 'O+', count: 20, total_quantity_ml: 9000 },
    ],
    by_urgency: [{ urgency: 'high', count: 15 }, { urgency: 'normal', count: 15 }],
    pending_count: 5,
    approved_count: 3,
    fulfilled_count: 20,
    rejected_count: 1,
    cancelled_count: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    reportService.getOverview.mockResolvedValue(mockOverview);
    reportService.getDonors.mockResolvedValue(mockDonors);
    reportService.getDonations.mockResolvedValue(mockDonations);
    reportService.getBloodStock.mockResolvedValue(mockStock);
    reportService.getBloodRequests.mockResolvedValue(mockRequests);
  });

  it('renders loading state initially and then renders full operational statistics', async () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('overview-grid')).toBeDefined();
    });

    expect(screen.getByText('120')).toBeDefined();
    expect(screen.getByText('38250 ml')).toBeDefined();
    expect(screen.getByText('24500 ml')).toBeDefined();
    expect(screen.getByText('30')).toBeDefined();
  });

  it('renders donation charts and blood stock inventory charts correctly', async () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('donations-bar-chart')).toBeDefined();
      expect(screen.getByTestId('stock-bar-chart')).toBeDefined();
      expect(screen.getByTestId('requests-status-grid')).toBeDefined();
    });

    expect(screen.getByTestId('donation-bar-A+')).toBeDefined();
    expect(screen.getByTestId('stock-bar-A+')).toBeDefined();
    expect(screen.getByTestId('status-pending')).toBeDefined();
  });

  it('supports date and blood group filter updates', async () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('overview-grid')).toBeDefined();
    });

    const bgSelect = screen.getByTestId('filter-blood-group');
    fireEvent.change(bgSelect, { target: { value: 'A+' } });

    await waitFor(() => {
      expect(reportService.getDonations).toHaveBeenCalledWith(
        expect.objectContaining({
          bloodGroup: 'A+',
        })
      );
    });
  });

  it('handles CSV and PDF download button clicks safely', async () => {
    reportService.exportCsv.mockResolvedValue(new Blob(['mock,csv'], { type: 'text/csv' }));
    reportService.exportPdf.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));

    // Mock createObjectURL & remove
    window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-blob');

    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('export-csv-btn')).toBeDefined();
    });

    const csvBtn = screen.getByTestId('export-csv-btn');
    fireEvent.click(csvBtn);
    await waitFor(() => {
      expect(reportService.exportCsv).toHaveBeenCalled();
    });

    const pdfBtn = screen.getByTestId('export-pdf-btn');
    fireEvent.click(pdfBtn);
    await waitFor(() => {
      expect(reportService.exportPdf).toHaveBeenCalled();
    });
  });

  it('renders error banner when API fetch fails', async () => {
    reportService.getOverview.mockRejectedValue(new Error('Internal Server Error'));

    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('reports-error-banner')).toBeDefined();
    });
  });
});
