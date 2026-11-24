
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import dashboardService from '../services/dashboardService';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import './Dashboard.css';

const CHART_COLORS = [
  '#2563EB',
  '#0D9488',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#06B6D4',
  '#EC4899',
  '#64748B',
];

const STATUS_COLORS = {
  pending: '#F59E0B',
  approved: '#2563EB',
  fulfilled: '#0D9488',
  rejected: '#EF4444',
  cancelled: '#94A3B8',
};

const formatNumber = (value) => Number(value || 0).toLocaleString();

const formatLiters = (value) =>
  `${(Number(value || 0) / 1000).toFixed(1)} L`;

const IconDonors = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const IconDonation = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
  </svg>
);

const IconFlask = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">
    <path d="M10 2v7.31L4.1 19.33A2 2 0 0 0 5.8 22h12.4a2 2 0 0 0 1.7-2.67L14 9.31V2" />
    <line x1="8.5" x2="15.5" y1="2" y2="2" />
    <line x1="8.5" x2="15.5" y1="14" y2="14" />
  </svg>
);

const IconClipboard = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">
    <rect width="16" height="20" x="4" y="2" rx="2" />
    <line x1="8" x2="16" y1="6" y2="6" />
    <line x1="8" x2="16" y1="10" y2="10" />
    <line x1="8" x2="12" y1="14" y2="14" />
  </svg>
);

const IconTrending = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
);

const IconAlert = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" x2="12" y1="8" y2="12" />
    <line x1="12" x2="12.01" y1="16" y2="16" />
  </svg>
);

const IconRefresh = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

const EmptyChart = ({ message = 'No data available yet.' }) => (
  <div className="chart-empty-state">
    <div className="chart-empty-icon">—</div>
    <p>{message}</p>
  </div>
);

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="custom-chart-tooltip">
      {label && <p className="tooltip-label">{label}</p>}
      {payload.map((item, index) => (
        <div className="tooltip-row" key={`${item.dataKey}-${index}`}>
          <span
            className="tooltip-dot"
            style={{ backgroundColor: item.color || item.fill }}
          />
          <span>{item.name || item.dataKey}</span>
          <strong>{formatNumber(item.value)}</strong>
          {item.dataKey?.includes('volume') ||
            item.dataKey?.includes('quantity') ? ' ml' : ''}
        </div>
      ))}
    </div>
  );
};

