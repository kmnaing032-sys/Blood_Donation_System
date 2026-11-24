import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BloodRequests } from '../BloodRequests';
import bloodRequestService from '../../services/bloodRequestService';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../services/bloodRequestService', () => {
  return {
    getBloodRequests: vi.fn(),
    getBloodRequestById: vi.fn(),
    createBloodRequest: vi.fn(),
    updateBloodRequest: vi.fn(),
    approveBloodRequest: vi.fn(),
    rejectBloodRequest: vi.fn(),
    fulfillBloodRequest: vi.fn(),
    cancelBloodRequest: vi.fn(),
    REQUEST_STATUSES: ['pending', 'approved', 'rejected', 'fulfilled', 'cancelled'],
    REQUEST_URGENCIES: ['low', 'normal', 'high', 'critical'],
    default: {
      getBloodRequests: vi.fn(),
      getBloodRequestById: vi.fn(),
      createBloodRequest: vi.fn(),
      updateBloodRequest: vi.fn(),
      approveBloodRequest: vi.fn(),
      rejectBloodRequest: vi.fn(),
      fulfillBloodRequest: vi.fn(),
      cancelBloodRequest: vi.fn(),
      REQUEST_STATUSES: ['pending', 'approved', 'rejected', 'fulfilled', 'cancelled'],
      REQUEST_URGENCIES: ['low', 'normal', 'high', 'critical'],
    },
  };
});

