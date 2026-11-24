import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { BackupManagement } from '../BackupManagement';
import backupService from '../../services/backupService';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../services/backupService');
vi.mock('../../context/AuthContext');

const mockBackupsList = {
  backups: [
    {
      id: 1,
      filename: 'blood_donation_db_backup_20261122_100000.dump',
      file_size_bytes: 5242880, // 5 MB
      format: 'custom',
      status: 'completed',
      created_at: '2026-11-22T10:00:00Z',
    },
    {
      id: 2,
      filename: 'blood_donation_db_backup_20261122_110000.sql',
      file_size_bytes: 1048576, // 1 MB
      format: 'plain',
      status: 'completed',
      created_at: '2026-11-22T11:00:00Z',
    },
  ],
  total: 2,
};

describe('BackupManagement Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: { id: 1, role: 'admin', full_name: 'System Administrator' },
    });
    backupService.getBackups.mockResolvedValue(mockBackupsList);
    backupService.createBackup.mockResolvedValue({
      id: 3,
      filename: 'blood_donation_db_backup_20261122_120000.dump',
      file_size_bytes: 2048,
      format: 'custom',
      status: 'completed',
      created_at: '2026-11-22T12:00:00Z',
    });
    backupService.downloadBackup.mockResolvedValue();
    backupService.deleteBackup.mockResolvedValue({ message: 'Deleted' });
    backupService.prepareRestore.mockResolvedValue({
      backup_id: 1,
      filename: 'blood_donation_db_backup_20261122_100000.dump',
      warning: 'Restoring will completely overwrite existing tables',
      operational_command: 'pg_restore -h localhost -p 5432 -U postgres -d blood_donation_db backup.dump',
    });
  });

  it('renders loading state initially and then displays backup history table', async () => {
    render(
      <MemoryRouter>
        <BackupManagement />
      </MemoryRouter>
    );

    expect(screen.getByTestId('backups-loading')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('backup-management-page')).toBeDefined();
    });

    expect(screen.getByText('blood_donation_db_backup_20261122_100000.dump')).toBeDefined();
    expect(screen.getByText('blood_donation_db_backup_20261122_110000.sql')).toBeDefined();
    expect(screen.getByText('5 MB')).toBeDefined();
    expect(screen.getByText('1 MB')).toBeDefined();
  });

  it('renders empty state when no backups exist', async () => {
    backupService.getBackups.mockResolvedValueOnce({ backups: [], total: 0 });

    render(
      <MemoryRouter>
        <BackupManagement />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('backups-empty')).toBeDefined();
    });
    expect(screen.getByText('No database backups have been created yet.')).toBeDefined();
  });

  it('creates a new backup successfully and updates view', async () => {
    render(
      <MemoryRouter>
        <BackupManagement />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('backup-management-page')).toBeDefined();
    });

    const createBtn = screen.getByTestId('create-backup-btn');
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(backupService.createBackup).toHaveBeenCalledWith('custom');
    });

    await waitFor(() => {
      expect(screen.getByTestId('backup-success-alert')).toBeDefined();
    });
    expect(screen.getByText(/Database backup created successfully/i)).toBeDefined();
  });

  it('triggers download when Download action is clicked', async () => {
    render(
      <MemoryRouter>
        <BackupManagement />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('download-btn-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('download-btn-1'));

    await waitFor(() => {
      expect(backupService.downloadBackup).toHaveBeenCalledWith(
        1,
        'blood_donation_db_backup_20261122_100000.dump'
      );
    });
  });

  it('opens delete confirmation modal and deletes backup safely', async () => {
    render(
      <MemoryRouter>
        <BackupManagement />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('delete-btn-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('delete-btn-1'));

    expect(screen.getByTestId('delete-modal')).toBeDefined();
    expect(screen.getByText(/Confirm Backup Deletion/i)).toBeDefined();

    fireEvent.click(screen.getByTestId('confirm-delete-btn'));

    await waitFor(() => {
      expect(backupService.deleteBackup).toHaveBeenCalledWith(1);
    });
  });

  it('verifies restore preconditions and shows operational command', async () => {
    render(
      <MemoryRouter>
        <BackupManagement />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('restore-btn-1')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('restore-btn-1'));

    await waitFor(() => {
      expect(backupService.prepareRestore).toHaveBeenCalledWith(1, 'CONFIRM_RESTORE');
    });

    await waitFor(() => {
      expect(screen.getByTestId('restore-modal')).toBeDefined();
    });
    expect(screen.getByText(/pg_restore -h localhost/i)).toBeDefined();
  });
});
