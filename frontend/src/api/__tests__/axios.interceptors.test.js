/**
 * axios.interceptors.test.js — Step 1.5 Interceptor Unit Tests
 *
 * Tests the real Axios request and response interceptors using custom Axios adapters
 * so we don't trigger real network I/O in the jsdom environment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import apiClient, { _refreshClient, setAuthToken, getAccessToken, clearSession } from '../axios';

// Extract the registered interceptor handlers directly from apiClient
const getReqInterceptor = () => apiClient.interceptors.request.handlers[0];
const getResInterceptor = () => apiClient.interceptors.response.handlers[0];

const reqFulfilled = (config) => getReqInterceptor().fulfilled(config);
const resFulfilled = (response) => getResInterceptor().fulfilled(response);
const resRejected = (error) => getResInterceptor().rejected(error);

const AT1 = 'eyJ.access.v1';
const AT2 = 'eyJ.access.v2';
const RT1 = 'eyJ.refresh.v1';
const RT2 = 'eyJ.refresh.v2';
const REFRESH_KEY = 'bds_rt';
const USER_KEY = 'bds_user';

describe('Axios Interceptors', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    setAuthToken(null);
  });

  afterEach(() => {
    sessionStorage.clear();
    setAuthToken(null);
  });

  // ==============================================================================
  // REQUEST INTERCEPTOR
  // ==============================================================================
  describe('Request Interceptor', () => {
    it('attaches Authorization: Bearer <token> when an access token is set for protected routes', () => {
      setAuthToken(AT1);
      const config = { url: '/users/me', headers: {} };
      const result = reqFulfilled(config);
      expect(result.headers.Authorization).toBe(`Bearer ${AT1}`);
    });

    it('does NOT attach Authorization header when no access token is set', () => {
      setAuthToken(null);
      const config = { url: '/donations', headers: {} };
      const result = reqFulfilled(config);
      expect(result.headers.Authorization).toBeUndefined();
    });

    it('does NOT attach Authorization header to public endpoints even if token is set in memory', () => {
      setAuthToken(AT1);
      const config1 = { url: '/auth/login', headers: {} };
      const config2 = { url: '/auth/register', headers: {} };
      const config3 = { url: '/auth/refresh', headers: {} };
      const config4 = { url: '/health', headers: {} };

      expect(reqFulfilled(config1).headers.Authorization).toBeUndefined();
      expect(reqFulfilled(config2).headers.Authorization).toBeUndefined();
      expect(reqFulfilled(config3).headers.Authorization).toBeUndefined();
      expect(reqFulfilled(config4).headers.Authorization).toBeUndefined();
    });
  });

  // ==============================================================================
  // RESPONSE INTERCEPTOR — pass-through
  // ==============================================================================
  describe('Response Interceptor — pass-through & non-refresh errors', () => {
    it('resolves successful responses without alteration', async () => {
      const response = { status: 200, data: { success: true } };
      const result = await resFulfilled(response);
      expect(result).toBe(response);
    });

    it('passes non-401 errors straight through', async () => {
      const error = { response: { status: 500 }, config: { url: '/donations', headers: {} } };
      await expect(resRejected(error)).rejects.toEqual(error);
    });

    it('passes 401 on /auth/login straight through without attempting refresh', async () => {
      const error = { response: { status: 401 }, config: { url: '/auth/login', headers: {} } };
      await expect(resRejected(error)).rejects.toEqual(error);
    });

    it('passes 401 on /auth/refresh straight through to prevent infinite loops', async () => {
      const error = { response: { status: 401 }, config: { url: '/auth/refresh', headers: {} } };
      await expect(resRejected(error)).rejects.toEqual(error);
    });

    it('passes 401 on /auth/register straight through without attempting refresh', async () => {
      const error = { response: { status: 401 }, config: { url: '/auth/register', headers: {} } };
      await expect(resRejected(error)).rejects.toEqual(error);
    });
  });

  // ==============================================================================
  // RESPONSE INTERCEPTOR — token refresh flow
  // ==============================================================================
  describe('Response Interceptor — token refresh flow', () => {
    it('attempts token refresh when 401 occurs and refresh token exists in sessionStorage', async () => {
      sessionStorage.setItem(REFRESH_KEY, RT1);

      // Mock _refreshClient.post
      const refreshSpy = vi.spyOn(_refreshClient, 'post').mockResolvedValueOnce({
        data: { access_token: AT2, refresh_token: RT2 },
      });

      // Set a mock adapter on apiClient to simulate successful retry
      apiClient.defaults.adapter = async (config) => ({
        data: { retried: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

      const error = {
        response: { status: 401 },
        config: { url: '/donations', headers: {}, _retry: false },
      };

      const result = await resRejected(error);

      expect(refreshSpy).toHaveBeenCalledWith('/auth/refresh', { refresh_token: RT1 });
      expect(getAccessToken()).toBe(AT2);
      expect(sessionStorage.getItem(REFRESH_KEY)).toBe(RT2);
      expect(result.data.retried).toBe(true);

      refreshSpy.mockRestore();
    });

    it('retries original request with new access token in Authorization header', async () => {
      sessionStorage.setItem(REFRESH_KEY, RT1);

      const refreshSpy = vi.spyOn(_refreshClient, 'post').mockResolvedValueOnce({
        data: { access_token: AT2, refresh_token: RT2 },
      });

      let retriedConfig = null;
      apiClient.defaults.adapter = async (config) => {
        retriedConfig = config;
        return {
          data: { id: 99 },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      };

      const error = {
        response: { status: 401 },
        config: { url: '/donations/99', headers: {}, _retry: false },
      };

      await resRejected(error);

      expect(retriedConfig).toBeDefined();
      expect(retriedConfig.headers.Authorization).toBe(`Bearer ${AT2}`);
      expect(retriedConfig._retry).toBe(true);

      refreshSpy.mockRestore();
    });
  });

  // ==============================================================================
  // SIMULTANEOUS REQUESTS
  // ==============================================================================
  describe('Simultaneous 401 requests coordination', () => {
    it('executes only a single /auth/refresh call when multiple requests fail with 401 simultaneously', async () => {
      sessionStorage.setItem(REFRESH_KEY, RT1);

      let resolveRefresh;
      const refreshPromise = new Promise((res) => {
        resolveRefresh = res;
      });

      const refreshSpy = vi.spyOn(_refreshClient, 'post').mockReturnValueOnce(refreshPromise);

      apiClient.defaults.adapter = async (config) => ({
        data: { url: config.url },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

      const e1 = { response: { status: 401 }, config: { url: '/donations', headers: {}, _retry: false } };
      const e2 = { response: { status: 401 }, config: { url: '/requests', headers: {}, _retry: false } };

      const p1 = resRejected(e1);
      const p2 = resRejected(e2);

      // Resolve refresh call
      resolveRefresh({
        data: { access_token: AT2, refresh_token: RT2 },
      });

      const [r1, r2] = await Promise.all([p1, p2]);

      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(r1.data.url).toBe('/donations');
      expect(r2.data.url).toBe('/requests');

      refreshSpy.mockRestore();
    });
  });

  // ==============================================================================
  // REFRESH FAILURE
  // ==============================================================================
  describe('Refresh failure handling', () => {
    it('clears access token and sessionStorage when refresh fails, rejecting all callers', async () => {
      setAuthToken(AT1);
      sessionStorage.setItem(REFRESH_KEY, RT1);
      sessionStorage.setItem(USER_KEY, JSON.stringify({ id: 1 }));

      const refreshError = Object.assign(new Error('Refresh token is invalid or revoked'), {
        response: { status: 401 },
      });

      const refreshSpy = vi.spyOn(_refreshClient, 'post').mockRejectedValueOnce(refreshError);

      const e1 = { response: { status: 401 }, config: { url: '/donations', headers: {}, _retry: false } };
      const e2 = { response: { status: 401 }, config: { url: '/requests', headers: {}, _retry: false } };

      const p1 = resRejected(e1);
      const p2 = resRejected(e2);

      await expect(p1).rejects.toEqual(refreshError);
      await expect(p2).rejects.toEqual(refreshError);

      expect(getAccessToken()).toBeNull();
      expect(sessionStorage.getItem(REFRESH_KEY)).toBeNull();
      expect(sessionStorage.getItem(USER_KEY)).toBeNull();

      refreshSpy.mockRestore();
    });
  });

  // ==============================================================================
  // INFINITE LOOP PREVENTION
  // ==============================================================================
  describe('Infinite loop prevention', () => {
    it('does NOT retry a request that has already been retried (_retry: true)', async () => {
      sessionStorage.setItem(REFRESH_KEY, RT1);
      const refreshSpy = vi.spyOn(_refreshClient, 'post');

      const error = {
        response: { status: 401 },
        config: { url: '/donations', headers: {}, _retry: true },
      };

      await expect(resRejected(error)).rejects.toEqual(error);

      // Verify no refresh call was initiated
      expect(refreshSpy).not.toHaveBeenCalled();

      refreshSpy.mockRestore();
    });

    it('rejects immediately without calling /auth/refresh if no refresh token is stored', async () => {
      const refreshSpy = vi.spyOn(_refreshClient, 'post');

      const error = {
        response: { status: 401 },
        config: { url: '/donations', headers: {}, _retry: false },
      };

      await expect(resRejected(error)).rejects.toEqual(error);
      expect(refreshSpy).not.toHaveBeenCalled();

      refreshSpy.mockRestore();
    });
  });
});
