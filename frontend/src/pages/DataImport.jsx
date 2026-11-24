import React, { useState, useEffect, useRef } from 'react';
import dataImportService from '../services/dataImportService';
import './DataImport.css';

// Accessible clean SVG icons
const IconUpload = () => (
  <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconDownload = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const DataImport = () => {
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // History state
  const [historyItems, setHistoryItems] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const data = await dataImportService.getImportHistory(0, 20);
      setHistoryItems(data.items || []);
    } catch (err) {
      console.warn('Failed to load import history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleDownloadTemplate = async () => {
    try {
      const blob = await dataImportService.downloadDonorTemplate();
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'donor_import_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setErrorMessage('Failed to download CSV template.');
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setErrorMessage('Invalid file format. Please select a valid .csv file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 5MB maximum limit.');
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsValidating(true);

    try {
      const preview = await dataImportService.previewDonorCsv(file);
      setPreviewData(preview);
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || 'Failed to parse CSV file.';
      setErrorMessage(msg);
      setPreviewData(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleCommit = async () => {
    if (!selectedFile || isCommitting) return;

    setIsCommitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await dataImportService.commitDonorCsv(selectedFile);
      setSuccessMessage(result.summary_message);
      setPreviewData(null);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadHistory();
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || 'Commit failed.';
      setErrorMessage(msg);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="import-container" data-testid="data-import-page">
      <div className="import-header">
        <div>
          <h1>Donor Data Import & Bulk Operations</h1>
          <p>Securely batch-upload donor records via validated CSV files.</p>
        </div>
        <button
          type="button"
          className="import-download-btn"
          onClick={handleDownloadTemplate}
          data-testid="download-template-btn"
        >
          <IconDownload />
          Download CSV Template
        </button>
      </div>

      {successMessage && (
        <div className="settings-feedback-banner success" data-testid="import-success-alert">
          <span>{successMessage}</span>
          <button type="button" onClick={() => setSuccessMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {errorMessage && (
        <div className="settings-feedback-banner error" data-testid="import-error-alert">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Upload Zone */}
      {!previewData && (
        <div className="import-upload-card" data-testid="import-dropzone">
          <IconUpload />
          <div>
            <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: '#0f172a' }}>
              Select a CSV file to validate and import
            </h3>
            <p className="upload-hint">Supports UTF-8 and UTF-8 BOM up to 5MB (max 1000 rows)</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            id="csv-file-input"
            className="upload-file-input"
            accept=".csv"
            onChange={handleFileChange}
            disabled={isValidating}
            data-testid="csv-file-input"
          />
          <label htmlFor="csv-file-input" className="upload-btn-label">
            {isValidating ? 'Validating CSV...' : 'Browse CSV File'}
          </label>
        </div>
      )}

      {/* Preview Section */}
      {previewData && (
        <>
          <div className="import-summary-grid" data-testid="preview-summary-grid">
            <div className="import-summary-card">
              <span className="summary-card-label">Total Records</span>
              <div className="summary-card-val">{previewData.total_rows}</div>
            </div>
            <div className="import-summary-card">
              <span className="summary-card-label">Valid Rows</span>
              <div className="summary-card-val valid">{previewData.valid_rows}</div>
            </div>
            <div className="import-summary-card">
              <span className="summary-card-label">Invalid Rows</span>
              <div className="summary-card-val invalid">{previewData.invalid_rows}</div>
            </div>
            <div className="import-summary-card">
              <span className="summary-card-label">Duplicates</span>
              <div className="summary-card-val duplicate">{previewData.duplicate_rows}</div>
            </div>
          </div>

          {/* Validation Errors Notice */}
          {previewData.invalid_rows > 0 && (
            <div className="import-errors-card" data-testid="validation-errors-box">
              <h3>Validation Issues Detected</h3>
              <ul className="error-list">
                {Object.entries(previewData.validation_errors).slice(0, 5).map(([rowNum, errs]) => (
                  <li key={rowNum}>
                    <strong>Row {rowNum}:</strong> {errs.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview Table */}
          <div className="preview-card" data-testid="preview-table-card">
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>
              Data Preview ({previewData.preview_items.length} of {previewData.total_rows} rows)
            </h3>
            <div className="preview-table-wrapper">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Status</th>
                    <th>Full Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Blood Group</th>
                    <th>Gender</th>
                    <th>DOB</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.preview_items.map((item) => (
                    <tr key={item.row_number}>
                      <td>#{item.row_number}</td>
                      <td>
                        <span className={`badge-row-status ${item.is_valid ? 'valid' : item.is_duplicate ? 'duplicate' : 'invalid'}`}>
                          {item.is_valid ? 'Valid' : item.is_duplicate ? 'Duplicate' : 'Invalid'}
                        </span>
                      </td>
                      <td>{item.full_name}</td>
                      <td>{item.email}</td>
                      <td>{item.phone}</td>
                      <td>{item.blood_group}</td>
                      <td>{item.gender}</td>
                      <td>{item.date_of_birth}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="preview-actions">
              <button
                type="button"
                className="btn-reset"
                onClick={handleReset}
                disabled={isCommitting}
                data-testid="cancel-preview-btn"
              >
                Cancel / Choose Another File
              </button>
              <button
                type="button"
                className="btn-commit"
                onClick={handleCommit}
                disabled={!previewData.can_commit || isCommitting}
                data-testid="commit-import-btn"
              >
                {isCommitting ? 'Committing...' : `Commit ${previewData.valid_rows} Valid Donors`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Import History */}
      <div className="preview-card" data-testid="import-history-card">
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>Recent Bulk Imports History</h3>
        {loadingHistory ? (
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading import history...</p>
        ) : historyItems.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>No past import logs found.</p>
        ) : (
          <div className="preview-table-wrapper">
            <table className="preview-table">
              <thead>
                <tr>
                  <th>Import ID</th>
                  <th>Filename</th>
                  <th>Date</th>
                  <th>Created</th>
                  <th>Skipped</th>
                  <th>Failed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {historyItems.map((log) => (
                  <tr key={log.id}>
                    <td>#{log.id}</td>
                    <td>{log.filename}</td>
                    <td>{new Date(log.created_at).toLocaleDateString()}</td>
                    <td>{log.created_rows}</td>
                    <td>{log.skipped_rows}</td>
                    <td>{log.failed_rows}</td>
                    <td>
                      <span className={`badge-row-status ${log.status === 'completed' ? 'valid' : 'invalid'}`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataImport;
