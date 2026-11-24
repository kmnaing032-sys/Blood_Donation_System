import React, { useState, useEffect, useCallback } from 'react';
import reportService from '../services/reportService';
import './Reports.css';

export const Reports = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [requestStatus, setRequestStatus] = useState('');

  // Report Data
  const [overview, setOverview] = useState(null);
  const [donors, setDonors] = useState(null);
  const [donations, setDonations] = useState(null);
  const [bloodStock, setBloodStock] = useState(null);
  const [requests, setRequests] = useState(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, donorData, donationData, stockData, requestData] = await Promise.all([
        reportService.getOverview({ startDate, endDate }),
        reportService.getDonors({ startDate, endDate, bloodGroup }),
        reportService.getDonations({ startDate, endDate, bloodGroup }),
        reportService.getBloodStock({ bloodGroup }),
        reportService.getBloodRequests({ startDate, endDate, bloodGroup, status: requestStatus }),
      ]);

      setOverview(overviewData);
      setDonors(donorData);
      setDonations(donationData);
      setBloodStock(stockData);
      setRequests(requestData);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.response?.data?.message || 'Failed to load report data.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, bloodGroup, requestStatus]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const blob = await reportService.exportCsv({
        reportType: 'overview',
        startDate,
        endDate,
        bloodGroup,
        status: requestStatus,
      });
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `blood_system_report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert('Failed to export CSV report.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const blob = await reportService.exportPdf({
        reportType: 'overview',
        startDate,
        endDate,
        bloodGroup,
        status: requestStatus,
      });
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `blood_system_report_${new Date().toISOString().slice(0, 10)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert('Failed to export PDF report.');
    } finally {
      setExporting(false);
    }
  };

  // Safe percentage helper
  const getMaxVolume = (items) => {
    if (!items || items.length === 0) return 1;
    return Math.max(...items.map((i) => i.total_volume_ml || i.available_quantity_ml || 0), 1);
  };

  return (
    <div className="reports-page" data-testid="reports-page">
      {/* Header */}
      <div className="reports-header">
        <div className="reports-title-group">
          <h1>Clinical Reports & Analytics</h1>
          <p>Verified PostgreSQL operational statistics, inventory metrics, and clinical activity</p>
        </div>
        <div className="reports-actions-bar">
          <button
            type="button"
            className="btn-report-action"
            onClick={fetchReports}
            disabled={loading}
            data-testid="refresh-reports-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            Refresh
          </button>
          <button
            type="button"
            className="btn-report-action"
            onClick={handleExportCsv}
            disabled={exporting || loading}
            data-testid="export-csv-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
          <button
            type="button"
            className="btn-report-action primary"
            onClick={handleExportPdf}
            disabled={exporting || loading}
            data-testid="export-pdf-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      {/* Filter Card */}
      <div className="reports-filter-card" data-testid="reports-filter-card">
        <div className="filter-item">
          <label htmlFor="filter-start-date">Start Date:</label>
          <input
            id="filter-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            data-testid="filter-start-date"
          />
        </div>

        <div className="filter-item">
          <label htmlFor="filter-end-date">End Date:</label>
          <input
            id="filter-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            data-testid="filter-end-date"
          />
        </div>

        <div className="filter-item">
          <label htmlFor="filter-blood-group">Blood Group:</label>
          <select
            id="filter-blood-group"
            value={bloodGroup}
            onChange={(e) => setBloodGroup(e.target.value)}
            data-testid="filter-blood-group"
          >
            <option value="">All Groups</option>
            <option value="A+">A+</option>
            <option value="A-">A-</option>
            <option value="B+">B+</option>
            <option value="B-">B-</option>
            <option value="AB+">AB+</option>
            <option value="AB-">AB-</option>
            <option value="O+">O+</option>
            <option value="O-">O-</option>
          </select>
        </div>

        <div className="filter-item">
          <label htmlFor="filter-request-status">Request Status:</label>
          <select
            id="filter-request-status"
            value={requestStatus}
            onChange={(e) => setRequestStatus(e.target.value)}
            data-testid="filter-request-status"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="donors-feedback-banner error" data-testid="reports-error-banner">
          <span>{error}</span>
          <button type="button" onClick={fetchReports} className="page-btn">Retry</button>
        </div>
      )}

      {/* Loading state */}
      {loading && !overview && (
        <div className="loading-state" data-testid="reports-loading">
          <p>Calculating reports and aggregating clinical database records...</p>
        </div>
      )}

      {/* KPI Overview Grid */}
      {!loading && overview && (
        <div className="overview-grid" data-testid="overview-grid">
          <div className="kpi-card" data-testid="kpi-donors">
            <span className="kpi-label">Total Donors</span>
            <span className="kpi-value">{overview.total_donors}</span>
            <span className="kpi-subtext">+{overview.new_donors_in_period} in period</span>
          </div>

          <div className="kpi-card" data-testid="kpi-donations">
            <span className="kpi-label">Donation Volume</span>
            <span className="kpi-value">{overview.total_donated_volume_ml} ml</span>
            <span className="kpi-subtext">{overview.total_donations} total collections</span>
          </div>

          <div className="kpi-card" data-testid="kpi-stock">
            <span className="kpi-label">Available Blood Stock</span>
            <span className="kpi-value">{overview.total_available_stock_ml} ml</span>
            <span className="kpi-subtext">Across all blood groups</span>
          </div>

          <div className="kpi-card" data-testid="kpi-requests">
            <span className="kpi-label">Blood Requests</span>
            <span className="kpi-value">{overview.total_requests}</span>
            <span className="kpi-subtext">
              {overview.pending_requests} pending · {overview.fulfilled_requests} fulfilled
            </span>
          </div>
        </div>
      )}

      {/* Analytics Panels Grid */}
      {!loading && (
        <div className="analytics-grid">
          {/* Donations by Blood Group Bar Chart */}
          <div className="report-panel" data-testid="donations-chart-panel">
            <div className="panel-header">
              <h2 className="panel-title">Donation Volume by Blood Group</h2>
            </div>
            {donations && donations.by_blood_group && donations.by_blood_group.length > 0 ? (
              <div className="report-bar-chart" data-testid="donations-bar-chart">
                {donations.by_blood_group.map((item) => {
                  const max = getMaxVolume(donations.by_blood_group);
                  const pct = Math.max(Math.round((item.total_volume_ml / max) * 100), 5);
                  return (
                    <div key={item.blood_group} className="bar-row" data-testid={`donation-bar-${item.blood_group}`}>
                      <span className="bar-label">{item.blood_group}</span>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="bar-value">{item.total_volume_ml} ml</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" data-testid="empty-donations">
                <p>No donation data in selected criteria.</p>
              </div>
            )}
          </div>

          {/* Blood Stock Inventory Distribution Bar Chart */}
          <div className="report-panel" data-testid="stock-chart-panel">
            <div className="panel-header">
              <h2 className="panel-title">Blood Stock Availability</h2>
            </div>
            {bloodStock && bloodStock.by_blood_group && bloodStock.by_blood_group.length > 0 ? (
              <div className="report-bar-chart" data-testid="stock-bar-chart">
                {bloodStock.by_blood_group.map((item) => {
                  const max = getMaxVolume(bloodStock.by_blood_group);
                  const pct = Math.max(Math.round((item.available_quantity_ml / max) * 100), 5);
                  return (
                    <div key={item.blood_group} className="bar-row" data-testid={`stock-bar-${item.blood_group}`}>
                      <span className="bar-label">{item.blood_group}</span>
                      <div className="bar-track">
                        <div className="bar-fill stock" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="bar-value">{item.available_quantity_ml} ml</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" data-testid="empty-stock">
                <p>No stock distribution data available.</p>
              </div>
            )}
          </div>

          {/* Blood Request Status Distribution */}
          <div className="report-panel" data-testid="requests-status-panel">
            <div className="panel-header">
              <h2 className="panel-title">Blood Request Status Breakdown</h2>
            </div>
            {requests ? (
              <div className="status-pill-grid" data-testid="requests-status-grid">
                <div className="status-stat-box" data-testid="status-pending">
                  <span className="count">{requests.pending_count}</span>
                  <span className="label">Pending</span>
                </div>
                <div className="status-stat-box" data-testid="status-approved">
                  <span className="count">{requests.approved_count}</span>
                  <span className="label">Approved</span>
                </div>
                <div className="status-stat-box" data-testid="status-fulfilled">
                  <span className="count">{requests.fulfilled_count}</span>
                  <span className="label">Fulfilled</span>
                </div>
                <div className="status-stat-box" data-testid="status-rejected">
                  <span className="count">{requests.rejected_count}</span>
                  <span className="label">Rejected</span>
                </div>
                <div className="status-stat-box" data-testid="status-cancelled">
                  <span className="count">{requests.cancelled_count}</span>
                  <span className="label">Cancelled</span>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>No request status records.</p>
              </div>
            )}
          </div>

          {/* Donor Demographics */}
          <div className="report-panel" data-testid="donors-demographics-panel">
            <div className="panel-header">
              <h2 className="panel-title">Donor Blood Group Distribution</h2>
            </div>
            {donors && donors.by_blood_group && donors.by_blood_group.length > 0 ? (
              <div className="report-bar-chart" data-testid="donors-bar-chart">
                {donors.by_blood_group.map((item) => (
                  <div key={item.blood_group} className="bar-row">
                    <span className="bar-label">{item.blood_group}</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round((item.count / (donors.total_donors || 1)) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="bar-value">{item.count} donors</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>No donor demographic records.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
