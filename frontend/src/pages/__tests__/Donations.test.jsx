/**
 * Donations.test.jsx — Unit & Integration tests for Donation Management UI
 *
 * Requirements covered:
 * 1. Donation list loading state.
 * 2. Donation list success rendering.
 * 3. Empty donation list view.
 * 4. Donation API error display.
 * 5. Search and filtering (blood group, status).
 * 6. Pagination navigation.
 * 7. Add donation modal rendering & form submission.
 * 8. Donor selection and blood group synchronization.
 * 9. Edit donation.
 * 10. View donation details.
 * 11. Delete confirmation modal.
 * 12. Successful deletion and list refresh.
 * 13. Form validation rules (quantity range, date).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Donations } from '../Donations';
import donationService from '../../services/donationService';
import donorService from '../../services/donorService';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../services/donationService', () => {
  return {
    getDonations: vi.fn(),
    getDonationById: vi.fn(),
    createDonation: vi.fn(),
    updateDonation: vi.fn(),
    deleteDonation: vi.fn(),
    DONATION_STATUSES: ['completed', 'pending', 'cancelled', 'rejected'],
    default: {
      getDonations: vi.fn(),
      getDonationById: vi.fn(),
      createDonation: vi.fn(),
      updateDonation: vi.fn(),
      deleteDonation: vi.fn(),
      DONATION_STATUSES: ['completed', 'pending', 'cancelled', 'rejected'],
    },
  };
});

vi.mock('../../services/donorService', () => {
  return {
    getDonors: vi.fn(),
    BLOOD_GROUPS: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    default: {
      getDonors: vi.fn(),
      BLOOD_GROUPS: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    },
  };
});

const mockDonations = [
  {
    id: 1,
    donor_id: 10,
    donor_name: 'David Miller',
    donor_phone: '+1-555-1010',
    donation_date: '2024-03-01',
    quantity_ml: 450,
    blood_group: 'O+',
    status: 'completed',
    notes: 'Regular donation',
    created_at: '2024-03-01T10:00:00Z',
  },
  {
    id: 2,
    donor_id: 11,
    donor_name: 'Sarah Connor',
    donor_phone: '+1-555-2020',
    donation_date: '2024-03-05',
    quantity_ml: 500,
    blood_group: 'B-',
    status: 'pending',
    notes: 'Awaiting lab screening',
    created_at: '2024-03-05T11:00:00Z',
  },
];

const mockAvailableDonors = [
  { id: 10, full_name: 'David Miller', blood_group: 'O+', age: 32 },
  { id: 11, full_name: 'Sarah Connor', blood_group: 'B-', age: 28 },
];

const adminUser = { id: 99, full_name: 'Admin User', role: 'admin' };

describe('Donations Page Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: adminUser,
      isAuthenticated: true,
      loading: false,
    });
    donorService.getDonors.mockResolvedValue({ items: mockAvailableDonors });
  });

  it('renders loading state initially while fetching donations', () => {
    donationService.getDonations.mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter>
        <Donations />
      </MemoryRouter>
    );

    expect(screen.getByTestId('donations-loading')).toBeDefined();
    expect(screen.getByText(/loading donations list/i)).toBeDefined();
  });

  it('renders list of donations on API success', async () => {
    donationService.getDonations.mockResolvedValueOnce({
      items: mockDonations,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <Donations />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('donations-table')).toBeDefined();
    });

    expect(screen.getByText('David Miller')).toBeDefined();
    expect(screen.getByText('Sarah Connor')).toBeDefined();
    expect(screen.getByText('450 ml')).toBeDefined();
    expect(screen.getByText('500 ml')).toBeDefined();
  });

  it('renders empty state when no donations are returned', async () => {
    donationService.getDonations.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
      total_pages: 0,
    });

    render(
      <MemoryRouter>
        <Donations />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('donations-empty')).toBeDefined();
    });

    expect(screen.getByText(/no donation records found/i)).toBeDefined();
  });

  it('renders error state on API failure', async () => {
    donationService.getDonations.mockRejectedValueOnce({
      response: { data: { detail: 'Server database error' } },
    });

    render(
      <MemoryRouter>
        <Donations />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('donations-error')).toBeDefined();
    });

    expect(screen.getByText(/server database error/i)).toBeDefined();
  });

  it('supports search input filter', async () => {
    donationService.getDonations.mockResolvedValue({
      items: mockDonations,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <Donations />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('donations-table')).toBeDefined();
    });

    const searchInput = screen.getByTestId('donation-search-input');
    fireEvent.change(searchInput, { target: { value: 'David' } });

    await waitFor(() => {
      expect(donationService.getDonations).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'David', page: 1 })
      );
    });
  });

  it('supports blood group and status filter selections', async () => {
    donationService.getDonations.mockResolvedValue({
      items: [mockDonations[0]],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <Donations />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('donations-table')).toBeDefined();
    });

    const bgFilter = screen.getByTestId('donation-blood-group-filter');
    fireEvent.change(bgFilter, { target: { value: 'O+' } });

    const statusFilter = screen.getByTestId('donation-status-filter');
    fireEvent.change(statusFilter, { target: { value: 'completed' } });

    await waitFor(() => {
      expect(donationService.getDonations).toHaveBeenCalledWith(
        expect.objectContaining({ blood_group: 'O+', status: 'completed', page: 1 })
      );
    });
  });

  it('handles pagination navigation', async () => {
    donationService.getDonations.mockResolvedValue({
      items: mockDonations,
      total: 25,
      page: 1,
      page_size: 10,
      total_pages: 3,
    });

    render(
      <MemoryRouter>
        <Donations />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('pagination-bar')).toBeDefined();
    });

    const nextBtn = screen.getByTestId('next-donation-page-btn');
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(donationService.getDonations).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });
  });

  it('opens details modal when View action is clicked', async () => {
    donationService.getDonations.mockResolvedValueOnce({
      items: mockDonations,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <Donations />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('view-donation-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('view-donation-1'));

    expect(screen.getByTestId('donation-detail-modal')).toBeDefined();
    expect(screen.getByTestId('detail-donor-name').textContent).toBe('David Miller');
  });

  it('validates quantity range and required donor selection in Record Donation modal', async () => {
    donationService.getDonations.mockResolvedValueOnce({
      items: mockDonations,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <Donations />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('add-donation-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('add-donation-btn'));

    expect(screen.getByTestId('donation-form-modal')).toBeDefined();

    // Set invalid quantity (below 100ml)
    const qtyInput = screen.getByLabelText(/quantity/i);
    fireEvent.change(qtyInput, { target: { value: '50' } });

    fireEvent.click(screen.getByTestId('submit-donation-btn'));

    expect(await screen.findByText(/please select a donor/i)).toBeDefined();
    expect(await screen.findByText(/quantity must be between 100ml and 800ml/i)).toBeDefined();
    expect(donationService.createDonation).not.toHaveBeenCalled();
  });

  it('supports selecting a donor, displays donor info preview, and records donation', async () => {
    donationService.getDonations.mockResolvedValue({
      items: mockDonations,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });
    donationService.createDonation.mockResolvedValueOnce({ id: 5 });

    render(
      <MemoryRouter>
        <Donations />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('add-donation-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('add-donation-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('donor-select')).toBeDefined();
    });

    // Select donor #10 (David Miller, O+)
    fireEvent.change(screen.getByTestId('donor-select'), {
      target: { value: '10' },
    });

    expect(await screen.findByTestId('donor-info-preview')).toBeDefined();
    expect(screen.getByText(/registered blood group:/i)).toBeDefined();

    fireEvent.click(screen.getByTestId('submit-donation-btn'));

    await waitFor(() => {
      expect(donationService.createDonation).toHaveBeenCalledWith(
        expect.objectContaining({
          donor_id: 10,
          blood_group: 'O+',
          quantity_ml: 450,
        })
      );
    });

    expect(await screen.findByText(/blood donation recorded successfully/i)).toBeDefined();
  });

  it('opens Edit modal and submits updated donation status/notes', async () => {
    donationService.getDonations.mockResolvedValue({
      items: mockDonations,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });
    donationService.updateDonation.mockResolvedValueOnce({ id: 1, status: 'cancelled' });

    render(
      <MemoryRouter>
        <Donations />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('edit-donation-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('edit-donation-1'));

    expect(screen.getByText(/edit donation record/i)).toBeDefined();

    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: 'Updated clinical observation' },
    });

    fireEvent.click(screen.getByTestId('submit-donation-btn'));

    await waitFor(() => {
      expect(donationService.updateDonation).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ notes: 'Updated clinical observation' })
      );
    });

    expect(await screen.findByText(/donation record updated successfully/i)).toBeDefined();
  });

  it('prompts delete confirmation modal and executes deletion', async () => {
    donationService.getDonations.mockResolvedValue({
      items: mockDonations,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });
    donationService.deleteDonation.mockResolvedValueOnce({ message: 'Deleted' });

    render(
      <MemoryRouter>
        <Donations />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('delete-donation-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('delete-donation-1'));

    expect(screen.getByTestId('delete-donation-modal')).toBeDefined();
    expect(screen.getByText(/are you sure you want to delete donation record/i)).toBeDefined();

    fireEvent.click(screen.getByTestId('confirm-delete-donation-btn'));

    await waitFor(() => {
      expect(donationService.deleteDonation).toHaveBeenCalledWith(1);
    });

    expect(await screen.findByText(/donation record deleted and stock reconciled/i)).toBeDefined();
  });
});
