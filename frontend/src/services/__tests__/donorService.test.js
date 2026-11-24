/**
 * donorService.test.js — Unit tests for Donor API Service
 *
 * Requirements covered:
 * 1. getDonors sends clean query params (page, page_size, search, blood_group, gender).
 * 2. getDonorById fetches single donor by id.
 * 3. createDonor calls POST /donors/ with body.
 * 4. updateDonor calls PATCH /donors/{id} with payload.
 * 5. deleteDonor calls DELETE /donors/{id}.
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
  getDonors,
  getDonorById,
  createDonor,
  updateDonor,
  deleteDonor,
  BLOOD_GROUPS,
  GENDERS,
} from '../donorService';

describe('donorService API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes correct blood groups and genders matching backend constraints', () => {
    expect(BLOOD_GROUPS).toEqual(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
    expect(GENDERS).toEqual(['male', 'female', 'other']);
  });

  describe('getDonors()', () => {
    it('calls GET /donors/ with formatted parameters', async () => {
      const mockResult = {
        items: [{ id: 1, blood_group: 'A+' }],
        total: 1,
        page: 1,
        page_size: 10,
        total_pages: 1,
      };
      apiClient.get.mockResolvedValueOnce({ data: mockResult });

      const res = await getDonors({
        page: 2,
        page_size: 20,
        search: '  John Doe  ',
        blood_group: 'O+',
        gender: 'male',
      });

      expect(apiClient.get).toHaveBeenCalledWith('/donors/', {
        params: {
          page: 2,
          page_size: 20,
          search: 'John Doe',
          blood_group: 'O+',
          gender: 'male',
        },
      });
      expect(res).toEqual(mockResult);
    });

    it('omits filter params when value is "all" or empty', async () => {
      apiClient.get.mockResolvedValueOnce({ data: { items: [] } });

      await getDonors({
        blood_group: 'all',
        gender: 'all',
        search: '   ',
      });

      expect(apiClient.get).toHaveBeenCalledWith('/donors/', {
        params: {},
      });
    });
  });

  describe('getDonorById()', () => {
    it('calls GET /donors/{id}', async () => {
      const mockDonor = { id: 5, full_name: 'Alice' };
      apiClient.get.mockResolvedValueOnce({ data: mockDonor });

      const res = await getDonorById(5);
      expect(apiClient.get).toHaveBeenCalledWith('/donors/5');
      expect(res).toEqual(mockDonor);
    });
  });

  describe('createDonor()', () => {
    it('calls POST /donors/ with payload', async () => {
      const payload = {
        phone: '+1234567890',
        date_of_birth: '1995-05-15',
        gender: 'female',
        blood_group: 'B+',
        address: '123 Main St, Springfield',
      };
      apiClient.post.mockResolvedValueOnce({ data: { id: 10, ...payload } });

      const res = await createDonor(payload);
      expect(apiClient.post).toHaveBeenCalledWith('/donors/', payload);
      expect(res.id).toBe(10);
    });
  });

  describe('updateDonor()', () => {
    it('calls PATCH /donors/{id} with updated fields', async () => {
      const payload = { phone: '+1987654321', address: '456 Elm St' };
      apiClient.patch.mockResolvedValueOnce({ data: { id: 5, ...payload } });

      const res = await updateDonor(5, payload);
      expect(apiClient.patch).toHaveBeenCalledWith('/donors/5', payload);
      expect(res.phone).toBe('+1987654321');
    });
  });

  describe('deleteDonor()', () => {
    it('calls DELETE /donors/{id}', async () => {
      apiClient.delete.mockResolvedValueOnce({ data: { message: 'Donor profile deleted successfully' } });

      const res = await deleteDonor(8);
      expect(apiClient.delete).toHaveBeenCalledWith('/donors/8');
      expect(res.message).toContain('deleted');
    });
  });
});
