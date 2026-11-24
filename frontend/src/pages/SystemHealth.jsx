
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import healthService from '../services/healthService';
import './SystemHealth.css';

export const SystemHealth = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const timerRef = useRef(null);
  const requestRef = useRef(false);
  const mountedRef = useRef(false);

  const fetchHealth = useCallback(async (isManual = false) => {
    if (!isAdmin || requestRef.current) return;

    requestRef.current = true;

    if (isManual) setRefreshing(true);

    try {
      setError(null);

      const data = await healthService.getSystemDiagnostics();

      console.log('SYSTEM HEALTH API RESPONSE:', data);
      console.log('SYSTEM STATUS:', data?.status);
      console.log('DATABASE STATUS:', data?.database?.status);

      setDiagnostics(data);

      if (!mountedRef.current) return;

      setDiagnostics(data);
      setLastChecked(new Date());
    } catch (err) {
      if (!mountedRef.current) return;

      const statusCode = err?.response?.status;

      if (statusCode === 401 || statusCode === 403) {
        setError('Access denied. Admin authorization is required.');
      } else {
        setError(
          err?.response?.data?.detail ||
          'Unable to retrieve system diagnostics. Please try again.'
        );
      }
    } finally {
      requestRef.current = false;

      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [isAdmin]);

  useEffect(() => {
    mountedRef.current = true;

    if (isAdmin) {
      fetchHealth();
    } else {
      setLoading(false);
      setError('Admin access is required to view system diagnostics.');
    }

    return () => {
      mountedRef.current = false;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isAdmin, fetchHealth]);

  useEffect(() => {
    if (!isAdmin || !autoRefresh) return;

    timerRef.current = setInterval(() => {
      fetchHealth(false);
    }, 30000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoRefresh, isAdmin, fetchHealth]);

  const formatUptime = (seconds) => {
    if (seconds === undefined || seconds === null) return 'N/A';

    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];

    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);

    parts.push(`${s}s`);

    return parts.join(' ');
  };

  if (loading) {
    return (
      <div className="health-container" data-testid="health-loading">
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p>Running system diagnostics...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="health-container" data-testid="system-health-page">
        <div className="health-feedback-banner error">
          {error}
        </div>
      </div>
    );
  }

  const systemStatus = diagnostics?.status;
  const databaseStatus = diagnostics?.database?.status;

  const systemLabel = systemStatus
    ? systemStatus.charAt(0).toUpperCase() + systemStatus.slice(1)
    : 'Unknown';

  const databaseLabel = databaseStatus
    ? databaseStatus.charAt(0).toUpperCase() + databaseStatus.slice(1)
    : 'Unknown';

  return (
    <div className="health-container" data-testid="system-health-page">

      <div className="health-header">
        <div>
          <h1>System Health Monitoring & Diagnostics</h1>
          <p>
            Real-time operational status, PostgreSQL database connectivity,
            and backend latency metrics.
          </p>
        </div>

        <div className="health-actions">
          <label className="health-auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span>Auto-refresh (30s)</span>
          </label>

          <button
            type="button"
            className="health-btn"
            onClick={() => fetchHealth(true)}
            disabled={refreshing}
            data-testid="refresh-health-btn"
          >
            {refreshing ? 'Checking...' : 'Refresh Health Check'}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="health-feedback-banner error"
          data-testid="health-error-banner"
        >
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {!diagnostics && (
        <div className="health-feedback-banner error">
          System diagnostics are currently unavailable.
          Please refresh to try again.
        </div>
      )}

      <div className="health-grid">

        {/* System Status */}
        <div className="health-card" data-testid="status-card-system">
          <div className="health-card-header">
            <h2 className="health-card-title">System Status</h2>

            <span
              className={`health-indicator-dot ${systemStatus || 'unknown'}`}
              title={systemStatus || 'Unknown'}
            />
          </div>

          <p className="health-metric-value">
            {systemLabel}
          </p>

          <p className="health-card-detail">
            <span>Environment</span>
            <strong>
              {diagnostics?.environment || 'N/A'}
            </strong>
          </p>
        </div>

        {/* PostgreSQL Database */}
        <div className="health-card" data-testid="status-card-db">
          <div className="health-card-header">
            <h2 className="health-card-title">PostgreSQL Database</h2>

            <span
              className={`health-indicator-dot ${databaseStatus || 'unknown'}`}
              title={databaseStatus || 'Unknown'}
            />
          </div>

          <p className="health-metric-value">
            {databaseLabel}
          </p>

          <p className="health-card-detail">
            <span>Dialect</span>
            <strong>
              {diagnostics?.database?.dialect || 'N/A'}
            </strong>
          </p>
        </div>

        {/* Database Latency */}
        <div className="health-card" data-testid="status-card-latency">
          <div className="health-card-header">
            <h2 className="health-card-title">Database Latency</h2>

            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="16"
              height="16"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>

          <p className="health-metric-value">
            {diagnostics?.database?.response_time_ms ?? 'N/A'}
            <span className="health-metric-unit">ms</span>
          </p>

          <p className="health-card-detail">
            <span>Query Type</span>
            <strong>SELECT 1 (Ping)</strong>
          </p>
        </div>

        {/* Application Uptime */}
        <div className="health-card" data-testid="status-card-uptime">
          <div className="health-card-header">
            <h2 className="health-card-title">Process Uptime</h2>

            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="16"
              height="16"
              aria-hidden="true"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>

          <p className="health-metric-value" style={{ fontSize: '1.4rem' }}>
            {formatUptime(diagnostics?.uptime_seconds)}
          </p>

          <p className="health-card-detail">
            <span>Process</span>
            <strong>Running</strong>
          </p>
        </div>
      </div>

      {/* Runtime Specifications */}
      <div className="health-detail-section">
        <div className="health-section-header">
          Runtime & Infrastructure Specifications
        </div>

        <div className="health-specs-list">

          <div className="health-spec-item">
            <span className="health-spec-label">Application Name</span>
            <span className="health-spec-val">
              {diagnostics?.application_name || 'N/A'}
            </span>
          </div>

          <div className="health-spec-item">
            <span className="health-spec-label">Software Version</span>
            <span className="health-spec-val">
              v{diagnostics?.application_version || 'N/A'}
            </span>
          </div>

          <div className="health-spec-item">
            <span className="health-spec-label">Python Runtime</span>
            <span className="health-spec-val">
              {diagnostics?.python_version || 'N/A'}
            </span>
          </div>

          <div className="health-spec-item">
            <span className="health-spec-label">Connection Pool Size</span>
            <span className="health-spec-val">
              {diagnostics?.database?.pool_size ?? 'N/A'}
            </span>
          </div>

          <div className="health-spec-item">
            <span className="health-spec-label">Last Inspected</span>
            <span className="health-spec-val">
              {lastChecked
                ? lastChecked.toLocaleTimeString()
                : 'N/A'}
            </span>
          </div>

          <div className="health-spec-item">
            <span className="health-spec-label">CPU / RAM Monitoring</span>
            <span
              className="health-spec-val"
              style={{ color: '#94a3b8', fontStyle: 'italic' }}
            >
              NOT SUPPORTED (Zero-agent architecture)
            </span>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SystemHealth;
