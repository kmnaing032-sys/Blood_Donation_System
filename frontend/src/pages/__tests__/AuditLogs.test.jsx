import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuditLogs } from '../AuditLogs';
import auditLogService from '../../services/auditLogService';

vi.mock('../../services/auditLogService', () => ({
  default: {
    getAuditLogs: vi.fn(),
  },
}));

describe('AuditLogs Component', () => {
  const mockLogs = {
    items: [
      {
        id: 1,
        action: 'login_success',
        entity_type: 'auth',
        entity_id: 10,
        description: 'User test@example.com logged in successfully',
        ip_address: '127.0.0.1',
        created_at: '2026-11-20T10:00:00Z',
        user: {
          id: 10,
          full_name: 'Admin Tester',
          email: 'admin@example.com',
          role: 'admin',
        },
      },
      {
        id: 2,
        action: 'stock_adjusted',
        entity_type: 'blood_stock',
        entity_id: 3,
        description: 'Blood stock A+ adjusted to 1500ml',
        ip_address: '127.0.0.1',
        created_at: '2026-11-20T11:00:00Z',
        user: null,
      },
    ],
    total: 2,
    page: 1,
    page_size: 15,
    total_pages: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially and then displays audit log entries', async () => {
    auditLogService.getAuditLogs.mockResolvedValue(mockLogs);

    render(
      <MemoryRouter>
        <AuditLogs />
      </MemoryRouter>
    );

    expect(screen.getByTestId('audit-loading')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('audit-row-1')).toBeDefined();
      expect(screen.getByTestId('audit-row-2')).toBeDefined();
    });

    expect(screen.getByText('login_success')).toBeDefined();
    expect(screen.getByText('stock_adjusted')).toBeDefined();
    expect(screen.getByText('Admin Tester')).toBeDefined();
    expect(screen.getByText('System / Anonymous')).toBeDefined();
  });

  it('renders empty state when no audit records are found', async () => {
    auditLogService.getAuditLogs.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 15,
      total_pages: 1,
    });

    render(
      <MemoryRouter>
        <AuditLogs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('audit-empty')).toBeDefined();
    });

    expect(screen.getByText('No audit logs found')).toBeDefined();
  });

  it('renders error banner when API fetch fails', async () => {
    auditLogService.getAuditLogs.mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter>
        <AuditLogs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('audit-error-banner')).toBeDefined();
    });
  });

  it('supports entity and action filtering', async () => {
    auditLogService.getAuditLogs.mockResolvedValue(mockLogs);

    render(
      <MemoryRouter>
        <AuditLogs />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('audit-row-1')).toBeDefined();
    });

    // Change entity filter
    const entitySelect = screen.getByTestId('filter-entity');
    fireEvent.change(entitySelect, { target: { value: 'blood_stock' } });

    await waitFor(() => {
      expect(auditLogService.getAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'blood_stock',
        })
      );
    });
  });
});
