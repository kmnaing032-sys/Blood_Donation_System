/**
 * Axios API Client — Step 1.5
 *
 * Configured for the Blood Donation System backend.
 * Base URL is read from VITE_API_BASE_URL environment variable.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TOKEN STRATEGY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  • Access token  — JavaScript module memory (_accessToken).
 *                    Never persisted to localStorage / sessionStorage / cookies.
 *                    Wiped on full page reload → forces re-auth via refresh flow.
 *
 *  • Refresh token — sessionStorage under key 'bds_rt' (tab-scoped).
 *                    Managed by authService.js; read here only by the interceptor.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * REQUEST INTERCEPTOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  Attaches `Authorization: Bearer <access_token>` to outgoing requests
 *  when an access token is set in memory.
 *  Does not attach token to public endpoints (/auth/login, /auth/register, /auth/refresh, /health).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * RESPONSE INTERCEPTOR — AUTOMATIC TOKEN REFRESH
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  Triggered on any HTTP 401 response, EXCEPT:
 *    • Requests to /auth/refresh  (would cause infinite loop)
 *    • Requests to /auth/login    (wrong credentials, not an expired token)
 *    • Requests already marked with _retry = true
 *
 *  Flow:
 *    1. First 401 → starts a single shared token-refresh call.
 *    2. Subsequent 401s while refresh is in flight → queued as Promises.
 *    3. On refresh success → all queued requests are resumed with new token.
 *    4. On refresh failure → all queued requests are rejected; session cleared.
 *    5. Original failed request is retried exactly once with new access token.
 *
 *  The refresh call is made with a plain axios instance (_refreshClient) to
 *  prevent the response interceptor from catching its own 401 and looping.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * SECURITY NOTES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *  • Tokens are NEVER logged.
 *  • Refresh token is read from sessionStorage — never from localStorage.
 *  • On any refresh failure the full auth session is cleared.
 *  • No token is exposed in error messages propagated to callers.
 */

import axios from 'axios';

// ─── Storage key (must match authService.js) ──────────────────────────────────
const REFRESH_TOKEN_KEY = 'bds_rt';
const USER_CACHE_KEY = 'bds_user';

// ─── Public endpoints that do not require auth tokens / refresh ───────────────
const PUBLIC_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/health',
  '/health/ready',
];

const isPublicEndpoint = (url = '') => {
  try {
    const parsedUrl = new URL(
      url,
      import.meta.env.VITE_API_BASE_URL || window.location.origin
    );

    const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';

    return PUBLIC_ENDPOINTS.some((endpoint) => {
      const publicPath = endpoint.replace(/\/+$/, '') || '/';
      return pathname === publicPath;
    });
  } catch {
    return false;
  }
};

// ─── In-memory access token ───────────────────────────────────────────────────
let _accessToken = null;

/** Store the access token in memory. Pass null to clear it. */
export const setAuthToken = (token) => {
  _accessToken = token || null;
};

/** Read the currently stored access token. */
export const getAccessToken = () => _accessToken;

// ─── Session clear helper (mirrors authService.clearAuthSession) ──────────────
export const clearSession = () => {
  _accessToken = null;
  try {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // Ignore storage errors
  }
};

// ─── Refresh token reader (read-only, no authService import needed) ───────────
const getRefreshToken = () => {
  try {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY) || null;
  } catch {
    return null;
  }
};

// ─── Refresh queue state ──────────────────────────────────────────────────────
let _isRefreshing = false;
let _refreshQueue = []; // Array of { resolve, reject }

const enqueueRefreshWaiter = () =>
  new Promise((resolve, reject) => {
    _refreshQueue.push({ resolve, reject });
  });

const resolveQueue = (newAccessToken) => {
  _refreshQueue.forEach(({ resolve }) => resolve(newAccessToken));
  _refreshQueue = [];
};

const rejectQueue = (error) => {
  _refreshQueue.forEach(({ reject }) => reject(error));
  _refreshQueue = [];
};

// ─── Bare axios instance for the refresh call ─────────────────────────────────
export const _refreshClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ─── Main Axios instance ──────────────────────────────────────────────────────
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ─── Request interceptor: attach Bearer token ─────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    const isPublic = isPublicEndpoint(config.url);
    if (token && !isPublic) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor: automatic token refresh on 401 ─────────────────────
apiClient.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error?.config;

    // 1. If no response or not 401, propagate immediately
    if (!error?.response || error.response.status !== 401 || !originalRequest) {
      return Promise.reject(error);
    }

    // 2. Never attempt refresh for public / auth endpoints (/auth/login, /auth/refresh, etc.)
    if (isPublicEndpoint(originalRequest.url)) {
      return Promise.reject(error);
    }

    // 3. Prevent infinite retry loop (request already retried once)
    if (originalRequest._retry) {
      clearSession();
      return Promise.reject(error);
    }

    // 4. If a refresh is already in flight, queue this request
    if (_isRefreshing) {
      try {
        const newToken = await enqueueRefreshWaiter();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        originalRequest._retry = true;
        return apiClient(originalRequest);
      } catch (queueError) {
        return Promise.reject(queueError);
      }
    }

    // 5. First 401 encountered: initiate token refresh
    originalRequest._retry = true;
    _isRefreshing = true;

    const refreshToken = getRefreshToken();

    if (!refreshToken) {
      _isRefreshing = false;
      clearSession();
      rejectQueue(error);
      return Promise.reject(error);
    }

    try {
      const refreshResponse = await _refreshClient.post('/auth/refresh', {
        refresh_token: refreshToken,
      });

      const { access_token, refresh_token: newRefreshToken } = refreshResponse.data;

      // Store new tokens
      setAuthToken(access_token);
      try {
        sessionStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
      } catch {
        // Ignore storage errors
      }

      _isRefreshing = false;
      resolveQueue(access_token);

      // Retry original request
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${access_token}`;
      return apiClient(originalRequest);

    } catch (refreshError) {
      _isRefreshing = false;
      clearSession();
      rejectQueue(refreshError);
      return Promise.reject(refreshError);
    }
  }
);

export default apiClient;
