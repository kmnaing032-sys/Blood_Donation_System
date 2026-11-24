import React, { useState, useEffect, useCallback } from 'react';
import auditLogService from '../services/auditLogService';
import './AuditLogs.css';

export const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await auditLogService.getAuditLogs({
        page,
        pageSize,
        entityType: entityFilter || undefined,
        action: actionFilter || undefined,
      });
      setLogs(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.response?.data?.message || 'Failed to fetch audit logs.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, entityFilter, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleEntityChange = (e) => {
    setEntityFilter(e.target.value);
    setPage(1);
  };

  const handleActionChange = (e) => {
    setActionFilter(e.target.value);
    setPage(1);
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'medium',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="audit-logs-page" data-testid="audit-logs-page">
      <div className="audit-header">
        <div className="audit-title-group">
          <h1>System Audit Logs</h1>
          <p>Read-only forensic audit trail of critical operational actions and events</p>
        </div>
        <button
          type="button"
          className="audit-refresh-btn"
          onClick={fetchLogs}
          disabled={loading}
          data-testid="refresh-audit-logs"
        >
          {loading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </div>

      <div className="audit-filter-card" data-testid="audit-filter-card">
        <div className="filter-group">
          <label htmlFor="audit-entity-filter">Entity Type:</label>
          <select
            id="audit-entity-filter"
            className="filter-select"
            value={entityFilter}
            onChange={handleEntityChange}
            data-testid="filter-entity"
          >
            <option value="">All Entities</option>
            <option value="auth">Auth</option>
            <option value="user">User</option>
            <option value="donor">Donor</option>
            <option value="donation">Donation</option>
            <option value="blood_stock">Blood Stock</option>
            <option value="blood_request">Blood Request</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="audit-action-filter">Action:</label>
          <input
            id="audit-action-filter"
            type="text"
            className="filter-input"
            placeholder="e.g. login_success, stock_adjusted"
            value={actionFilter}
            onChange={handleActionChange}
            data-testid="filter-action"
          />
        </div>
      </div>

      {error && (
        <div className="donors-feedback-banner error" data-testid="audit-error-banner">
          <span>{error}</span>
          <button type="button" onClick={fetchLogs} className="page-btn">Retry</button>
        </div>
      )}

      <div className="audit-table-card">
        <div className="table-responsive">
          <table className="audit-table" data-testid="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Actor</th>
                <th>Description</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="loading-state" data-testid="audit-loading">
                    Loading audit records...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-state" data-testid="audit-empty">
                    <h3>No audit logs found</h3>
                    <p>There are no audit events matching the selected filters.</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} data-testid={`audit-row-${log.id}`}>
                    <td className="time-cell">{formatDate(log.created_at)}</td>
                    <td>
                      <span className="action-badge">{log.action}</span>
                    </td>
                    <td>
                      <span className="entity-badge">{log.entity_type}</span>
                      {log.entity_id && <span style={{ marginLeft: 4, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>#{log.entity_id}</span>}
                    </td>
                    <td>
                      {log.user ? (
                        <div>
                          <strong>{log.user.full_name}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{log.user.email} ({log.user.role})</div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>System / Anonymous</span>
                      )}
                    </td>
                    <td>{log.description}</td>
                    <td className="ip-cell">{log.ip_address || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && logs.length > 0 && (
          <div className="pagination-bar" data-testid="audit-pagination">
            <span>
              Showing {logs.length} of {total} records (Page {page} of {totalPages})
            </span>
            <div className="pagination-controls">
              <button
                type="button"
                className="page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                data-testid="audit-prev-page"
              >
                Previous
              </button>
              <button
                type="button"
                className="page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                data-testid="audit-next-page"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
