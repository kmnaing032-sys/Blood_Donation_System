/**
 * authService.test.js — Step 1.4 Unit Tests
 *
 * Tests the Authentication Service in isolation by mocking the axios API client.
 *
 * Coverage:
 *   1. register()       — POST /auth/register with correct body
 *   2. login()          — POST /auth/login, stores tokens, returns camelCase result
 *   3. getCurrentUser() — GET /auth/me, caches user in sessionStorage
 *   4. refreshSession() — POST /auth/refresh with stored refresh token, rotates tokens
 *   5. refreshSession() — clears session and rethrows on API failure
 *   6. refreshSession() — throws immediately when no refresh token is stored
 *   7. logout()         — clears session (no API call)
 *   8. clearAuthSession() — clears memory token + sessionStorage
 *   9. getStoredUser()  — reads cached user from sessionStorage
 *   10. storeUser()     — stores user in sessionStorage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock the axios API client ────────────────────────────────────────────────
// We mock the entire module so no real HTTP requests are made.
// The mock must be hoisted before the service import, hence vi.mock() at the top.
vi.mock('../../api/axios', () => {
  const mockClient = {
    post: vi.fn(),
    get: vi.fn(),
  };
  return {
    default: mockClient,
    setAuthToken: vi.fn(),
    getAccessToken: vi.fn(),
  };
});

// Import AFTER mocks are set up
import apiClient, { setAuthToken } from '../../api/axios';
import {
  register,
  login,
  getCurrentUser,
  refreshSession,
  logout,
  clearAuthSession,
  getStoredRefreshToken,
  storeRefreshToken,
  getStoredUser,
  storeUser,
} from '../authService';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const FAKE_ACCESS_TOKEN  = 'eyJhbGciOiJIUzI1NiJ9.access.fake';
const FAKE_REFRESH_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.refresh.fake';
const FAKE_REFRESH_TOKEN_2 = 'eyJhbGciOiJIUzI1NiJ9.refresh.rotated';

const fakeTokenResponse = {
  access_token: FAKE_ACCESS_TOKEN,
  refresh_token: FAKE_REFRESH_TOKEN,
  token_type: 'bearer',
  expires_in: 1800,
};

const fakeUser = {
  id: 1,
  full_name: 'Test User',
  email: 'test@example.com',
  role: 'donor',
  is_active: true,
};

// ─── Setup / Teardown ─────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  // Clear sessionStorage before each test
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('register()', () => {
  it('calls POST /auth/register with correct body and returns UserResponse', async () => {
    apiClient.post.mockResolvedValueOnce({ data: fakeUser });

    const result = await register('Test User', 'test@example.com', 'password123');

    expect(apiClient.post).toHaveBeenCalledOnce();
    expect(apiClient.post).toHaveBeenCalledWith('/auth/register', {
      full_name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result).toEqual(fakeUser);
  });

  it('propagates API errors (e.g. 409 Conflict)', async () => {
    const error = Object.assign(new Error('Email already registered'), {
      response: { status: 409 },
    });
    apiClient.post.mockRejectedValueOnce(error);

    await expect(register('Test User', 'dup@example.com', 'password123')).rejects.toThrow();
  });
});

describe('login()', () => {
  it('calls POST /auth/login with { email, password }', async () => {
    apiClient.post.mockResolvedValueOnce({ data: fakeTokenResponse });

    await login('test@example.com', 'password123');

    expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('stores the access token in memory via setAuthToken()', async () => {
    apiClient.post.mockResolvedValueOnce({ data: fakeTokenResponse });

    await login('test@example.com', 'password123');

    expect(setAuthToken).toHaveBeenCalledWith(FAKE_ACCESS_TOKEN);
  });

  it('stores the refresh token in sessionStorage', async () => {
    apiClient.post.mockResolvedValueOnce({ data: fakeTokenResponse });

    await login('test@example.com', 'password123');

    expect(sessionStorage.getItem('bds_rt')).toBe(FAKE_REFRESH_TOKEN);
  });

  it('returns camelCase token fields', async () => {
    apiClient.post.mockResolvedValueOnce({ data: fakeTokenResponse });

    const result = await login('test@example.com', 'password123');

    expect(result).toEqual({
      accessToken: FAKE_ACCESS_TOKEN,
      refreshToken: FAKE_REFRESH_TOKEN,
      tokenType: 'bearer',
      expiresIn: 1800,
    });
  });

  it('propagates 401 errors (wrong credentials)', async () => {
    const error = Object.assign(new Error('Unauthorized'), {
      response: { status: 401 },
    });
    apiClient.post.mockRejectedValueOnce(error);

    await expect(login('wrong@example.com', 'wrongpass')).rejects.toThrow();
  });
});

describe('getCurrentUser()', () => {
  it('calls GET /auth/me', async () => {
    apiClient.get.mockResolvedValueOnce({ data: fakeUser });

    await getCurrentUser();

    expect(apiClient.get).toHaveBeenCalledWith('/auth/me');
  });

  it('caches the returned user in sessionStorage', async () => {
    apiClient.get.mockResolvedValueOnce({ data: fakeUser });

    await getCurrentUser();

    const cached = JSON.parse(sessionStorage.getItem('bds_user'));
    expect(cached).toEqual(fakeUser);
  });

  it('returns the UserResponse object', async () => {
    apiClient.get.mockResolvedValueOnce({ data: fakeUser });

    const result = await getCurrentUser();

    expect(result).toEqual(fakeUser);
  });
});

describe('refreshSession()', () => {
  it('calls POST /auth/refresh with the stored refresh token', async () => {
    storeRefreshToken(FAKE_REFRESH_TOKEN);
    apiClient.post.mockResolvedValueOnce({
      data: { access_token: FAKE_ACCESS_TOKEN, refresh_token: FAKE_REFRESH_TOKEN_2 },
    });

    await refreshSession();

    expect(apiClient.post).toHaveBeenCalledWith('/auth/refresh', {
      refresh_token: FAKE_REFRESH_TOKEN,
    });
  });

  it('stores the new access token in memory', async () => {
    storeRefreshToken(FAKE_REFRESH_TOKEN);
    apiClient.post.mockResolvedValueOnce({
      data: { access_token: FAKE_ACCESS_TOKEN, refresh_token: FAKE_REFRESH_TOKEN_2 },
    });

    await refreshSession();

    expect(setAuthToken).toHaveBeenCalledWith(FAKE_ACCESS_TOKEN);
  });

  it('rotates the refresh token in sessionStorage', async () => {
    storeRefreshToken(FAKE_REFRESH_TOKEN);
    apiClient.post.mockResolvedValueOnce({
      data: { access_token: FAKE_ACCESS_TOKEN, refresh_token: FAKE_REFRESH_TOKEN_2 },
    });

    await refreshSession();

    expect(sessionStorage.getItem('bds_rt')).toBe(FAKE_REFRESH_TOKEN_2);
  });

  it('returns { accessToken, refreshToken } with new values', async () => {
    storeRefreshToken(FAKE_REFRESH_TOKEN);
    apiClient.post.mockResolvedValueOnce({
      data: { access_token: FAKE_ACCESS_TOKEN, refresh_token: FAKE_REFRESH_TOKEN_2 },
    });

    const result = await refreshSession();

    expect(result).toEqual({
      accessToken: FAKE_ACCESS_TOKEN,
      refreshToken: FAKE_REFRESH_TOKEN_2,
    });
  });

  it('throws immediately (without API call) when no refresh token is stored', async () => {
    // sessionStorage is empty after beforeEach
    await expect(refreshSession()).rejects.toThrow('No refresh token available');
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('calls clearAuthSession() and rethrows when the API returns 401', async () => {
    storeRefreshToken(FAKE_REFRESH_TOKEN);
    const error = Object.assign(new Error('Refresh token is invalid or revoked'), {
      response: { status: 401 },
    });
    apiClient.post.mockRejectedValueOnce(error);

    await expect(refreshSession()).rejects.toThrow();

    // Session must be cleared after failed refresh
    expect(setAuthToken).toHaveBeenCalledWith(null);
    expect(sessionStorage.getItem('bds_rt')).toBeNull();
  });
});

describe('logout()', () => {
  it('clears the auth session without making any API call', () => {
    storeRefreshToken(FAKE_REFRESH_TOKEN);

    logout();

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(apiClient.get).not.toHaveBeenCalled();
    // setAuthToken(null) is called by clearAuthSession()
    expect(setAuthToken).toHaveBeenCalledWith(null);
    expect(sessionStorage.getItem('bds_rt')).toBeNull();
  });
});

describe('clearAuthSession()', () => {
  it('clears the in-memory token via setAuthToken(null)', () => {
    clearAuthSession();
    expect(setAuthToken).toHaveBeenCalledWith(null);
  });

  it('removes the refresh token from sessionStorage', () => {
    sessionStorage.setItem('bds_rt', FAKE_REFRESH_TOKEN);
    clearAuthSession();
    expect(sessionStorage.getItem('bds_rt')).toBeNull();
  });

  it('removes the user cache from sessionStorage', () => {
    sessionStorage.setItem('bds_user', JSON.stringify(fakeUser));
    clearAuthSession();
    expect(sessionStorage.getItem('bds_user')).toBeNull();
  });
});

describe('sessionStorage helpers', () => {
  it('getStoredRefreshToken() returns null when nothing is stored', () => {
    expect(getStoredRefreshToken()).toBeNull();
  });

  it('storeRefreshToken() + getStoredRefreshToken() round-trips correctly', () => {
    storeRefreshToken(FAKE_REFRESH_TOKEN);
    expect(getStoredRefreshToken()).toBe(FAKE_REFRESH_TOKEN);
  });

  it('storeRefreshToken(null) removes the stored token', () => {
    storeRefreshToken(FAKE_REFRESH_TOKEN);
    storeRefreshToken(null);
    expect(getStoredRefreshToken()).toBeNull();
  });

  it('getStoredUser() returns null when nothing is cached', () => {
    expect(getStoredUser()).toBeNull();
  });

  it('storeUser() + getStoredUser() round-trips correctly', () => {
    storeUser(fakeUser);
    expect(getStoredUser()).toEqual(fakeUser);
  });
});