export function Dashboard() {
  const { user } = useAuth();
  const isAdminOrStaff =
    user?.role === 'admin' || user?.role === 'staff';

  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    summary: null,
    donations: null,
    stock: null,
    requests: null,
    trends: null,
  });
  const [error, setError] = useState(null);
  const [partialError, setPartialError] = useState(false);
  const [donationTimeFilter, setDonationTimeFilter] = useState('all_time');

  const fetchDashboardData = useCallback(async () => {
    if (!isAdminOrStaff) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setPartialError(false);

    try {
      const data = await dashboardService.getAllDashboardData();

      if (data.errors?.summary) {
        if (data.errors.summary?.response?.status === 403) {
          setError(
            'Access restricted: Dashboard analytics are only available to staff and administrators.'
          );
        } else {
          setError('Failed to load operational overview metrics. Please retry.');
        }
      }

      setDashboardData({
        summary: data.summary || null,
        donations: data.donations || null,
        stock: data.stock || null,
        requests: data.requests || null,
        trends: data.trends || null,
      });

      if (
        data.summary &&
        (data.errors?.donations ||
          data.errors?.stock ||
          data.errors?.requests ||
          data.errors?.trends)
      ) {
        setPartialError(true);
      }
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
        err?.message ||
        'Unable to load dashboard metrics.'
      );
    } finally {
      setLoading(false);
    }
  }, [isAdminOrStaff]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const summary = dashboardData.summary;
  const donations = dashboardData.donations;
  const stock = dashboardData.stock;
  const requests = dashboardData.requests;
  const trends = dashboardData.trends?.trends || [];

  const selectedDonationCount = useMemo(() => {
    if (!donations) return summary?.total_donations ?? '—';

    const values = {
      today: donations.today_count,
      this_month: donations.this_month_count,
      this_year: donations.this_year_count,
      all_time: donations.all_time_count,
    };

    return values[donationTimeFilter] ?? donations.all_time_count;
  }, [donations, summary, donationTimeFilter]);

  const selectedDonationVolume = useMemo(() => {
    if (!donations) return '—';

    const values = {
      today: donations.today_volume_ml,
      this_month: donations.this_month_volume_ml,
      this_year: donations.this_year_volume_ml,
      all_time: donations.all_time_volume_ml,
    };

    return formatLiters(values[donationTimeFilter] ?? donations.all_time_volume_ml);
  }, [donations, donationTimeFilter]);

  const totalStockVolumeLiters =
    summary?.total_blood_stock_ml != null
      ? formatLiters(summary.total_blood_stock_ml)
      : stock?.total_available_ml != null
        ? formatLiters(stock.total_available_ml)
        : '—';

  const donationGroupData = useMemo(
    () =>
      (donations?.by_blood_group || []).map((item) => ({
        name: item.blood_group,
        count: Number(item.count || 0),
        volume: Number(item.total_volume_ml || 0),
      })),
    [donations]
  );

  const stockChartData = useMemo(
    () =>
      (stock?.stocks_by_group || []).map((item) => ({
        blood_group: item.blood_group,
        available_quantity_ml: Number(item.available_quantity_ml || 0),
        reserved_quantity_ml: Number(item.reserved_quantity_ml || 0),
      })),
    [stock]
  );

  const requestStatusData = useMemo(() => {
    const source = requests || summary;
    if (!source) return [];

    return [
      { name: 'Pending', value: Number(source.pending_requests || 0), key: 'pending' },
      { name: 'Approved', value: Number(source.approved_requests || 0), key: 'approved' },
      { name: 'Fulfilled', value: Number(source.fulfilled_requests || 0), key: 'fulfilled' },
      { name: 'Rejected', value: Number(source.rejected_requests || 0), key: 'rejected' },
      { name: 'Cancelled', value: Number(source.cancelled_requests || 0), key: 'cancelled' },
    ];
  }, [requests, summary]);

  const requestGroupData = useMemo(
    () =>
      (requests?.by_blood_group || []).map((item) => ({
        blood_group: item.blood_group,
        request_count: Number(item.request_count || 0),
        total_requested_ml: Number(item.total_requested_ml || 0),
      })),
    [requests]
  );

  const hasDonationGroupData = donationGroupData.some(
    (item) => item.count > 0 || item.volume > 0
  );
  const hasStockData = stockChartData.length > 0;
  const hasRequestStatusData = requestStatusData.some((item) => item.value > 0);
  const hasRequestGroupData = requestGroupData.some(
    (item) => item.request_count > 0 || item.total_requested_ml > 0
  );

  return (
    <div className="dashboard-page" data-testid="dashboard-page">
      <div className="dashboard-hero">
        <div className="dashboard-hero-content">
          <h1 className="dashboard-welcome-title" data-testid="welcome-message">
            Welcome back, {user?.full_name || 'User'}!
          </h1>
          <p className="dashboard-welcome-desc">
            Real-time blood bank operations, donor activity, and inventory intelligence
          </p>
        </div>

        {isAdminOrStaff && (
          <button
            type="button"
            className="btn btn-secondary refresh-btn"
            onClick={fetchDashboardData}
            disabled={loading}
            data-testid="refresh-dashboard-btn"
          >
            <IconRefresh />
            <span>{loading ? 'Refreshing...' : 'Refresh Metrics'}</span>
          </button>
        )}
      </div>

      {partialError && (
        <div className="dashboard-alert alert-warning" role="alert" data-testid="partial-error-banner">
          <IconAlert />
          <span>
            Some specialized metrics could not be loaded completely. Showing verified operational data.
          </span>
        </div>
      )}

      {error && (
        <div className="dashboard-error-card" data-testid="dashboard-error">
          <div className="error-icon-wrapper"><IconAlert /></div>
          <h3>Operational Overview Unavailable</h3>
          <p>{error}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={fetchDashboardData}
            data-testid="retry-dashboard-btn"
          >
            Retry Connection
          </button>
        </div>
      )}

      {!isAdminOrStaff && (
        <div className="non-admin-welcome-card" data-testid="donor-welcome-card">
          <div className="donor-welcome-icon"><IconDonation /></div>
          <h2>Donor &amp; Community Portal</h2>
          <p>
            Thank you for being an active part of our lifesaving community.
            Manage your profile, view upcoming blood donation opportunities,
            or submit requests via the navigation menu.
          </p>
        </div>
      )}

      <div className="stats-grid" data-testid="stats-grid">
        <div className="stat-card" data-testid="stat-total-donors">
          <div className="stat-icon-wrapper blue"><IconDonors /></div>
          <div className="stat-details">
            <span className="stat-label">Total Donors</span>
            <span className="stat-value" data-testid="value-total-donors">
              {loading ? <span className="stat-skeleton" /> : summary?.total_donors ?? '—'}
            </span>
            <span className="stat-status">
              {isAdminOrStaff
                ? summary ? 'Registered in Registry' : 'Live Data'
                : 'Community Members'}
            </span>
          </div>
        </div>

        <div className="stat-card" data-testid="stat-total-donations">
          <div className="stat-icon-wrapper red"><IconDonation /></div>
          <div className="stat-details">
            <span className="stat-label">Total Donations</span>
            <span className="stat-value" data-testid="value-total-donations">
              {loading ? <span className="stat-skeleton" /> : selectedDonationCount}
            </span>
            <span className="stat-status">
              {donations ? `Volume: ${selectedDonationVolume}` : 'Completed Units'}
            </span>
            {donations && (
              <select
                className="donation-filter-select"
                aria-label="Donation time period"
                value={donationTimeFilter}
                onChange={(event) => setDonationTimeFilter(event.target.value)}
              >
                <option value="today">Today</option>
                <option value="this_month">This Month</option>
                <option value="this_year">This Year</option>
                <option value="all_time">All Time</option>
              </select>
            )}
          </div>
        </div>

        <div className="stat-card" data-testid="stat-available-blood-stock">
          <div className="stat-icon-wrapper green"><IconFlask /></div>
          <div className="stat-details">
            <span className="stat-label">Available Blood Stock</span>
            <span className="stat-value" data-testid="value-available-blood-stock">
              {loading ? <span className="stat-skeleton" /> : totalStockVolumeLiters}
            </span>
            <span className="stat-status">
              {stock?.low_stock_alerts?.length > 0 ? (
                <span className="status-danger">
                  {stock.low_stock_alerts.length} Low Stock Alert{stock.low_stock_alerts.length > 1 ? 's' : ''}
                </span>
              ) : 'In Stock Available'}
            </span>
          </div>
        </div>

        <div className="stat-card" data-testid="stat-pending-blood-requests">
          <div className="stat-icon-wrapper amber"><IconClipboard /></div>
          <div className="stat-details">
            <span className="stat-label">Pending Blood Requests</span>
            <span className="stat-value" data-testid="value-pending-blood-requests">
              {loading ? <span className="stat-skeleton" /> : summary?.pending_requests ?? '—'}
            </span>
            <span className="stat-status">
              {summary ? `${summary.approved_requests || 0} Approved / Processing` : 'Awaiting Review'}
            </span>
          </div>
        </div>
      </div>

      {isAdminOrStaff && !error && (
        <>
          <section className="dashboard-section" data-testid="trends-section">
            <div className="section-header">
              <div>
                <h2 className="section-title"><IconTrending /> Monthly Donation Trends</h2>
                <p className="section-subtitle">
                  Monthly completed donation count and collected blood volume
                </p>
              </div>
            </div>

            <div className="analytics-card chart-card" data-testid="trends-chart">
              {loading ? (
                <div className="analytics-loading-placeholder">
                  <div className="loading-spinner" />
                  <p>Loading monthly donation trends...</p>
                </div>
              ) : trends.length > 0 ? (
                <div className="chart-container chart-container-large">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends} margin={{ top: 12, right: 20, left: 5, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="month" tick={{ fill: '#64748B', fontSize: 12 }} />
                      <YAxis yAxisId="count" allowDecimals={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                      <YAxis yAxisId="volume" orientation="right" tick={{ fill: '#64748B', fontSize: 12 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      <Line
                        yAxisId="count"
                        type="monotone"
                        dataKey="donation_count"
                        name="Donation Count"
                        stroke="#2563EB"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 7 }}
                      />
                      <Line
                        yAxisId="volume"
                        type="monotone"
                        dataKey="total_volume_ml"
                        name="Volume (ml)"
                        stroke="#0D9488"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 7 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyChart message="No completed donation trend data is available yet." />
              )}

              {!loading && trends.length > 0 && (
                <div className="chart-data-table" data-testid="trends-data-list">
                  {trends.map((item) => (
                    <div className="chart-data-row" key={item.month} data-testid={`trend-month-${item.month}`}>
                      <strong>{item.month}</strong>
                      <span>{formatNumber(item.donation_count)} donations</span>
                      <span>{formatNumber(item.total_volume_ml)} ml</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div className="dashboard-analytics-grid">
            <section className="analytics-card chart-card" data-testid="donation-group-card">
              <div className="card-header-row">
                <div>
                  <h2 className="analytics-title">Blood Group Donation</h2>
                  <p className="analytics-subtitle">Completed donations by blood type</p>
                </div>
              </div>

              {loading ? (
                <div className="analytics-loading-placeholder"><div className="loading-spinner" /><p>Loading donation distribution...</p></div>
              ) : hasDonationGroupData ? (
                <>
                  <div className="chart-container chart-container-donut">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donationGroupData.filter((item) => item.count > 0)}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="55%"
                          outerRadius="82%"
                          paddingAngle={3}
                        >
                          {donationGroupData.filter((item) => item.count > 0).map((item, index) => (
                            <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [formatNumber(value), 'Donations']} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-data-table" data-testid="donation-group-list">
                    {donationGroupData.map((item, index) => (
                      <div className="chart-data-row" key={item.name}>
                        <span className="chart-legend-name">
                          <i style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                          <strong>{item.name}</strong>
                        </span>
                        <span>{formatNumber(item.count)} donations</span>
                        <span>{formatNumber(item.volume)} ml</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyChart message="No completed donations by blood group yet." />
              )}
            </section>

            <section className="analytics-card chart-card" data-testid="request-status-card">
              <div className="card-header-row">
                <div>
                  <h2 className="analytics-title">Blood Request Status</h2>
                  <p className="analytics-subtitle">Request breakdown by current status</p>
                </div>
              </div>

              {loading ? (
                <div className="analytics-loading-placeholder"><div className="loading-spinner" /><p>Loading request metrics...</p></div>
              ) : hasRequestStatusData ? (
                <>
                  <div className="chart-container chart-container-donut">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={requestStatusData.filter((item) => item.value > 0)}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="48%"
                          outerRadius="78%"
                          paddingAngle={3}
                        >
                          {requestStatusData.filter((item) => item.value > 0).map((item) => (
                            <Cell key={item.key} fill={STATUS_COLORS[item.key]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [formatNumber(value), 'Requests']} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="request-status-breakdown" data-testid="request-status-list">
                    {requestStatusData.map((item) => (
                      <div className="status-stat-item" key={item.key}>
                        <span className={`status-bullet ${item.key}`} />
                        <span className="status-name">{item.name}</span>
                        <span className="status-count" data-testid={`count-${item.key}`}>
                          {formatNumber(item.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyChart message="No blood request records are available yet." />
              )}
            </section>

            <section className="analytics-card chart-card" data-testid="stock-breakdown-card">
              <div className="card-header-row">
                <div>
                  <h2 className="analytics-title">Blood Stock Overview</h2>
                  <p className="analytics-subtitle">Available and reserved inventory by blood group</p>
                </div>
              </div>

              {loading ? (
                <div className="analytics-loading-placeholder"><div className="loading-spinner" /><p>Loading inventory distribution...</p></div>
              ) : hasStockData ? (
                <>
                  <div className="chart-container chart-container-medium">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stockChartData} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="blood_group" tick={{ fill: '#64748B', fontSize: 12 }} />
                        <YAxis tick={{ fill: '#64748B', fontSize: 12 }} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend />
                        <Bar dataKey="available_quantity_ml" name="Available (ml)" fill="#2563EB" radius={[5, 5, 0, 0]} />
                        <Bar dataKey="reserved_quantity_ml" name="Reserved (ml)" fill="#0D9488" radius={[5, 5, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="stock-bars-container" data-testid="stock-bars-list">
                    {stock.stocks_by_group.map((item) => {
                      const isLow = item.status === 'low_stock' || item.status === 'out_of_stock';
                      return (
                        <div key={item.blood_group} className="stock-bar-row" data-testid={`stock-row-${item.blood_group}`}>
                          <div className="stock-group-badge">{item.blood_group}</div>
                          <div className="stock-bar-track">
                            <div
                              className={`stock-bar-fill ${isLow ? 'fill-low' : 'fill-normal'}`}
                              style={{
                                width: `${Math.min(100, Math.max(2, (item.available_quantity_ml / Math.max(...stockChartData.map((s) => s.available_quantity_ml), 1)) * 100))}%`,
                              }}
                            />
                          </div>
                          <div className="stock-qty-col">
                            <span className="qty-main">{formatNumber(item.available_quantity_ml)} ml</span>
                            <span className={`status-pill pill-${item.status}`}>
                              {item.status === 'out_of_stock'
                                ? 'Out of Stock'
                                : item.status === 'low_stock'
                                  ? 'Low'
                                  : item.status === 'adequate'
                                    ? 'Adequate'
                                    : 'Sufficient'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <EmptyChart message="No inventory records found." />
              )}
            </section>

            <section className="analytics-card chart-card" data-testid="request-group-card">
              <div className="card-header-row">
                <div>
                  <h2 className="analytics-title">Blood Requests by Group</h2>
                  <p className="analytics-subtitle">Request count for each blood type</p>
                </div>
              </div>

              {loading ? (
                <div className="analytics-loading-placeholder"><div className="loading-spinner" /><p>Loading blood group requests...</p></div>
              ) : hasRequestGroupData ? (
                <>
                  <div className="chart-container chart-container-medium">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={requestGroupData} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="blood_group" tick={{ fill: '#64748B', fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="request_count" name="Requests" fill="#8B5CF6" radius={[5, 5, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-data-table">
                    {requestGroupData.map((item) => (
                      <div className="chart-data-row" key={item.blood_group}>
                        <strong>{item.blood_group}</strong>
                        <span>{formatNumber(item.request_count)} requests</span>
                        <span>{formatNumber(item.total_requested_ml)} ml</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyChart message="No blood group request data is available yet." />
              )}
            </section>
          </div>
        </>
      )}

      <section className="dashboard-section system-status-section">
        <div className="section-header">
          <h2 className="section-title">System Status &amp; Environment</h2>
        </div>
        <div className="table-responsive">
          <table className="system-status-table">
            <tbody>
              <tr>
                <td className="status-label">Authenticated User</td>
                <td><code className="status-code-tag">{user?.full_name || 'N/A'}</code></td>
              </tr>
              <tr>
                <td className="status-label">User Email</td>
                <td><code className="status-code-tag">{user?.email || 'N/A'}</code></td>
              </tr>
              <tr>
                <td className="status-label">User Role</td>
                <td><code className="status-code-tag">{user?.role || 'N/A'}</code></td>
              </tr>
              <tr>
                <td className="status-label">Backend Operational Access</td>
                <td><code className="status-code-tag">{isAdminOrStaff ? 'Admin / Staff Privileged' : 'Donor / Community'}</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