describe('BloodRequests Page Component', () => {
  const mockUserStaff = {
    id: 10,
    email: 'staff@bloodcare.org',
    full_name: 'Staff Nurse',
    role: 'staff',
  };

  const mockUserRegular = {
    id: 20,
    email: 'user@example.com',
    full_name: 'Regular User',
    role: 'donor',
  };

  const mockRequestsList = [
    {
      id: 101,
      user_id: 20,
      patient_name: 'John Patient',
      hospital_name: 'City Central Hospital',
      hospital_address: '100 Main St',
      blood_group: 'A+',
      quantity_ml: 450,
      urgency: 'high',
      status: 'pending',
      contact_phone: '+1-555-0101',
      required_by: '2026-11-20T10:00:00Z',
      notes: 'Urgent surgery scheduled',
      created_at: '2026-11-18T08:00:00Z',
      updated_at: '2026-11-18T08:00:00Z',
    },
    {
      id: 102,
      user_id: 99,
      patient_name: 'Emily Davis',
      hospital_name: 'Memorial Clinic',
      hospital_address: '45 Health Ave',
      blood_group: 'O-',
      quantity_ml: 900,
      urgency: 'critical',
      status: 'approved',
      contact_phone: '+1-555-0102',
      required_by: '2026-11-19T14:00:00Z',
      notes: 'ICU trauma transfusion',
      created_at: '2026-11-18T09:00:00Z',
      updated_at: '2026-11-18T09:30:00Z',
    },
  ];

  const mockPaginatedResponse = {
    items: mockRequestsList,
    total: 2,
    page: 1,
    page_size: 10,
    total_pages: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUserStaff,
      isAuthenticated: true,
      loading: false,
    });
  });

  it('renders loading state initially', () => {
    bloodRequestService.getBloodRequests.mockReturnValue(new Promise(() => {}));

    render(<BloodRequests />);

    expect(screen.getByTestId('requests-loading')).toBeDefined();
    expect(screen.getByText(/Loading blood requests/i)).toBeDefined();
  });

  it('renders request list table successfully on API response', async () => {
    bloodRequestService.getBloodRequests.mockResolvedValueOnce(mockPaginatedResponse);

    render(<BloodRequests />);

    await waitFor(() => {
      expect(screen.queryByTestId('requests-loading')).toBeNull();
    });

    expect(screen.getByTestId('requests-table')).toBeDefined();
    expect(screen.getByText('John Patient')).toBeDefined();
    expect(screen.getByText('Emily Davis')).toBeDefined();
    expect(screen.getByTestId('cell-quantity-101').textContent).toContain('450 ml');
    expect(screen.getByTestId('cell-quantity-102').textContent).toContain('900 ml');
    expect(screen.getByTestId('badge-group-101').textContent).toContain('A+');
    expect(screen.getByTestId('badge-group-102').textContent).toContain('O-');
  });

  it('renders empty state when no requests match criteria', async () => {
    bloodRequestService.getBloodRequests.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
      total_pages: 0,
    });

    render(<BloodRequests />);

    await waitFor(() => {
      expect(screen.queryByTestId('requests-loading')).toBeNull();
    });

    expect(screen.getByTestId('requests-empty')).toBeDefined();
    expect(screen.getByText(/No Blood Requests Found/i)).toBeDefined();
  });

  it('renders error state on API failure and retries on button click', async () => {
    bloodRequestService.getBloodRequests.mockRejectedValueOnce({
      response: { data: { detail: 'Network connectivity lost' } },
    });

    render(<BloodRequests />);

    await waitFor(() => {
      expect(screen.queryByTestId('requests-loading')).toBeNull();
    });

    expect(screen.getByTestId('requests-error')).toBeDefined();
    expect(screen.getByText('Network connectivity lost')).toBeDefined();

    bloodRequestService.getBloodRequests.mockResolvedValueOnce(mockPaginatedResponse);
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByTestId('requests-table')).toBeDefined();
    });
  });

  it('filters requests by search input, blood group, and status', async () => {
    bloodRequestService.getBloodRequests.mockResolvedValue(mockPaginatedResponse);

    render(<BloodRequests />);

    await waitFor(() => {
      expect(screen.getByTestId('input-search')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('input-search'), {
      target: { value: 'John' },
    });
    fireEvent.change(screen.getByTestId('select-filter-group'), {
      target: { value: 'A+' },
    });
    fireEvent.change(screen.getByTestId('select-filter-status'), {
      target: { value: 'pending' },
    });

    await waitFor(() => {
      expect(bloodRequestService.getBloodRequests).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'John',
          blood_group: 'A+',
          status: 'pending',
          page: 1,
        })
      );
    });
  });

  it('opens and submits Create Blood Request form modal', async () => {
    bloodRequestService.getBloodRequests.mockResolvedValue(mockPaginatedResponse);
    bloodRequestService.createBloodRequest.mockResolvedValueOnce({
      id: 103,
      patient_name: 'Michael Green',
      blood_group: 'B+',
      quantity_ml: 500,
    });

    render(<BloodRequests />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-create-request')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-create-request'));

    expect(screen.getByTestId('request-form-modal')).toBeDefined();

    fireEvent.change(screen.getByTestId('input-patient-name'), {
      target: { value: 'Michael Green' },
    });
    fireEvent.change(screen.getByTestId('input-contact-phone'), {
      target: { value: '+1-555-8888' },
    });
    fireEvent.change(screen.getByTestId('input-hospital-name'), {
      target: { value: 'Mercy General' },
    });
    fireEvent.change(screen.getByTestId('input-hospital-address'), {
      target: { value: '789 Care Blvd' },
    });
    fireEvent.change(screen.getByTestId('select-blood-group'), {
      target: { value: 'B+' },
    });
    fireEvent.change(screen.getByTestId('input-quantity-ml'), {
      target: { value: '500' },
    });

    fireEvent.click(screen.getByTestId('btn-submit-request'));

    await waitFor(() => {
      expect(bloodRequestService.createBloodRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_name: 'Michael Green',
          contact_phone: '+1-555-8888',
          hospital_name: 'Mercy General',
          blood_group: 'B+',
          quantity_ml: 500,
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('feedback-banner').textContent).toContain(
        'Blood request for Michael Green submitted successfully'
      );
    });
  });

  it('validates form required fields before submission', async () => {
    bloodRequestService.getBloodRequests.mockResolvedValue(mockPaginatedResponse);

    render(<BloodRequests />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-create-request')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-create-request'));

    await waitFor(() => {
      expect(screen.getByTestId('request-form-modal')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('input-patient-name'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('input-contact-phone'), { target: { value: 'invalid' } });
    fireEvent.change(screen.getByTestId('input-quantity-ml'), { target: { value: '9999' } });

    fireEvent.click(screen.getByTestId('btn-submit-request'));

    await waitFor(() => {
      expect(screen.getByTestId('error-patient-name')).toBeDefined();
      expect(screen.getByTestId('error-contact-phone')).toBeDefined();
      expect(screen.getByTestId('error-quantity-ml')).toBeDefined();
    });
    expect(bloodRequestService.createBloodRequest).not.toHaveBeenCalled();
  });

  it('opens details modal when view icon is clicked', async () => {
    bloodRequestService.getBloodRequests.mockResolvedValue(mockPaginatedResponse);

    render(<BloodRequests />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-view-101')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-view-101'));

    expect(screen.getByTestId('request-detail-modal')).toBeDefined();
    expect(screen.getByTestId('detail-patient-name').textContent).toBe('John Patient');
    expect(screen.getByTestId('detail-hospital-name').textContent).toBe('City Central Hospital');
    expect(screen.getByTestId('detail-quantity').textContent).toBe('450 ml');
    expect(screen.getByTestId('detail-notes').textContent).toBe('Urgent surgery scheduled');
  });

  it('allows staff to approve a pending request', async () => {
    bloodRequestService.getBloodRequests.mockResolvedValue(mockPaginatedResponse);
    bloodRequestService.approveBloodRequest.mockResolvedValueOnce({
      ...mockRequestsList[0],
      status: 'approved',
    });

    render(<BloodRequests />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-approve-101')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-approve-101'));

    expect(screen.getByTestId('status-modal')).toBeDefined();
    fireEvent.change(screen.getByTestId('input-status-notes'), {
      target: { value: 'Approved for surgery' },
    });

    fireEvent.click(screen.getByTestId('btn-confirm-status-action'));

    await waitFor(() => {
      expect(bloodRequestService.approveBloodRequest).toHaveBeenCalledWith(
        101,
        'Approved for surgery'
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('feedback-banner').textContent).toContain(
        'Request #101 approved successfully'
      );
    });
  });

  it('allows staff to fulfill an approved request', async () => {
    bloodRequestService.getBloodRequests.mockResolvedValue(mockPaginatedResponse);
    bloodRequestService.fulfillBloodRequest.mockResolvedValueOnce({
      ...mockRequestsList[1],
      status: 'fulfilled',
    });

    render(<BloodRequests />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-fulfill-102')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-fulfill-102'));

    expect(screen.getByTestId('status-modal')).toBeDefined();
    fireEvent.click(screen.getByTestId('btn-confirm-status-action'));

    await waitFor(() => {
      expect(bloodRequestService.fulfillBloodRequest).toHaveBeenCalledWith(102, '');
    });

    await waitFor(() => {
      expect(screen.getByTestId('feedback-banner').textContent).toContain(
        'Request #102 fulfilled and stock deducted'
      );
    });
  });

  it('allows request creator to edit and cancel their pending request', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUserRegular, // id: 20, owner of request #101
      isAuthenticated: true,
      loading: false,
    });

    bloodRequestService.getBloodRequests.mockResolvedValue(mockPaginatedResponse);
    bloodRequestService.cancelBloodRequest.mockResolvedValueOnce({
      ...mockRequestsList[0],
      status: 'cancelled',
    });

    render(<BloodRequests />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-edit-101')).toBeDefined();
      expect(screen.getByTestId('btn-cancel-101')).toBeDefined();
    });

    // Request #102 belongs to user 99, so regular user 20 cannot edit or cancel it
    expect(screen.queryByTestId('btn-edit-102')).toBeNull();
    expect(screen.queryByTestId('btn-cancel-102')).toBeNull();

    // Cancel request #101
    fireEvent.click(screen.getByTestId('btn-cancel-101'));
    expect(screen.getByTestId('status-modal')).toBeDefined();
    fireEvent.click(screen.getByTestId('btn-confirm-status-action'));

    await waitFor(() => {
      expect(bloodRequestService.cancelBloodRequest).toHaveBeenCalledWith(101, '');
    });

    await waitFor(() => {
      expect(screen.getByTestId('feedback-banner').textContent).toContain(
        'Request #101 cancelled'
      );
    });
  });
});
