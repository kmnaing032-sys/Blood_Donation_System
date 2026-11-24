import apiClient from '../api/axios';
import { API_ENDPOINTS } from '../api/endpoints';

/**
 * Blood Stock Service
 *
 * All functions interact with the verified backend blood stock endpoints:
 *   - GET   /api/v1/blood-stock/summary
 *   - GET   /api/v1/blood-stock/
 *   - GET   /api/v1/blood-stock/group/{blood_group}
 *   - GET   /api/v1/blood-stock/{id}
 *   - PATCH /api/v1/blood-stock/{id}
 */

/**
 * Fetch aggregate blood stock summary across all 8 blood groups.
 *
 * @returns {Promise<{
 *   total_available_ml: number,
 *   total_reserved_ml: number,
 *   total_inventory_ml: number,
 *   stock_by_group: Array<{
 *     blood_group: string,
 *     available_ml: number,
 *     reserved_ml: number,
 *     total_ml: number,
 *     status: 'critical' | 'low' | 'normal' | 'sufficient'
 *   }>
 * }>}
 */
export const getBloodStockSummary = async () => {
  const response = await apiClient.get(API_ENDPOINTS.BLOOD_STOCK.SUMMARY);
  return response.data;
};

/**
 * Fetch paginated list of blood stocks with optional filtering and sorting.
 *
 * @param {Object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.page_size=10]
 * @param {string} [params.blood_group] - e.g. "A+", "O-"
 * @param {number} [params.min_quantity] - min available volume in ml
 * @param {number} [params.max_quantity] - max available volume in ml
 * @param {string} [params.sort_by='blood_group'] - 'blood_group' | 'available_quantity_ml' | 'reserved_quantity_ml' | 'updated_at'
 * @param {string} [params.sort_order='asc'] - 'asc' | 'desc'
 * @returns {Promise<{
 *   items: Array<{
 *     id: number,
 *     blood_group: string,
 *     available_quantity_ml: number,
 *     reserved_quantity_ml: number,
 *     total_quantity_ml: number,
 *     updated_at: string
 *   }>,
 *   total: number,
 *   page: number,
 *   page_size: number,
 *   total_pages: number
 * }>}
 */
export const getBloodStocks = async (params = {}) => {
  const cleanParams = {};
  if (params.page !== undefined && params.page !== null) cleanParams.page = params.page;
  if (params.page_size !== undefined && params.page_size !== null) cleanParams.page_size = params.page_size;
  if (params.blood_group) cleanParams.blood_group = params.blood_group;
  if (params.min_quantity !== undefined && params.min_quantity !== '' && params.min_quantity !== null) {
    cleanParams.min_quantity = Number(params.min_quantity);
  }
  if (params.max_quantity !== undefined && params.max_quantity !== '' && params.max_quantity !== null) {
    cleanParams.max_quantity = Number(params.max_quantity);
  }
  if (params.sort_by) cleanParams.sort_by = params.sort_by;
  if (params.sort_order) cleanParams.sort_order = params.sort_order;

  const response = await apiClient.get(API_ENDPOINTS.BLOOD_STOCK.LIST, {
    params: cleanParams,
  });
  return response.data;
};

/**
 * Fetch stock levels for a specific blood group.
 *
 * @param {string} bloodGroup - e.g. "A+", "O-"
 * @returns {Promise<{
 *   id: number,
 *   blood_group: string,
 *   available_quantity_ml: number,
 *   reserved_quantity_ml: number,
 *   total_quantity_ml: number,
 *   updated_at: string
 * }>}
 */
export const getBloodStockByGroup = async (bloodGroup) => {
  const response = await apiClient.get(API_ENDPOINTS.BLOOD_STOCK.BY_GROUP(bloodGroup));
  return response.data;
};

/**
 * Fetch a specific blood stock record by unique ID.
 *
 * @param {number|string} stockId
 * @returns {Promise<{
 *   id: number,
 *   blood_group: string,
 *   available_quantity_ml: number,
 *   reserved_quantity_ml: number,
 *   total_quantity_ml: number,
 *   updated_at: string
 * }>}
 */
export const getBloodStockById = async (stockId) => {
  const response = await apiClient.get(API_ENDPOINTS.BLOOD_STOCK.DETAIL(stockId));
  return response.data;
};

/**
 * Update stock quantities manually (Admin and Staff only).
 *
 * @param {number|string} stockId
 * @param {Object} updateData
 * @param {number} [updateData.available_quantity_ml]
 * @param {number} [updateData.reserved_quantity_ml]
 * @returns {Promise<{
 *   id: number,
 *   blood_group: string,
 *   available_quantity_ml: number,
 *   reserved_quantity_ml: number,
 *   total_quantity_ml: number,
 *   updated_at: string
 * }>}
 */
export const updateBloodStock = async (stockId, updateData) => {
  const payload = {};
  if (updateData.available_quantity_ml !== undefined && updateData.available_quantity_ml !== null && updateData.available_quantity_ml !== '') {
    payload.available_quantity_ml = Number(updateData.available_quantity_ml);
  }
  if (updateData.reserved_quantity_ml !== undefined && updateData.reserved_quantity_ml !== null && updateData.reserved_quantity_ml !== '') {
    payload.reserved_quantity_ml = Number(updateData.reserved_quantity_ml);
  }

  const response = await apiClient.patch(API_ENDPOINTS.BLOOD_STOCK.UPDATE(stockId), payload);
  return response.data;
};

export default {
  getBloodStockSummary,
  getBloodStocks,
  getBloodStockByGroup,
  getBloodStockById,
  updateBloodStock,
};
