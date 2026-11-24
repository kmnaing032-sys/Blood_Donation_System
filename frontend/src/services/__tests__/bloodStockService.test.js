import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../../api/axios';
import {
  getBloodStockSummary,
  getBloodStocks,
  getBloodStockByGroup,
  getBloodStockById,
  updateBloodStock,
} from '../bloodStockService';

vi.mock('../../api/axios');

describe('bloodStockService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBloodStockSummary', () => {
    it('fetches inventory summary from /blood-stock/summary', async () => {
      const mockSummary = {
        total_available_ml: 12500,
        total_reserved_ml: 1500,
        total_inventory_ml: 14000,
        stock_by_group: [
          { blood_group: 'A+', available_ml: 2500, reserved_ml: 500, total_ml: 3000, status: 'sufficient' },
          { blood_group: 'O-', available_ml: 450, reserved_ml: 0, total_ml: 450, status: 'low' },
        ],
      };
      apiClient.get.mockResolvedValueOnce({ data: mockSummary });

      const result = await getBloodStockSummary();

      expect(apiClient.get).toHaveBeenCalledWith('/blood-stock/summary');
      expect(result).toEqual(mockSummary);
    });

    it('propagates API errors when fetching summary fails', async () => {
      apiClient.get.mockRejectedValueOnce(new Error('Network error'));
      await expect(getBloodStockSummary()).rejects.toThrow('Network error');
    });
  });

  describe('getBloodStocks', () => {
    it('fetches paginated blood stock with default empty params', async () => {
      const mockData = {
        items: [{ id: 1, blood_group: 'A+', available_quantity_ml: 2500, reserved_quantity_ml: 500, total_quantity_ml: 3000 }],
        total: 1,
        page: 1,
        page_size: 10,
        total_pages: 1,
      };
      apiClient.get.mockResolvedValueOnce({ data: mockData });

      const result = await getBloodStocks();

      expect(apiClient.get).toHaveBeenCalledWith('/blood-stock/', { params: {} });
      expect(result).toEqual(mockData);
    });

    it('passes cleaned filters and sort parameters', async () => {
      const mockData = { items: [], total: 0, page: 2, page_size: 5, total_pages: 0 };
      apiClient.get.mockResolvedValueOnce({ data: mockData });

      await getBloodStocks({
        page: 2,
        page_size: 5,
        blood_group: 'B+',
        min_quantity: '500',
        max_quantity: '2000',
        sort_by: 'available_quantity_ml',
        sort_order: 'desc',
      });

      expect(apiClient.get).toHaveBeenCalledWith('/blood-stock/', {
        params: {
          page: 2,
          page_size: 5,
          blood_group: 'B+',
          min_quantity: 500,
          max_quantity: 2000,
          sort_by: 'available_quantity_ml',
          sort_order: 'desc',
        },
      });
    });
  });

  describe('getBloodStockByGroup', () => {
    it('encodes blood group parameter in URL', async () => {
      const mockItem = { id: 1, blood_group: 'A+', available_quantity_ml: 1000, reserved_quantity_ml: 0, total_quantity_ml: 1000 };
      apiClient.get.mockResolvedValueOnce({ data: mockItem });

      const result = await getBloodStockByGroup('A+');

      expect(apiClient.get).toHaveBeenCalledWith('/blood-stock/group/A%2B');
      expect(result).toEqual(mockItem);
    });
  });

  describe('getBloodStockById', () => {
    it('fetches blood stock record by unique ID', async () => {
      const mockItem = { id: 3, blood_group: 'O+', available_quantity_ml: 4500, reserved_quantity_ml: 500, total_quantity_ml: 5000 };
      apiClient.get.mockResolvedValueOnce({ data: mockItem });

      const result = await getBloodStockById(3);

      expect(apiClient.get).toHaveBeenCalledWith('/blood-stock/3');
      expect(result).toEqual(mockItem);
    });
  });

  describe('updateBloodStock', () => {
    it('sends PATCH request with parsed numeric volumes', async () => {
      const mockUpdated = { id: 2, blood_group: 'O-', available_quantity_ml: 1200, reserved_quantity_ml: 100, total_quantity_ml: 1300 };
      apiClient.patch.mockResolvedValueOnce({ data: mockUpdated });

      const result = await updateBloodStock(2, {
        available_quantity_ml: '1200',
        reserved_quantity_ml: '100',
      });

      expect(apiClient.patch).toHaveBeenCalledWith('/blood-stock/2', {
        available_quantity_ml: 1200,
        reserved_quantity_ml: 100,
      });
      expect(result).toEqual(mockUpdated);
    });
  });
});
