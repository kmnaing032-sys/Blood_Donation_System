import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../../api/axios';
import {
  getBloodRequests,
  getBloodRequestById,
  createBloodRequest,
  updateBloodRequest,
  approveBloodRequest,
  rejectBloodRequest,
  fulfillBloodRequest,
  cancelBloodRequest,
} from '../bloodRequestService';

vi.mock('../../api/axios');

describe('bloodRequestService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBloodRequests', () => {
    it('calls GET /blood-requests/ with cleaned parameters', async () => {
      const mockResponse = {
        items: [{ id: 1, patient_name: 'Jane Doe', blood_group: 'A+', quantity_ml: 450 }],
        total: 1,
        page: 1,
        page_size: 10,
        total_pages: 1,
      };
      apiClient.get.mockResolvedValueOnce({ data: mockResponse });

      const result = await getBloodRequests({
        page: 2,
        page_size: 10,
        blood_group: 'A+',
        status: 'pending',
        search: 'Jane',
        sort_by: 'created_at',
        sort_order: 'desc',
      });

      expect(apiClient.get).toHaveBeenCalledWith('/blood-requests/', {
        params: {
          page: 2,
          page_size: 10,
          blood_group: 'A+',
          status: 'pending',
          search: 'Jane',
          sort_by: 'created_at',
          sort_order: 'desc',
        },
      });
      expect(result).toEqual(mockResponse);
    });

    it('ignores "all" values for filters', async () => {
      apiClient.get.mockResolvedValueOnce({ data: { items: [], total: 0 } });

      await getBloodRequests({
        blood_group: 'all',
        status: 'all',
      });

      expect(apiClient.get).toHaveBeenCalledWith('/blood-requests/', {
        params: {},
      });
    });
  });

  describe('getBloodRequestById', () => {
    it('calls GET /blood-requests/{id}', async () => {
      const mockItem = { id: 5, patient_name: 'John Smith', blood_group: 'O+' };
      apiClient.get.mockResolvedValueOnce({ data: mockItem });

      const result = await getBloodRequestById(5);

      expect(apiClient.get).toHaveBeenCalledWith('/blood-requests/5');
      expect(result).toEqual(mockItem);
    });
  });

  describe('createBloodRequest', () => {
    it('calls POST /blood-requests/ with trimmed and cast payload', async () => {
      const newReq = {
        patient_name: '  Alice Johnson ',
        hospital_name: ' General Hospital ',
        hospital_address: ' 123 Health Ave ',
        blood_group: 'B+',
        quantity_ml: '450',
        urgency: 'high',
        contact_phone: ' +1-555-0199 ',
        notes: ' Pre-op preparation ',
      };
      const created = { id: 10, ...newReq, quantity_ml: 450, status: 'pending' };
      apiClient.post.mockResolvedValueOnce({ data: created });

      const result = await createBloodRequest(newReq);

      expect(apiClient.post).toHaveBeenCalledWith('/blood-requests/', {
        patient_name: 'Alice Johnson',
        hospital_name: 'General Hospital',
        hospital_address: '123 Health Ave',
        blood_group: 'B+',
        quantity_ml: 450,
        urgency: 'high',
        contact_phone: '+1-555-0199',
        notes: 'Pre-op preparation',
      });
      expect(result).toEqual(created);
    });
  });

  describe('updateBloodRequest', () => {
    it('calls PATCH /blood-requests/{id} with partial update fields', async () => {
      const updateData = {
        patient_name: 'Alice J. Smith',
        quantity_ml: 500,
      };
      const updated = { id: 10, patient_name: 'Alice J. Smith', quantity_ml: 500 };
      apiClient.patch.mockResolvedValueOnce({ data: updated });

      const result = await updateBloodRequest(10, updateData);

      expect(apiClient.patch).toHaveBeenCalledWith('/blood-requests/10', {
        patient_name: 'Alice J. Smith',
        quantity_ml: 500,
      });
      expect(result).toEqual(updated);
    });
  });

  describe('Status Transitions', () => {
    it('calls approve endpoint with optional notes', async () => {
      apiClient.post.mockResolvedValueOnce({ data: { id: 1, status: 'approved' } });
      const res = await approveBloodRequest(1, 'Approved by Doctor');
      expect(apiClient.post).toHaveBeenCalledWith('/blood-requests/1/approve', {
        notes: 'Approved by Doctor',
      });
      expect(res.status).toBe('approved');
    });

    it('calls reject endpoint', async () => {
      apiClient.post.mockResolvedValueOnce({ data: { id: 1, status: 'rejected' } });
      const res = await rejectBloodRequest(1, 'No inventory available');
      expect(apiClient.post).toHaveBeenCalledWith('/blood-requests/1/reject', {
        notes: 'No inventory available',
      });
      expect(res.status).toBe('rejected');
    });

    it('calls fulfill endpoint', async () => {
      apiClient.post.mockResolvedValueOnce({ data: { id: 1, status: 'fulfilled' } });
      const res = await fulfillBloodRequest(1, 'Units dispatched');
      expect(apiClient.post).toHaveBeenCalledWith('/blood-requests/1/fulfill', {
        notes: 'Units dispatched',
      });
      expect(res.status).toBe('fulfilled');
    });

    it('calls cancel endpoint', async () => {
      apiClient.post.mockResolvedValueOnce({ data: { id: 1, status: 'cancelled' } });
      const res = await cancelBloodRequest(1, 'Patient discharged');
      expect(apiClient.post).toHaveBeenCalledWith('/blood-requests/1/cancel', {
        notes: 'Patient discharged',
      });
      expect(res.status).toBe('cancelled');
    });
  });
});
