import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SystemSettings } from '../SystemSettings';
import systemSettingService from '../../services/systemSettingService';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../services/systemSettingService');
vi.mock('../../context/AuthContext');

const mockGroupedSettings = {
  settings: {
    system: [
      {
        id: 1,
        key: 'app_name',
        value: 'Blood Donation Management System',
        category: 'system',
        data_type: 'string',
        description: 'Public name of the application',
      },
      {
        id: 2,
        key: 'contact_email',
        value: 'support@blooddonationsystem.org',
        category: 'system',
        data_type: 'string',
        description: 'Support contact email',
      },
    ],
    blood_stock: [
      {
        id: 3,
        key: 'critical_stock_threshold_ml',
        value: '500',
        category: 'blood_stock',
        data_type: 'integer',
        description: 'Critical stock boundary (ml)',
      },
      {
        id: 4,
        key: 'low_stock_threshold_ml',
        value: '1500',
        category: 'blood_stock',
        data_type: 'integer',
        description: 'Low stock boundary (ml)',
      },
    ],
    notification: [
      {
        id: 5,
        key: 'notify_on_low_stock',
        value: 'true',
        category: 'notification',
        data_type: 'boolean',
        description: 'Generate in-app alerts on low stock',
      },
    ],
    general: [
      {
        id: 6,
        key: 'date_format',
        value: 'YYYY-MM-DD',
        category: 'general',
        data_type: 'string',
        description: 'Date display format',
      },
    ],
  },
};

describe('SystemSettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: { id: 1, role: 'admin', full_name: 'System Administrator' },
    });
    systemSettingService.getSettings.mockResolvedValue(mockGroupedSettings);
    systemSettingService.bulkUpdateSettings.mockResolvedValue([]);
  });

  it('renders loading state initially and then displays settings cards', async () => {
    render(
      <MemoryRouter>
        <SystemSettings />
      </MemoryRouter>
    );

    expect(screen.getByTestId('settings-loading')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('system-settings-page')).toBeDefined();
    });

    expect(screen.getByText('System Information')).toBeDefined();
    expect(screen.getByText('Blood Stock Thresholds')).toBeDefined();
    expect(screen.getByDisplayValue('Blood Donation Management System')).toBeDefined();
    expect(screen.getByDisplayValue('support@blooddonationsystem.org')).toBeDefined();
  });

  it('handles API loading failure and provides retry button', async () => {
    systemSettingService.getSettings.mockRejectedValueOnce({
      response: { data: { detail: 'Server unavailable' } },
    });

    render(
      <MemoryRouter>
        <SystemSettings />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('settings-error')).toBeDefined();
    });
    expect(screen.getByText('Server unavailable')).toBeDefined();

    // Click retry
    systemSettingService.getSettings.mockResolvedValueOnce(mockGroupedSettings);
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByTestId('system-settings-page')).toBeDefined();
    });
  });

  it('allows editing settings, detects changes, and saves successfully', async () => {
    render(
      <MemoryRouter>
        <SystemSettings />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('system-settings-page')).toBeDefined();
    });

    const appNameInput = screen.getByDisplayValue('Blood Donation Management System');
    const saveButton = screen.getByText('Save Changes');

    // Initially Save button is disabled because no changes exist
    expect(saveButton.disabled).toBe(true);

    // Change value
    fireEvent.change(appNameInput, { target: { value: 'Global Blood Network' } });
    expect(saveButton.disabled).toBe(false);

    // Submit save
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(systemSettingService.bulkUpdateSettings).toHaveBeenCalledWith([
        { key: 'app_name', value: 'Global Blood Network' },
      ]);
    });

    await waitFor(() => {
      expect(screen.getByTestId('settings-success-alert')).toBeDefined();
    });
    expect(screen.getByText('System settings updated successfully.')).toBeDefined();
  });

  it('allows cancelling edits to revert back to initial values', async () => {
    render(
      <MemoryRouter>
        <SystemSettings />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('system-settings-page')).toBeDefined();
    });

    const appNameInput = screen.getByDisplayValue('Blood Donation Management System');
    const cancelButton = screen.getByText('Cancel');

    expect(cancelButton.disabled).toBe(true);

    fireEvent.change(appNameInput, { target: { value: 'Temporary Name' } });
    expect(appNameInput.value).toBe('Temporary Name');
    expect(cancelButton.disabled).toBe(false);

    fireEvent.click(cancelButton);
    expect(appNameInput.value).toBe('Blood Donation Management System');
    expect(cancelButton.disabled).toBe(true);
  });

  it('displays read-only state and disables form controls for non-admin users', async () => {
    useAuth.mockReturnValue({
      user: { id: 2, role: 'staff', full_name: 'Medical Staff' },
    });

    render(
      <MemoryRouter>
        <SystemSettings />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('system-settings-page')).toBeDefined();
    });

    expect(
      screen.getByText(/Viewing in read-only mode. Only system administrators can modify settings/i)
    ).toBeDefined();

    const appNameInput = screen.getByDisplayValue('Blood Donation Management System');
    expect(appNameInput.disabled).toBe(true);
    expect(screen.queryByText('Save Changes')).toBeNull();
  });
});
