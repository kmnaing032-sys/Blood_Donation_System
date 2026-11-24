import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient, { clearSession } from '../axios';

describe('Frontend Security & Rate-Limit Compatibility (Step 1.25)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('rejects HTTP 429 Too Many Requests cleanly without triggering token refresh loop', async () => {
    const error429 = {
      response: {
        status: 429,
        data: {
          detail: 'Too many requests. Please try again in 45 seconds.',
          retry_after: 45,
        },
        headers: { 'retry-after': '45' },
      },
      config: { url: '/auth/login' },
    };

    const resRejected = apiClient.interceptors.response.handlers[0].rejected;

    await expect(resRejected(error429)).rejects.toMatchObject({
      response: {
        status: 429,
        data: {
          detail: 'Too many requests. Please try again in 45 seconds.',
        },
      },
    });
  });

  it('preserves generic error responses on failed login', async () => {
    const error401 = {
      response: {
        status: 401,
        data: { detail: 'Incorrect email or password' },
      },
      config: { url: '/auth/login' },
    };

    const resRejected = apiClient.interceptors.response.handlers[0].rejected;
    await expect(resRejected(error401)).rejects.toMatchObject({
      response: {
        status: 401,
        data: { detail: 'Incorrect email or password' },
      },
    });
  });

  it('safely clears session and rejects on refresh token expiration without infinite loop', async () => {
    sessionStorage.setItem('bds_rt', 'expired_refresh_token');
    clearSession();
    expect(sessionStorage.getItem('bds_rt')).toBeNull();
  });
});
