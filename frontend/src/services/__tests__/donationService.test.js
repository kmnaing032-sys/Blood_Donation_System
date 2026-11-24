/**
 * donationService.test.js — Unit tests for Donation API Service
 *
 * Requirements covered:
 * 1. getDonations sends clean query params.
 * 2. getDonationById calls GET /donations/{id}.
 * 3. createDonation calls POST /donations/ with payload.
 * 4. updateDonation calls PATCH /donations/{id} with payload.
 * 5. deleteDonation calls DELETE /donations/{id}.
 * 6. Statuses constant exposes actual backend values.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/axios', () => {
  const mockClient = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  return {
    default: mockClient,
    setAuthToken: vi.fn(),
    getAccessToken: vi.fn(),
  };
});

import apiClient from '../../api/axios';
import {
  getDonations,
  getDonationById,
  createDonation,
  updateDonation,
  deleteDonation,
  DONATION_STATUSES,
} from '../donationService';

describe('donationService API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct donation statuses matching backend constraints', () => {
    expect(DONATION_STATUSES).toEqual(['completed', 'pending', 'cancelled', 'rejected']);
  });

  describe('getDonations()', () => {
    it('calls GET /donations/ with clean query parameters', async () => {
      const mockResult = {
        items: [{ id: 1, blood_group: 'O+', quantity_ml: 450 }],
        total: 1,
        page: 1,
        page_size: 10,
        total_pages: 1,
      };
      apiClient.get.mockResolvedValueOnce({ data: mockResult });

      const res = await getDonations({
        page: 2,
        page_size: 15,
        donor_id: 10,
        blood_group: 'O+',
        status: 'completed',
        donation_date: '2024-03-01',
        search: '  John  ',
      });

      expect(apiClient.get).toHaveBeenCalledWith('/donations/', {
        params: {
          page: 2,
          page_size: 15,
          donor_id: 10,
          blood_group: 'O+',
          status: 'completed',
          donation_date: '2024-03-01',
          search: 'John',
        },
      });
      expect(res).toEqual(mockResult);
    });

    it('omits filter params when value is "all" or empty', async () => {
      apiClient.get.mockResolvedValueOnce({ data: { items: [] } });

      await getDonations({
        blood_group: 'all',
        status: 'all',
        search: '   ',
      });

      expect(apiClient.get).toHaveBeenCalledWith('/donations/', {
        params: {},
      });
    });
  });

  describe('getDonationById()', () => {
    it('calls GET /donations/{id}', async () => {
      const mockDonation = { id: 7, blood_group: 'A+', quantity_ml: 450 };
      apiClient.get.mockResolvedValueOnce({ data: mockDonation });

      const res = await getDonationById(7);
      expect(apiClient.get).toHaveBeenCalledWith('/donations/7');
      expect(res).toEqual(mockDonation);
    });
  });

  describe('createDonation()', () => {
    it('calls POST /donations/ with payload', async () => {
      const payload = {
        donor_id: 1,
        donation_date: '2024-02-15',
        quantity_ml: 450,
        blood_group: 'O+',
        status: 'completed',
        notes: 'Routine blood drive',
      };
      apiClient.post.mockResolvedValueOnce({ data: { id: 12, ...payload } });

      const res = await createDonation(payload);
      expect(apiClient.post).toHaveBeenCalledWith('/donations/', payload);
      expect(res.id).toBe(12);
    });
  });

  describe('updateDonation()', () => {
    it('calls PATCH /donations/{id} with payload', async () => {
      const payload = {
        status: 'cancelled',
        notes: 'Cancelled due to low hemoglobin',
      };
      apiClient.patch.mockResolvedValueOnce({ data: { id: 12, ...payload } });

      const res = await updateDonation(12, payload);
      expect(apiClient.patch).toHaveBeenCalledWith('/donations/12', payload);
      expect(res.status).toBe('cancelled');
    });
  });

  describe('deleteDonation()', () => {
    it('calls DELETE /donations/{id}', async () => {
      apiClient.delete.mockResolvedValueOnce({
        data: { message: 'Donation record deleted successfully and blood stock reconciled' },
      });

      const res = await deleteDonation(12);
      expect(apiClient.delete).toHaveBeenCalledWith('/donations/12');
      expect(res.message).toContain('deleted');
    });
  });
});
