/**
 * Donor Service
 *
 * Interacts with /api/v1/donors backend endpoints:
 *   GET    /donors/          -> list donors (paginated, search, filter)
 *   POST   /donors/          -> create donor profile
 *   GET    /donors/{id}      -> get single donor profile
 *   PATCH  /donors/{id}      -> update donor profile
 *   DELETE /donors/{id}      -> delete donor profile (admin only)
 */

import apiClient from '../api/axios';
import { API_ENDPOINTS } from '../api/endpoints';

/**
 * Valid blood groups accepted by the backend validator.
 */
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/**
 * Valid genders accepted by the backend validator.
 */
export const GENDERS = ['male', 'female', 'other'];

/**
 * Fetch a paginated, searchable, and filterable list of donors.
 *
 * @param {object} params
 * @param {number} [params.page=1]
 * @param {number} [params.page_size=10]
 * @param {string} [params.search]
 * @param {string} [params.blood_group]
 * @param {string} [params.gender]
 * @param {string} [params.sort_by='created_at']
 * @param {string} [params.sort_order='desc']
 * @returns {Promise<{ items: Array, total: number, page: number, page_size: number, total_pages: number }>}
 */
export const getDonors = async (params = {}) => {
  const cleanParams = {};

  if (params.page) cleanParams.page = params.page;
  if (params.page_size) cleanParams.page_size = params.page_size;
  if (params.search && params.search.trim()) cleanParams.search = params.search.trim();
  if (params.name && params.name.trim()) cleanParams.name = params.name.trim();
  if (params.email && params.email.trim()) cleanParams.email = params.email.trim();
  if (params.phone && params.phone.trim()) cleanParams.phone = params.phone.trim();
  if (params.blood_group && params.blood_group !== 'all') cleanParams.blood_group = params.blood_group;
  if (params.gender && params.gender !== 'all') cleanParams.gender = params.gender;
  if (params.is_active !== undefined && params.is_active !== null && params.is_active !== 'all') {
    cleanParams.is_active = params.is_active;
  }
  if (params.start_date) cleanParams.start_date = params.start_date;
  if (params.end_date) cleanParams.end_date = params.end_date;
  if (params.last_donation_from) cleanParams.last_donation_from = params.last_donation_from;
  if (params.last_donation_to) cleanParams.last_donation_to = params.last_donation_to;
  if (params.sort_by) cleanParams.sort_by = params.sort_by;
  if (params.sort_order) cleanParams.sort_order = params.sort_order;

  const response = await apiClient.get(API_ENDPOINTS.DONORS.LIST, {
    params: cleanParams,
  });
  return response.data;
};

/**
 * Get a single donor's details by donor ID.
 *
 * @param {number|string} id
 * @returns {Promise<object>} DonorResponse or PublicDonorResponse
 */
export const getDonorById = async (id) => {
  const response = await apiClient.get(API_ENDPOINTS.DONORS.DETAIL(id));
  return response.data;
};

/**
 * Register/Create a new donor profile.
 *
 * @param {object} donorData
 * @param {string} donorData.phone
 * @param {string} donorData.date_of_birth - YYYY-MM-DD
 * @param {string} donorData.gender - 'male' | 'female' | 'other'
 * @param {string} donorData.blood_group - 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'
 * @param {string} donorData.address
 * @param {number} [donorData.user_id]
 * @returns {Promise<object>} DonorResponse (201 Created)
 */
export const createDonor = async (donorData) => {
  const response = await apiClient.post(API_ENDPOINTS.DONORS.CREATE, donorData);
  return response.data;
};

/**
 * Update an existing donor profile.
 *
 * @param {number|string} id
 * @param {object} donorData
 * @returns {Promise<object>} DonorResponse (200 OK)
 */
export const updateDonor = async (id, donorData) => {
  const response = await apiClient.patch(API_ENDPOINTS.DONORS.UPDATE(id), donorData);
  return response.data;
};

/**
 * Delete a donor profile (admin only).
 *
 * @param {number|string} id
 * @returns {Promise<{ message: string }>}
 */
export const deleteDonor = async (id) => {
  const response = await apiClient.delete(API_ENDPOINTS.DONORS.DELETE(id));
  return response.data;
};

/**
 * Perform batch operations on donors (activate, deactivate, delete).
 *
 * @param {string} action - 'activate' | 'deactivate' | 'delete'
 * @param {Array<number>} donorIds - Array of donor IDs
 * @returns {Promise<{ requested_count: number, successful_count: number, failed_count: number, action: string, message: string, failed_ids: Array }>}
 */
export const bulkDonorAction = async (action, donorIds) => {
  const response = await apiClient.post(API_ENDPOINTS.DONORS.BULK_ACTIONS, {
    action,
    donor_ids: donorIds,
  });
  return response.data;
};

/**
 * Export filtered donors to CSV (Staff/Admin only).
 *
 * @param {object} params - Same search & filter parameters as getDonors
 * @returns {Promise<Blob>}
 */
export const exportDonorsCSV = async (params = {}) => {
  const cleanParams = {};

  if (params.search && params.search.trim()) cleanParams.search = params.search.trim();
  if (params.name && params.name.trim()) cleanParams.name = params.name.trim();
  if (params.email && params.email.trim()) cleanParams.email = params.email.trim();
  if (params.phone && params.phone.trim()) cleanParams.phone = params.phone.trim();
  if (params.blood_group && params.blood_group !== 'all') cleanParams.blood_group = params.blood_group;
  if (params.gender && params.gender !== 'all') cleanParams.gender = params.gender;
  if (params.is_active !== undefined && params.is_active !== null && params.is_active !== 'all') {
    cleanParams.is_active = params.is_active;
  }
  if (params.start_date) cleanParams.start_date = params.start_date;
  if (params.end_date) cleanParams.end_date = params.end_date;
  if (params.last_donation_from) cleanParams.last_donation_from = params.last_donation_from;
  if (params.last_donation_to) cleanParams.last_donation_to = params.last_donation_to;
  if (params.sort_by) cleanParams.sort_by = params.sort_by;
  if (params.sort_order) cleanParams.sort_order = params.sort_order;

  const response = await apiClient.get(API_ENDPOINTS.DONORS.EXPORT, {
    params: cleanParams,
    responseType: 'blob',
  });
  return response.data;
};

export const donorService = {
  getDonors,
  getDonorById,
  createDonor,
  updateDonor,
  deleteDonor,
  bulkDonorAction,
  exportDonorsCSV,
  BLOOD_GROUPS,
  GENDERS,
};

export default donorService;
