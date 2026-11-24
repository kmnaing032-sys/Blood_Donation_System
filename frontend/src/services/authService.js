/**
 * Authentication Service  — Step 1.4
 *
 * Implements all verified auth flows per docs/FRONTEND_API_INTEGRATION.md
 * and confirmed against backend source code.
 *
 * ┌─────────────────────┬────────────┬──────────────────────────────────────────┐
 * │ Endpoint            │ Method     │ Notes                                    │
 * ├─────────────────────┼────────────┼──────────────────────────────────────────┤
 * │ /auth/register      │ POST       │ { full_name, email, password }           │
 * │ /auth/login         │ POST       │ { email, password } → TokenResponse      │
 * │ /auth/me            │ GET        │ Bearer <access_token> → UserResponse     │
 * │ /auth/refresh       │ POST       │ { refresh_token } → TokenResponse        │
 * │ Logout              │ client-only│ No backend /auth/logout endpoint exists  │
 * └─────────────────────┴────────────┴──────────────────────────────────────────┘
 *
 * Token Storage Strategy (per guide §2):
 *   • Access token  — JavaScript memory via setAuthToken() in api/axios.js
 *   • Refresh token — sessionStorage (tab-scoped, cleared on tab close)
 *   • User profile  — sessionStorage (soft cache, re-fetched on demand)
 *
 * Token Rotation:
 *   • /auth/refresh issues a brand-new pair of tokens and revokes the old one (JTI).
 *   • Replay of a revoked refresh token → 401 Unauthorized.
 *   • On refresh failure: clearAuthSession() is called, error is re-thrown.
 *
 * NOT in this file (Step 1.5+):
 *   • Automatic 401 interception / queued retry in Axios response interceptor.
 */

import apiClient, { setAuthToken } from '../api/axios';
import { API_ENDPOINTS } from '../api/endpoints';

// ─── Storage keys ─────────────────────────────────────────────────────────────
const REFRESH_TOKEN_KEY = 'bds_rt';
const USER_CACHE_KEY    = 'bds_user';

// ─── Token & Session Helpers ──────────────────────────────────────────────────

/**
 * Read the refresh token from sessionStorage.
 * @returns {string|null}
 */
export const getStoredRefreshToken = () => {
  try {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY) || null;
  } catch {
    return null;
  }
};

/**
 * Persist (or clear) the refresh token in sessionStorage.
 * @param {string|null} token
 */
