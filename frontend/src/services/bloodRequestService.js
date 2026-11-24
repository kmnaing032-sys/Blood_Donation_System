import apiClient from '../api/axios';
import { API_ENDPOINTS } from '../api/endpoints';

/**
 * Blood Request Service
 *
 * All functions interact with the verified backend blood requests endpoints:
 *   - POST /api/v1/blood-requests/             (Submit blood request)
 *   - GET  /api/v1/blood-requests/             (Paginated list with filters)
 *   - GET  /api/v1/blood-requests/{id}         (Detail)
 *   - PATCH /api/v1/blood-requests/{id}        (Update pending request)
 *   - POST /api/v1/blood-requests/{id}/approve (Approve request - staff/admin)
 *   - POST /api/v1/blood-requests/{id}/reject  (Reject request - staff/admin)
 *   - POST /api/v1/blood-requests/{id}/fulfill (Fulfill & deduct stock - staff/admin)
 *   - POST /api/v1/blood-requests/{id}/cancel  (Cancel request - creator/staff/admin)
 *
 * NOTE: The backend implements status transitions rather than a DELETE endpoint.
 * Terminal states: 'rejected', 'fulfilled', 'cancelled'.
 */

export const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'fulfilled', 'cancelled'];
export const REQUEST_URGENCIES = ['low', 'normal', 'high', 'critical'];

/**
 * Fetch paginated list of blood requests with optional filters and sorting.
 *
 * @param {Object} [params={}]
 * @param {number} [params.page=1]
 * @param {number} [params.page_size=10]
 * @param {string} [params.blood_group]
 * @param {string} [params.status]
 * @param {string} [params.hospital_name]
 * @param {string} [params.patient_name]
 * @param {string} [params.search]
 * @param {string} [params.request_date] - YYYY-MM-DD
 * @param {string} [params.start_date] - YYYY-MM-DD
 * @param {string} [params.end_date] - YYYY-MM-DD
 * @param {string} [params.sort_by='created_at']
 * @param {string} [params.sort_order='desc']
 * @returns {Promise<{
 *   items: Array<Object>,
 *   total: number,
 *   page: number,
 *   page_size: number,
 *   total_pages: number
 * }>}
 */
export const getBloodRequests = async (params = {}) => {
  const cleanParams = {};
  if (params.page !== undefined && params.page !== null) cleanParams.page = params.page;
  if (params.page_size !== undefined && params.page_size !== null) cleanParams.page_size = params.page_size;
  if (params.blood_group && params.blood_group !== 'all') cleanParams.blood_group = params.blood_group;
  if (params.status && params.status !== 'all') cleanParams.status = params.status;
  if (params.hospital_name) cleanParams.hospital_name = params.hospital_name;
  if (params.patient_name) cleanParams.patient_name = params.patient_name;
  if (params.search) cleanParams.search = params.search;
  if (params.request_date) cleanParams.request_date = params.request_date;
  if (params.start_date) cleanParams.start_date = params.start_date;
  if (params.end_date) cleanParams.end_date = params.end_date;
  if (params.sort_by) cleanParams.sort_by = params.sort_by;
  if (params.sort_order) cleanParams.sort_order = params.sort_order;

  const response = await apiClient.get(API_ENDPOINTS.REQUESTS.LIST, {
    params: cleanParams,
  });
  return response.data;
};

/**
 * Fetch a single blood request by ID.
 *
 * @param {number|string} requestId
 * @returns {Promise<Object>}
 */
export const getBloodRequestById = async (requestId) => {
  const response = await apiClient.get(API_ENDPOINTS.REQUESTS.DETAIL(requestId));
  return response.data;
};

/**
 * Submit a new blood request.
 *
 * @param {Object} requestData
 * @param {string} requestData.patient_name
 * @param {string} requestData.hospital_name
 * @param {string} requestData.hospital_address
 * @param {string} requestData.blood_group
 * @param {number} requestData.quantity_ml
 * @param {'low'|'normal'|'high'|'critical'} [requestData.urgency='normal']
 * @param {string} requestData.contact_phone
 * @param {string} [requestData.required_by]
 * @param {string} [requestData.notes]
 * @returns {Promise<Object>}
 */
