import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DataImport from '../DataImport';
import dataImportService from '../../services/dataImportService';

vi.mock('../../services/dataImportService');

describe('DataImport Page Component (Step 1.26)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    dataImportService.getImportHistory.mockResolvedValue({
      items: [
        {
          id: 1,
          filename: 'initial_donors.csv',
          created_at: '2026-11-22T00:00:00Z',
          created_rows: 5,
          skipped_rows: 0,
          failed_rows: 0,
          status: 'completed',
        },
      ],
      total: 1,
    });
  });

  it('renders initial dropzone, template download button, and history list', async () => {
    render(
      <MemoryRouter>
        <DataImport />
      </MemoryRouter>
    );

    expect(screen.getByText('Donor Data Import & Bulk Operations')).toBeDefined();
    expect(screen.getByTestId('download-template-btn')).toBeDefined();
    expect(screen.getByTestId('import-dropzone')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('initial_donors.csv')).toBeDefined();
    });
  });

  it('handles CSV file selection, calls preview API, and renders summary & preview table', async () => {
    dataImportService.previewDonorCsv.mockResolvedValue({
      filename: 'test_donors.csv',
      total_rows: 2,
      valid_rows: 1,
      invalid_rows: 1,
      duplicate_rows: 0,
      validation_errors: {
        2: ['Invalid phone number format'],
      },
      preview_items: [
        {
          row_number: 1,
          full_name: 'John Doe',
          email: 'john@example.com',
          phone: '+1-555-0101',
          blood_group: 'O+',
          gender: 'male',
          date_of_birth: '1995-05-15',
          is_valid: true,
          errors: [],
          is_duplicate: false,
        },
        {
          row_number: 2,
          full_name: 'Jane Doe',
          email: 'jane@example.com',
          phone: 'bad',
          blood_group: 'A+',
          gender: 'female',
          date_of_birth: '1998-05-15',
          is_valid: false,
          errors: ['Invalid phone number format'],
          is_duplicate: false,
        },
      ],
      can_commit: true,
    });

    render(
      <MemoryRouter>
        <DataImport />
      </MemoryRouter>
    );

    const file = new File(['mock content'], 'test_donors.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('csv-file-input');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('preview-summary-grid')).toBeDefined();
      expect(screen.getByText('Validation Issues Detected')).toBeDefined();
      expect(screen.getByText('Row 2:')).toBeDefined();
      expect(screen.getByText('John Doe')).toBeDefined();
    });

    const commitBtn = screen.getByTestId('commit-import-btn');
    expect(commitBtn.textContent).toContain('Commit 1 Valid Donors');
  });

  it('commits verified data and displays success message', async () => {
    dataImportService.previewDonorCsv.mockResolvedValue({
      filename: 'valid.csv',
      total_rows: 1,
      valid_rows: 1,
      invalid_rows: 0,
      duplicate_rows: 0,
      validation_errors: {},
      preview_items: [
        {
          row_number: 1,
          full_name: 'Committed User',
          email: 'commit@example.com',
          phone: '+1-555-9999',
          blood_group: 'B+',
          gender: 'male',
          date_of_birth: '1992-01-01',
          is_valid: true,
          errors: [],
          is_duplicate: false,
        },
      ],
      can_commit: true,
    });

    dataImportService.commitDonorCsv.mockResolvedValue({
      import_id: 2,
      filename: 'valid.csv',
      total_rows: 1,
      created_count: 1,
      skipped_count: 0,
      failed_count: 0,
      status: 'completed',
      summary_message: 'Successfully imported 1 donors. Skipped 0 duplicates. 0 failed.',
    });

    render(
      <MemoryRouter>
        <DataImport />
      </MemoryRouter>
    );

    const file = new File(['valid content'], 'valid.csv', { type: 'text/csv' });
    const fileInput = screen.getByTestId('csv-file-input');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('commit-import-btn')).toBeDefined();
    });

    const commitBtn = screen.getByTestId('commit-import-btn');
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(dataImportService.commitDonorCsv).toHaveBeenCalledWith(file);
      expect(screen.getByText('Successfully imported 1 donors. Skipped 0 duplicates. 0 failed.')).toBeDefined();
    });
  });

  it('rejects non-csv files with clear validation notice', async () => {
    render(
      <MemoryRouter>
        <DataImport />
      </MemoryRouter>
    );

    const file = new File(['binary'], 'malware.exe', { type: 'application/octet-stream' });
    const fileInput = screen.getByTestId('csv-file-input');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Invalid file format. Please select a valid .csv file.')).toBeDefined();
    });
  });
});