export const storeRefreshToken = (token) => {
  try {
    if (token) {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  } catch (e) {
    console.error('[AuthService] Cannot write refresh token to sessionStorage:', e);
  }
};

/**
 * Read the cached user profile from sessionStorage.
 * @returns {object|null}
 */
export const getStoredUser = () => {
  try {
    const raw = sessionStorage.getItem(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/**
 * Cache (or clear) the user profile in sessionStorage.
 * @param {object|null} user
 */
export const storeUser = (user) => {
  try {
    if (user) {
      sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(USER_CACHE_KEY);
    }
  } catch (e) {
    console.error('[AuthService] Cannot cache user in sessionStorage:', e);
  }
};

/**
 * Clear the entire auth session:
 *   - Wipe the in-memory access token.
 *   - Remove refresh token and user cache from sessionStorage.
 */
export const clearAuthSession = () => {
  setAuthToken(null);
  try {
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // Ignore storage errors during cleanup
  }
};

// ─── Auth API Functions ───────────────────────────────────────────────────────

/**
 * Register a new user account.
 *
 * POST /auth/register
 * Body: { full_name, email, password }
 *
 * @param {string} fullName  — 3–150 characters
 * @param {string} email     — valid email address
 * @param {string} password  — min 8 chars, requires at least 1 letter + 1 digit
 * @returns {Promise<object>} UserResponse — { id, full_name, email, role, is_active }
 * @throws On 409 (email already registered) or 422 (validation error)
 */
export const register = async (fullName, email, password) => {
  const response = await apiClient.post(API_ENDPOINTS.AUTH.REGISTER, {
    full_name: fullName,
    email,
    password,
  });
  return response.data;
};

/**
 * Log in with email and password.
 *
 * POST /auth/login
 * Body: { email, password }
 *
 * On success:
 *   - Stores the access token in memory (attached to future requests by axios interceptor).
 *   - Stores the refresh token in sessionStorage.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ accessToken, refreshToken, tokenType, expiresIn }>}
 * @throws On 401 (Incorrect email or password)
 */
export const login = async (email, password) => {
  const response = await apiClient.post(API_ENDPOINTS.AUTH.LOGIN, {
    email,
    password,
  });

  const { access_token, refresh_token, token_type, expires_in } = response.data;

  setAuthToken(access_token);
  storeRefreshToken(refresh_token);

  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    tokenType: token_type,
    expiresIn: expires_in,
  };
};

/**
 * Fetch the current user's profile.
 *
 * GET /auth/me
 * Requires: Authorization: Bearer <access_token>  (attached automatically by axios interceptor)
 *
 * Also caches the returned profile in sessionStorage for quick access.
 *
 * @returns {Promise<object>} UserResponse — { id, full_name, email, role, is_active }
 * @throws On 401 (missing/invalid/expired token) or 403 (inactive user)
 */
export const getCurrentUser = async () => {
  const response = await apiClient.get(API_ENDPOINTS.AUTH.ME);
  storeUser(response.data);
  return response.data;
};

/**
 * Rotate the refresh token and obtain a new access + refresh token pair.
 *
 * POST /auth/refresh
 * Body: { refresh_token: "<current_refresh_token>" }
 *
 * On success: stores new access + refresh tokens.
 * On failure: calls clearAuthSession() then re-throws, so callers can redirect to /login.
 *
 * NOTE: Auto-wiring to the axios 401 interceptor is intentionally NOT done here.
 *       That will be implemented in Step 1.5.
 *
 * @returns {Promise<{ accessToken, refreshToken }>}
 * @throws On 401 (token revoked / expired / replayed)
 */
export const refreshSession = async () => {
  const currentRefreshToken = getStoredRefreshToken();

  if (!currentRefreshToken) {
    clearAuthSession();
    throw new Error('No refresh token available — user must log in again.');
  }

  try {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.REFRESH, {
      refresh_token: currentRefreshToken,
    });

    const { access_token, refresh_token: newRefreshToken } = response.data;

    setAuthToken(access_token);
    storeRefreshToken(newRefreshToken);

    return { accessToken: access_token, refreshToken: newRefreshToken };
  } catch (error) {
    // Token revoked, expired, or replay detected — session is no longer valid
    clearAuthSession();
    throw error;
  }
};

/**
 * Log out the current user (client-side only).
 *
 * There is NO /auth/logout endpoint on the backend.
 * This function clears the in-memory access token and the sessionStorage refresh token.
 *
 * The old refresh token's JTI remains in the backend DB and will reject any replay attempt.
 * To fully revoke server-side, the backend would need a logout endpoint (not implemented).
 */
export const logout = () => {
  clearAuthSession();
};

/**
 * Change authenticated user's password (Self-Service).
 *
 * POST /auth/change-password
 * Body: { current_password, new_password, confirm_password }
 *
 * @param {string} currentPassword
 * @param {string} newPassword
 * @param {string} confirmPassword
 * @returns {Promise<{ message: string }>}
 */
export const changePassword = async (currentPassword, newPassword, confirmPassword) => {
  const response = await apiClient.post(API_ENDPOINTS.AUTH.CHANGE_PASSWORD, {
    current_password: currentPassword,
    new_password: newPassword,
    confirm_password: confirmPassword,
  });
  return response.data;
};

// ─── Default Export ───────────────────────────────────────────────────────────

export const authService = {
  register,
  login,
  getCurrentUser,
  refreshSession,
  logout,
  changePassword,
  // Storage helpers (exposed for AuthContext / token refresh middleware)
  getStoredRefreshToken,
  getStoredUser,
  storeUser,
  clearAuthSession,
};

export default authService;
