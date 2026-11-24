import apiClient from '../api/axios';
import { API_ENDPOINTS } from '../api/endpoints';

export const dataImportService = {
  /**
   * Download the official Donor CSV template.
   */
  downloadDonorTemplate: async () => {
    const response = await apiClient.get(API_ENDPOINTS.IMPORTS.DONORS_TEMPLATE, {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Upload CSV for validation and dry-run preview.
   * @param {File} file
   */
  previewDonorCsv: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(API_ENDPOINTS.IMPORTS.DONORS_PREVIEW, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Commit verified CSV file to persist valid donor records.
   * @param {File} file
   */
  commitDonorCsv: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(API_ENDPOINTS.IMPORTS.DONORS_COMMIT, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Retrieve historical import operations.
   */
  getImportHistory: async (skip = 0, limit = 50) => {
    const response = await apiClient.get(API_ENDPOINTS.IMPORTS.HISTORY, {
      params: { skip, limit },
    });
    return response.data;
  },
};

export default dataImportService;
