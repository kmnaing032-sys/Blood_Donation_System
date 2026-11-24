import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import backupService from '../services/backupService';
import './BackupManagement.css';

export const BackupManagement = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Restore preparation modal state
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restorePrepInfo, setRestorePrepInfo] = useState(null);
  const [preparingRestore, setPreparingRestore] = useState(false);

  const fetchBackups = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await backupService.getBackups();
      setBackups(data.backups || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load database backups.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async (format = 'custom') => {
    if (!isAdmin) return;
    try {
      setCreating(true);
      setError(null);
      setSuccessMessage(null);
      const newBackup = await backupService.createBackup(format);
      setSuccessMessage(`Database backup created successfully: ${newBackup.filename}`);
      fetchBackups();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to create database backup.');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (backup) => {
    try {
      setError(null);
      await backupService.downloadBackup(backup.id, backup.filename);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to download backup file.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await backupService.deleteBackup(deleteTarget.id);
      setSuccessMessage(`Database backup '${deleteTarget.filename}' deleted successfully.`);
      setDeleteTarget(null);
      fetchBackups();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to delete backup.');
    } finally {
      setDeleting(false);
    }
  };

  const handlePrepareRestore = async (backup) => {
    try {
      setPreparingRestore(true);
      setError(null);
      const res = await backupService.prepareRestore(backup.id, 'CONFIRM_RESTORE');
      setRestorePrepInfo(res);
      setRestoreTarget(backup);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to verify restore preconditions.');
    } finally {
      setPreparingRestore(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="backups-loading-state" data-testid="backups-loading">
        <div className="spinner" aria-label="Loading backups..." />
        <p>Loading database backups...</p>
      </div>
    );
  }

  return (
    <div className="backups-container" data-testid="backup-management-page">
      <div className="backups-header">
        <div>
          <h1>Database Backup & Restore Management</h1>
          <p>Create secure PostgreSQL database dumps, manage backup archives, and inspect restore procedures.</p>
        </div>
        <div className="backups-actions">
          <button
            type="button"
            className="backups-btn backups-btn-secondary"
            onClick={fetchBackups}
            disabled={creating}
          >
            Refresh
          </button>
          {isAdmin && (
            <button
              type="button"
              className="backups-btn backups-btn-primary"
              onClick={() => handleCreateBackup('custom')}
              disabled={creating}
              data-testid="create-backup-btn"
            >
              {creating ? 'Creating Backup...' : 'Create Backup (.dump)'}
            </button>
          )}
        </div>
      </div>

      {successMessage && (
        <div className="backups-feedback-banner success" data-testid="backup-success-alert">
          <span>{successMessage}</span>
          <button
            type="button"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
            onClick={() => setSuccessMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="backups-feedback-banner error" data-testid="backup-error-alert">
          <span>{error}</span>
          <button
            type="button"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className="backups-feedback-banner warning">
        <span>
          <strong>Disaster Recovery Notice:</strong> Restoring a database replaces live records with the snapshot. In accordance with zero-downtime safety guidelines, restore verification provides tested operational commands for maintenance windows.
        </span>
      </div>

      <div className="backups-card">
        {backups.length === 0 ? (
          <div className="backups-empty-state" data-testid="backups-empty">
            <p>No database backups have been created yet.</p>
            {isAdmin && (
              <button
                type="button"
                className="backups-btn backups-btn-primary"
                onClick={() => handleCreateBackup('custom')}
                disabled={creating}
              >
                Create First Backup
              </button>
            )}
          </div>
        ) : (
          <div className="backups-table-wrapper">
            <table className="backups-table">
              <thead>
                <tr>
                  <th>Backup ID</th>
                  <th>Filename</th>
                  <th>Size</th>
                  <th>Format</th>
                  <th>Created At</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id} data-testid={`backup-row-${b.id}`}>
                    <td>#{b.id}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{b.filename}</td>
                    <td>{formatBytes(b.file_size_bytes)}</td>
                    <td>
                      <span className="backup-format-badge">{b.format}</span>
                    </td>
                    <td>{new Date(b.created_at).toLocaleString()}</td>
                    <td>
                      <span className={`backup-status-badge ${b.status}`}>
                        {b.status}
                      </span>
                    </td>
                    <td>
                      <div className="backup-action-btns">
                        <button
                          type="button"
                          className="backups-btn backups-btn-secondary"
                          onClick={() => handleDownload(b)}
                          title="Download Backup"
                          data-testid={`download-btn-${b.id}`}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          className="backups-btn backups-btn-secondary"
                          onClick={() => handlePrepareRestore(b)}
                          disabled={preparingRestore}
                          title="Verify Restore"
                          data-testid={`restore-btn-${b.id}`}
                        >
                          Restore
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            className="backups-btn backups-btn-danger"
                            onClick={() => setDeleteTarget(b)}
                            title="Delete Backup"
                            data-testid={`delete-btn-${b.id}`}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="modal-overlay" data-testid="delete-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Confirm Backup Deletion</h2>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to delete backup <strong>{deleteTarget.filename}</strong>?
                This action will permanently delete the snapshot file from disk and cannot be undone.
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="backups-btn backups-btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="backups-btn backups-btn-danger"
                onClick={confirmDelete}
                disabled={deleting}
                data-testid="confirm-delete-btn"
              >
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Information Modal */}
      {restoreTarget && restorePrepInfo && (
        <div className="modal-overlay" data-testid="restore-modal">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>Restore Verification & Execution</h2>
            </div>
            <div className="modal-body">
              <p>
                <strong>File verified:</strong> {restorePrepInfo.filename} (Backup #{restorePrepInfo.backup_id})
              </p>
              <p style={{ color: '#b91c1c', fontWeight: 600 }}>
                {restorePrepInfo.warning}
              </p>
              <p>
                To avoid connection disruption to active users, run the following recovery command on the database host server:
              </p>
              <div className="cmd-box">
                {restorePrepInfo.operational_command}
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="backups-btn backups-btn-secondary"
                onClick={() => {
                  setRestoreTarget(null);
                  setRestorePrepInfo(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackupManagement;
