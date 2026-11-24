/**
 * API Endpoint Constants
 *
 * Base URL is configured via VITE_API_BASE_URL in .env
 * All paths are relative to the base URL (e.g. http://localhost:8000/api/v1)
 *
 * Verified against backend routers:
 *   backend/app/api/v1/endpoints/auth.py           (prefix: /auth)
 *   backend/app/api/v1/endpoints/donors.py         (prefix: /donors)
 *   backend/app/api/v1/endpoints/users.py          (prefix: /users)
 *   backend/app/api/v1/endpoints/donations.py      (prefix: /donations)
 *   backend/app/api/v1/endpoints/blood_requests.py (prefix: /requests)
 *   backend/app/api/v1/endpoints/blood_stock.py    (prefix: /blood-stock)
 *   backend/app/api/v1/endpoints/dashboard.py      (prefix: /dashboard)
 */

export const API_ENDPOINTS = {
  AUTH: {
    REGISTER: '/auth/register',      // POST  — { full_name, email, password } → UserResponse (201)
    LOGIN: '/auth/login',            // POST  — { email, password }            → TokenResponse (200)
    ME: '/auth/me',                  // GET   — Bearer <access_token>          → UserResponse (200)
    REFRESH: '/auth/refresh',        // POST  — { refresh_token }              → TokenResponse (200)
    CHANGE_PASSWORD: '/auth/change-password', // POST — { current_password, new_password, confirm_password }
    ADMIN_CHECK: '/auth/admin-check', // GET  — admin role required
    STAFF_CHECK: '/auth/staff-check', // GET  — staff role required
    // NOTE: There is NO backend /auth/logout endpoint.
    //       Logout is client-side only (clear tokens from memory + sessionStorage).
  },

  DONORS: {
    LIST: '/donors/',                // GET   — paginated, search, blood_group, etc.
    CREATE: '/donors/',              // POST  — create donor profile
    DETAIL: (id) => `/donors/${id}`, // GET   — donor detail (full if staff/admin/owner, else public)
    UPDATE: (id) => `/donors/${id}`, // PATCH — update donor profile
    DELETE: (id) => `/donors/${id}`, // DELETE — delete donor profile (admin only)
    BULK_ACTIONS: '/donors/bulk-actions', // POST — bulk activate/deactivate/delete donors
    EXPORT: '/donors/export',        // GET — export filtered donors to CSV (staff/admin only)
  },

  DONATIONS: {
    LIST: '/donations/',                  // GET   — paginated, filterable
    CREATE: '/donations/',                // POST  — create donation record
    DETAIL: (id) => `/donations/${id}`,   // GET   — donation detail
    UPDATE: (id) => `/donations/${id}`,   // PATCH — update donation (admin/staff only)
    DELETE: (id) => `/donations/${id}`,   // DELETE — delete donation (admin only)
  },

  USERS: {
    LIST: '/users/',                  // GET   — admin only
    DETAIL: (id) => `/users/${id}`,  // GET   — admin or own profile
    UPDATE: (id) => `/users/${id}`,  // PATCH — admin or own profile
    DELETE: (id) => `/users/${id}`,  // DELETE — admin only
    RESET_PASSWORD: (id) => `/users/${id}/reset-password`, // POST — admin only
  },

  REQUESTS: {
    LIST: '/blood-requests/',                         // GET   — paginated, filterable
    CREATE: '/blood-requests/',                       // POST  — create blood request
    DETAIL: (id) => `/blood-requests/${id}`,          // GET   — blood request detail
    UPDATE: (id) => `/blood-requests/${id}`,          // PATCH — update request (pending only)
    APPROVE: (id) => `/blood-requests/${id}/approve`, // POST  — approve request (staff/admin)
    REJECT: (id) => `/blood-requests/${id}/reject`,   // POST  — reject request (staff/admin)
    FULFILL: (id) => `/blood-requests/${id}/fulfill`, // POST  — fulfill request & deduct stock (staff/admin)
    CANCEL: (id) => `/blood-requests/${id}/cancel`,   // POST  — cancel request (creator/staff/admin)
  },

  BLOOD_STOCK: {
    LIST: '/blood-stock/',                        // GET   — paginated, filterable by blood_group, min/max quantity
    SUMMARY: '/blood-stock/summary',              // GET   — aggregate inventory summary
    BY_GROUP: (group) => `/blood-stock/group/${encodeURIComponent(group)}`, // GET — stock by blood group
    DETAIL: (id) => `/blood-stock/${id}`,         // GET   — stock by unique ID
    UPDATE: (id) => `/blood-stock/${id}`,         // PATCH — update available/reserved stock (admin/staff)
  },

  DASHBOARD: {
    SUMMARY: '/dashboard/summary',
    DONATIONS: '/dashboard/donations',
    BLOOD_STOCK: '/dashboard/blood-stock',
    BLOOD_REQUESTS: '/dashboard/blood-requests',
    MONTHLY_TRENDS: '/dashboard/monthly-trends',
    STATS: '/dashboard/summary', // backward compatibility alias
  },

  NOTIFICATIONS: {
    LIST: '/notifications/',
    UNREAD_COUNT: '/notifications/unread-count',
    MARK_READ: (id) => `/notifications/${id}/read`,
    MARK_ALL_READ: '/notifications/read-all',
    DELETE: (id) => `/notifications/${id}`,
  },

  EMAIL_PREFERENCES: {
    ME: '/email-preferences/me',
    SMTP_STATUS: '/email-preferences/smtp-status',
    LOGS: '/email-preferences/logs',
  },

  IMPORTS: {
    DONORS_TEMPLATE: '/imports/donors/template',
    DONORS_PREVIEW: '/imports/donors/preview',
    DONORS_COMMIT: '/imports/donors/commit',
    HISTORY: '/imports/history',
    DETAIL: (id) => `/imports/${id}`,
  },
};

export default API_ENDPOINTS;
