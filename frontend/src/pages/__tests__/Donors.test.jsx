/**
 * Donors.test.jsx — Unit & Integration tests for Donor Management UI
 *
 * Requirements covered:
 * 1. Donor list loading state.
 * 2. Donor list success rendering.
 * 3. Empty donor list view.
 * 4. Donor API error display.
 * 5. Search donors.
 * 6. Blood group filtering.
 * 7. Pagination controls.
 * 8. Add donor form validation & submission.
 * 9. Edit donor.
 * 10. View donor details.
 * 11. Delete confirmation dialog.
 * 12. Successful deletion.
 * 13. Failed form validation.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Donors } from '../Donors';
import donorService from '../../services/donorService';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../services/donorService', () => {
  return {
    getDonors: vi.fn(),
    getDonorById: vi.fn(),
    createDonor: vi.fn(),
    updateDonor: vi.fn(),
    deleteDonor: vi.fn(),
    bulkDonorAction: vi.fn(),
    exportDonorsCSV: vi.fn(),
    BLOOD_GROUPS: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    GENDERS: ['male', 'female', 'other'],
    default: {
      getDonors: vi.fn(),
      getDonorById: vi.fn(),
      createDonor: vi.fn(),
      updateDonor: vi.fn(),
      deleteDonor: vi.fn(),
      bulkDonorAction: vi.fn(),
      exportDonorsCSV: vi.fn(),
      BLOOD_GROUPS: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
      GENDERS: ['male', 'female', 'other'],
    },
  };
});

const mockDonors = [
  {
    id: 1,
    user_id: 101,
    full_name: 'John Doe',
    email: 'john@example.com',
    phone: '+1-555-0101',
    date_of_birth: '1990-01-01',
    age: 34,
    gender: 'male',
    blood_group: 'O+',
    address: '123 Main Street',
    last_donation_date: '2024-01-10',
    created_at: '2024-01-01T12:00:00Z',
  },
  {
    id: 2,
    user_id: 102,
    full_name: 'Jane Smith',
    email: 'jane@example.com',
    phone: '+1-555-0202',
    date_of_birth: '1995-05-15',
    age: 29,
    gender: 'female',
    blood_group: 'A-',
    address: '456 Oak Avenue',
    last_donation_date: null,
    created_at: '2024-02-01T12:00:00Z',
  },
];

const adminUser = { id: 99, full_name: 'Admin User', role: 'admin' };

describe('Donors Page Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: adminUser,
      isAuthenticated: true,
      loading: false,
    });
  });

  it('renders loading state initially while fetching donors', () => {
    donorService.getDonors.mockReturnValue(new Promise(() => {}));

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    expect(screen.getByTestId('donors-loading')).toBeDefined();
    expect(screen.getByText(/loading donors list/i)).toBeDefined();
  });

  it('renders list of donors on API success', async () => {
    donorService.getDonors.mockResolvedValueOnce({
      items: mockDonors,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('donors-table')).toBeDefined();
    });

    expect(screen.getByText('John Doe')).toBeDefined();
    expect(screen.getByText('Jane Smith')).toBeDefined();
    expect(screen.getByTestId('donor-row-1')).toBeDefined();
    expect(screen.getByTestId('donor-row-2')).toBeDefined();
  });

  it('renders empty state when no donors are returned', async () => {
    donorService.getDonors.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
      total_pages: 0,
    });

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('donors-empty')).toBeDefined();
    });

    expect(screen.getByText(/no donor records found/i)).toBeDefined();
  });

  it('renders error state on API failure', async () => {
    donorService.getDonors.mockRejectedValueOnce({
      response: { data: { detail: 'Database connection failed' } },
    });

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('donors-error')).toBeDefined();
    });

    expect(screen.getByText(/database connection failed/i)).toBeDefined();
  });

  it('supports search input and triggers filtered fetch', async () => {
    donorService.getDonors.mockResolvedValue({
      items: mockDonors,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('donors-table')).toBeDefined();
    });

    const searchInput = screen.getByTestId('donor-search-input');
    fireEvent.change(searchInput, { target: { value: 'John' } });

    await waitFor(() => {
      expect(donorService.getDonors).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'John', page: 1 })
      );
    });
  });

  it('supports blood group filter selection', async () => {
    donorService.getDonors.mockResolvedValue({
      items: [mockDonors[0]],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('donors-table')).toBeDefined();
    });

    const filter = screen.getByTestId('blood-group-filter');
    fireEvent.change(filter, { target: { value: 'O+' } });

    await waitFor(() => {
      expect(donorService.getDonors).toHaveBeenCalledWith(
        expect.objectContaining({ blood_group: 'O+', page: 1 })
      );
    });
  });

  it('handles pagination navigation', async () => {
    donorService.getDonors.mockResolvedValue({
      items: mockDonors,
      total: 25,
      page: 1,
      page_size: 10,
      total_pages: 3,
    });

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('pagination-bar')).toBeDefined();
    });

    const nextBtn = screen.getByTestId('next-page-btn');
    expect(nextBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(donorService.getDonors).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });
  });

  it('opens donor details modal when View action is clicked', async () => {
    donorService.getDonors.mockResolvedValueOnce({
      items: mockDonors,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('view-donor-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('view-donor-1'));

    expect(screen.getByTestId('donor-detail-modal')).toBeDefined();
    expect(screen.getByTestId('detail-full-name').textContent).toBe('John Doe');
  });

  it('validates required fields in Add Donor modal', async () => {
    donorService.getDonors.mockResolvedValueOnce({
      items: mockDonors,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('add-donor-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('add-donor-btn'));

    expect(screen.getByTestId('donor-form-modal')).toBeDefined();

    // Click save without entering inputs
    fireEvent.click(screen.getByTestId('submit-donor-btn'));

    expect(await screen.findByText(/phone number is required/i)).toBeDefined();
    expect(await screen.findByText(/date of birth is required/i)).toBeDefined();
    expect(await screen.findByText(/address is required/i)).toBeDefined();
    expect(donorService.createDonor).not.toHaveBeenCalled();
  });

  it('submits valid Add Donor form and refreshes list', async () => {
    donorService.getDonors.mockResolvedValue({
      items: mockDonors,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });
    donorService.createDonor.mockResolvedValueOnce({ id: 3, full_name: 'New Donor' });

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('add-donor-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('add-donor-btn'));

    fireEvent.change(screen.getByLabelText(/phone number/i), {
      target: { value: '+1-555-9999' },
    });
    fireEvent.change(screen.getByLabelText(/date of birth/i), {
      target: { value: '1998-04-12' },
    });
    fireEvent.change(screen.getByLabelText(/address/i), {
      target: { value: '789 Maple Drive, City' },
    });

    fireEvent.click(screen.getByTestId('submit-donor-btn'));

    await waitFor(() => {
      expect(donorService.createDonor).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '+1-555-9999',
          date_of_birth: '1998-04-12',
          address: '789 Maple Drive, City',
        })
      );
    });

    expect(await screen.findByText(/donor registered successfully/i)).toBeDefined();
  });

  it('opens Edit modal and submits updated donor profile', async () => {
    donorService.getDonors.mockResolvedValue({
      items: mockDonors,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });
    donorService.updateDonor.mockResolvedValueOnce({ id: 1, phone: '+1-555-1111' });

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('edit-donor-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('edit-donor-1'));

    expect(screen.getByText(/edit donor profile/i)).toBeDefined();

    fireEvent.change(screen.getByLabelText(/phone number/i), {
      target: { value: '+1-555-1111' },
    });

    fireEvent.click(screen.getByTestId('submit-donor-btn'));

    await waitFor(() => {
      expect(donorService.updateDonor).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ phone: '+1-555-1111' })
      );
    });

    expect(await screen.findByText(/donor profile updated successfully/i)).toBeDefined();
  });

  it('prompts delete confirmation modal and executes deletion', async () => {
    donorService.getDonors.mockResolvedValue({
      items: mockDonors,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });
    donorService.deleteDonor.mockResolvedValueOnce({ message: 'Deleted' });

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('delete-donor-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('delete-donor-1'));

    expect(screen.getByTestId('delete-confirm-modal')).toBeDefined();
    expect(screen.getByText(/are you sure you want to delete/i)).toBeDefined();

    fireEvent.click(screen.getByTestId('confirm-delete-btn'));

    await waitFor(() => {
      expect(donorService.deleteDonor).toHaveBeenCalledWith(1);
    });

    expect(await screen.findByText(/donor deleted successfully/i)).toBeDefined();
  });

  it('handles row selection, Select All, and bulk actions toolbar', async () => {
    donorService.getDonors.mockResolvedValue({
      items: mockDonors,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });
    donorService.bulkDonorAction.mockResolvedValueOnce({
      requested_count: 2,
      successful_count: 2,
      failed_count: 0,
      action: 'activate',
      message: 'Successfully activated 2 donor account(s).',
    });

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('donor-row-1')).toBeDefined();
    });

    // Bulk toolbar should not be visible when no donor is selected
    expect(screen.queryByTestId('bulk-actions-toolbar')).toBeNull();

    // Select individual donor 1
    const checkbox1 = screen.getByTestId('select-donor-1');
    fireEvent.click(checkbox1);

    // Toolbar appears
    expect(screen.getByTestId('bulk-actions-toolbar')).toBeDefined();
    expect(screen.getByText(/1 donor selected/i)).toBeDefined();

    // Click Select All
    const selectAllCheckbox = screen.getByTestId('select-all-checkbox');
    fireEvent.click(selectAllCheckbox);

    expect(screen.getByText(/2 donors selected/i)).toBeDefined();

    // Trigger Bulk Activate
    fireEvent.click(screen.getByTestId('bulk-activate-btn'));

    // Modal appears
    expect(screen.getByTestId('bulk-confirm-modal')).toBeDefined();
    expect(screen.getByText(/confirm bulk activation/i)).toBeDefined();

    // Confirm bulk activation
    fireEvent.click(screen.getByTestId('confirm-bulk-action-btn'));

    await waitFor(() => {
      expect(donorService.bulkDonorAction).toHaveBeenCalledWith('activate', [1, 2]);
    });

    expect(await screen.findByText(/successfully activated 2 donor account/i)).toBeDefined();
  });

  it('supports advanced filtering by account status, date ranges, and clearing filters', async () => {
    donorService.getDonors.mockResolvedValue({
      items: mockDonors,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('donor-search-input')).toBeDefined();
    });

    // 1. Account status filter
    const statusSelect = screen.getByTestId('account-status-filter');
    fireEvent.change(statusSelect, { target: { value: 'active' } });

    await waitFor(() => {
      expect(donorService.getDonors).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: true, page: 1 })
      );
    });

    // 2. Date range filter
    const startDateInput = screen.getByTestId('filter-start-date');
    const endDateInput = screen.getByTestId('filter-end-date');
    fireEvent.change(startDateInput, { target: { value: '2026-01-01' } });
    fireEvent.change(endDateInput, { target: { value: '2026-12-31' } });

    await waitFor(() => {
      expect(donorService.getDonors).toHaveBeenCalledWith(
        expect.objectContaining({
          start_date: '2026-01-01',
          end_date: '2026-12-31',
          is_active: true,
          page: 1,
        })
      );
    });

    // 3. Clear filters button appears and resets state
    const clearBtn = screen.getByTestId('clear-filters-btn');
    expect(clearBtn).toBeDefined();
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(donorService.getDonors).toHaveBeenCalledWith(
        expect.objectContaining({
          search: '',
          blood_group: 'all',
          gender: 'all',
          page: 1,
        })
      );
    });
  });

  it('handles Export CSV action with loading and success feedback', async () => {
    donorService.getDonors.mockResolvedValue({
      items: mockDonors,
      total: 2,
      page: 1,
      page_size: 10,
      total_pages: 1,
    });
    const fakeCsvBlob = new Blob(['Donor ID,Full Name\n1,John Doe'], { type: 'text/csv' });
    donorService.exportDonorsCSV.mockResolvedValueOnce(fakeCsvBlob);

    // Mock URL.createObjectURL and URL.revokeObjectURL
    const mockCreateObjectURL = vi.fn(() => 'blob:http://localhost:3000/12345');
    const mockRevokeObjectURL = vi.fn();
    window.URL.createObjectURL = mockCreateObjectURL;
    window.URL.revokeObjectURL = mockRevokeObjectURL;

    render(
      <MemoryRouter>
        <Donors />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('export-donors-csv-btn')).toBeDefined();
    });

    const exportBtn = screen.getByTestId('export-donors-csv-btn');
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(donorService.exportDonorsCSV).toHaveBeenCalled();
    });

    expect(await screen.findByText(/donor csv export downloaded successfully/i)).toBeDefined();
  });
});