export const createBloodRequest = async (requestData) => {
  const payload = {
    patient_name: requestData.patient_name?.trim(),
    hospital_name: requestData.hospital_name?.trim(),
    hospital_address: requestData.hospital_address?.trim(),
    blood_group: requestData.blood_group,
    quantity_ml: Number(requestData.quantity_ml),
    urgency: requestData.urgency || 'normal',
    contact_phone: requestData.contact_phone?.trim(),
  };

  if (requestData.required_by) {
    payload.required_by = requestData.required_by;
  }
  if (requestData.notes !== undefined && requestData.notes !== null && requestData.notes !== '') {
    payload.notes = requestData.notes.trim();
  }

  const response = await apiClient.post(API_ENDPOINTS.REQUESTS.CREATE, payload);
  return response.data;
};

/**
 * Update a pending blood request.
 *
 * @param {number|string} requestId
 * @param {Object} updateData
 * @returns {Promise<Object>}
 */
export const updateBloodRequest = async (requestId, updateData) => {
  const payload = {};
  if (updateData.patient_name !== undefined) payload.patient_name = updateData.patient_name?.trim();
  if (updateData.hospital_name !== undefined) payload.hospital_name = updateData.hospital_name?.trim();
  if (updateData.hospital_address !== undefined) payload.hospital_address = updateData.hospital_address?.trim();
  if (updateData.quantity_ml !== undefined && updateData.quantity_ml !== '') {
    payload.quantity_ml = Number(updateData.quantity_ml);
  }
  if (updateData.urgency !== undefined) payload.urgency = updateData.urgency;
  if (updateData.contact_phone !== undefined) payload.contact_phone = updateData.contact_phone?.trim();
  if (updateData.required_by !== undefined) payload.required_by = updateData.required_by || null;
  if (updateData.notes !== undefined) payload.notes = updateData.notes || null;

  const response = await apiClient.patch(API_ENDPOINTS.REQUESTS.UPDATE(requestId), payload);
  return response.data;
};

/**
 * Approve a pending blood request (Staff / Admin).
 *
 * @param {number|string} requestId
 * @param {string} [notes]
 * @returns {Promise<Object>}
 */
export const approveBloodRequest = async (requestId, notes) => {
  const payload = notes ? { notes: notes.trim() } : {};
  const response = await apiClient.post(API_ENDPOINTS.REQUESTS.APPROVE(requestId), payload);
  return response.data;
};

/**
 * Reject a pending blood request (Staff / Admin).
 *
 * @param {number|string} requestId
 * @param {string} [notes]
 * @returns {Promise<Object>}
 */
export const rejectBloodRequest = async (requestId, notes) => {
  const payload = notes ? { notes: notes.trim() } : {};
  const response = await apiClient.post(API_ENDPOINTS.REQUESTS.REJECT(requestId), payload);
  return response.data;
};

/**
 * Fulfill an approved blood request and deduct stock (Staff / Admin).
 *
 * @param {number|string} requestId
 * @param {string} [notes]
 * @returns {Promise<Object>}
 */
export const fulfillBloodRequest = async (requestId, notes) => {
  const payload = notes ? { notes: notes.trim() } : {};
  const response = await apiClient.post(API_ENDPOINTS.REQUESTS.FULFILL(requestId), payload);
  return response.data;
};

/**
 * Cancel a pending or approved blood request (Creator / Staff / Admin).
 *
 * @param {number|string} requestId
 * @param {string} [notes]
 * @returns {Promise<Object>}
 */
export const cancelBloodRequest = async (requestId, notes) => {
  const payload = notes ? { notes: notes.trim() } : {};
  const response = await apiClient.post(API_ENDPOINTS.REQUESTS.CANCEL(requestId), payload);
  return response.data;
};

export default {
  getBloodRequests,
  getBloodRequestById,
  createBloodRequest,
  updateBloodRequest,
  approveBloodRequest,
  rejectBloodRequest,
  fulfillBloodRequest,
  cancelBloodRequest,
  REQUEST_STATUSES,
  REQUEST_URGENCIES,
};
