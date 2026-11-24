import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SystemHealth } from '../SystemHealth';
import healthService from '../../services/healthService';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../services/healthService');
vi.mock('../../context/AuthContext');

const mockDiagnostics = {
  status: 'operational',
  application_name: 'Blood Donation Management System',
  application_version: '1.0.0',
  python_version: '3.13.15',
  environment: 'development',
  uptime_seconds: 125.4,
  server_timestamp: '2026-11-22T10:00:00Z',
  database: {
    status: 'connected',
    response_time_ms: 4.25,
    dialect: 'postgresql+asyncpg',
    pool_size: 10,
  },
};

describe('SystemHealth Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: { id: 1, role: 'admin', full_name: 'System Administrator' },
    });
    healthService.getSystemDiagnostics.mockResolvedValue(mockDiagnostics);
  });

  it('renders loading state initially and then displays health diagnostic cards', async () => {
    render(
      <MemoryRouter>
        <SystemHealth />
      </MemoryRouter>
    );

    expect(screen.getByTestId('health-loading')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('system-health-page')).toBeDefined();
    });

    expect(screen.getByText('System Status')).toBeDefined();
    expect(screen.getByText('PostgreSQL Database')).toBeDefined();
    expect(screen.getByText('Database Latency')).toBeDefined();
    expect(screen.getByText('4.25')).toBeDefined();
    expect(screen.getByText('v1.0.0')).toBeDefined();
    expect(screen.getByText('3.13.15')).toBeDefined();
  });

  it('handles diagnostic fetch failure gracefully and renders error banner', async () => {
    healthService.getSystemDiagnostics.mockRejectedValueOnce({
      response: { data: { detail: 'Database ping timeout' } },
    });

    render(
      <MemoryRouter>
        <SystemHealth />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('health-error-banner')).toBeDefined();
    });
    expect(screen.getByText('Database ping timeout')).toBeDefined();
  });

  it('triggers manual refresh on button click', async () => {
    render(
      <MemoryRouter>
        <SystemHealth />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('refresh-health-btn')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('refresh-health-btn'));

    await waitFor(() => {
      expect(healthService.getSystemDiagnostics).toHaveBeenCalledTimes(2);
    });
  });

  it('polls diagnostics automatically every 30 seconds with timer cleanup on unmount', async () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <MemoryRouter>
        <SystemHealth />
      </MemoryRouter>
    );

    // Initial fetch
    expect(healthService.getSystemDiagnostics).toHaveBeenCalledTimes(1);

    // Allow promise from initial fetch to resolve
    await Promise.resolve();

    // Advance 30 seconds
    await vi.advanceTimersByTimeAsync(30000);
    expect(healthService.getSystemDiagnostics).toHaveBeenCalledTimes(2);

    unmount();
    await vi.advanceTimersByTimeAsync(60000);
    expect(healthService.getSystemDiagnostics).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
