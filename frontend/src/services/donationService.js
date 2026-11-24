/**
 * Donation Service
 *
 * Interacts with /api/v1/donations backend endpoints:
 *   GET    /donations/          -> list donations (paginated, search, filter)
 *   POST   /donations/          -> record a new blood donation
 *   GET    /donations/{id}      -> get single donation record
 *   PATCH  /donations/{id}      -> update donation record (admin/staff only)
 *   DELETE /donations/{id}      -> delete donation record (admin only)
 */

import apiClient from '../api/axios';
import { API_ENDPOINTS } from '../api/endpoints';

/**
 * Valid donation statuses accepted by the backend validator.
 */
export const DONATION_STATUSES = ['completed', 'pending', 'cancelled', 'rejected'];

/**
 * Fetch a paginated, searchable, and filterable list of donations.
 *
 * @param {object} params
 * @param {number} [params.page=1]
 * @param {number} [params.page_size=10]
 * @param {number} [params.donor_id]
 * @param {string} [params.blood_group]
 * @param {string} [params.status]
 * @param {string} [params.donation_date]
 * @param {string} [params.search]
 * @param {string} [params.sort_by='donation_date']
 * @param {string} [params.sort_order='desc']
 * @returns {Promise<{ items: Array, total: number, page: number, page_size: number, total_pages: number }>}
 */
export const getDonations = async (params = {}) => {
  const cleanParams = {};

  if (params.page) cleanParams.page = params.page;
  if (params.page_size) cleanParams.page_size = params.page_size;
  if (params.donor_id) cleanParams.donor_id = params.donor_id;
  if (params.blood_group && params.blood_group !== 'all') cleanParams.blood_group = params.blood_group;
  if (params.status && params.status !== 'all') cleanParams.status = params.status;
  if (params.donation_date) cleanParams.donation_date = params.donation_date;
  if (params.search && params.search.trim()) cleanParams.search = params.search.trim();
  if (params.sort_by) cleanParams.sort_by = params.sort_by;
  if (params.sort_order) cleanParams.sort_order = params.sort_order;

  const response = await apiClient.get(API_ENDPOINTS.DONATIONS.LIST, {
    params: cleanParams,
  });
  return response.data;
};

/**
 * Get a single donation record by ID.
 *
 * @param {number|string} id
 * @returns {Promise<object>} DonationResponse
 */
export const getDonationById = async (id) => {
  const response = await apiClient.get(API_ENDPOINTS.DONATIONS.DETAIL(id));
  return response.data;
};

/**
 * Record a new blood donation.
 *
 * @param {object} donationData
 * @param {number} donationData.donor_id
 * @param {string} donationData.donation_date - YYYY-MM-DD
 * @param {number} donationData.quantity_ml - 100 to 800
 * @param {string} donationData.blood_group - 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'
 * @param {string} [donationData.status='completed'] - 'pending' | 'completed' | 'cancelled' | 'rejected'
 * @param {string} [donationData.notes]
 * @returns {Promise<object>} DonationResponse (201 Created)
 */
export const createDonation = async (donationData) => {
  const response = await apiClient.post(API_ENDPOINTS.DONATIONS.CREATE, donationData);
  return response.data;
};

/**
 * Update an existing donation record (Admin & Staff only).
 *
 * @param {number|string} id
 * @param {object} donationData
 * @returns {Promise<object>} DonationResponse (200 OK)
 */
export const updateDonation = async (id, donationData) => {
  const response = await apiClient.patch(API_ENDPOINTS.DONATIONS.UPDATE(id), donationData);
  return response.data;
};

/**
 * Delete a donation record (Admin only).
 *
 * @param {number|string} id
 * @returns {Promise<{ message: string }>}
 */
export const deleteDonation = async (id) => {
  const response = await apiClient.delete(API_ENDPOINTS.DONATIONS.DELETE(id));
  return response.data;
};

export const donationService = {
  getDonations,
  getDonationById,
  createDonation,
  updateDonation,
  deleteDonation,
  DONATION_STATUSES,
};

export default donationService;
