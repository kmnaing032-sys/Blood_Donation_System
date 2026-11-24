import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import bloodStockService from '../services/bloodStockService';
import { StockAdjustmentModal } from '../components/bloodStock/StockAdjustmentModal';
import './BloodStock.css';

const ALL_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Target maximum baseline capacity per blood group for progress bars (e.g. 5,000 ml)
const MAX_CAPACITY_TARGET_ML = 5000;

export const BloodStock = () => {
  const { user } = useAuth();
  const isStaffOrAdmin = user?.role === 'admin' || user?.role === 'staff';

  // Overall summary & inventory list states
  const [summary, setSummary] = useState(null);
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Table filtering, sorting, pagination state
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [minQty, setMinQty] = useState('');
  const [maxQty, setMaxQty] = useState('');
  const [sortBy, setSortBy] = useState('blood_group');
  const [sortOrder, setSortOrder] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Adjustment Modal state
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedStockForAdjust, setSelectedStockForAdjust] = useState(null);
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

  // Fetch summary and stocks
  const fetchStockList = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = {
          page,
          page_size: pageSize,
          sort_by: sortBy,
          sort_order: sortOrder,
        };
        if (selectedGroup !== 'all') {
          params.blood_group = selectedGroup;
        }
        if (minQty !== '') {
          params.min_quantity = minQty;
        }
        if (maxQty !== '') {
          params.max_quantity = maxQty;
        }

        const [summaryRes, listRes] = await Promise.all([
          bloodStockService.getBloodStockSummary().catch(() => null),
          bloodStockService.getBloodStocks(params),
        ]);

        if (summaryRes) {
          setSummary(summaryRes);
        }
        setStockItems(listRes.items || []);
        setTotalPages(listRes.total_pages || 1);
        setTotalItems(listRes.total || 0);
      } catch (err) {
        const message =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          'Failed to load blood stock inventory';
        setError(message);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [page, pageSize, selectedGroup, minQty, maxQty, sortBy, sortOrder]
  );

  useEffect(() => {
    fetchStockList();
  }, [fetchStockList]);

  // Handle manual refresh button click
  const handleRefreshClick = () => {
    if (loading || isRefreshing) return;
    fetchStockList(true);
  };

  // Handle open adjust modal
  const handleOpenAdjust = (stock) => {
    setSelectedStockForAdjust(stock);
    setIsAdjustModalOpen(true);
  };

  const handleCloseAdjust = () => {
    setIsAdjustModalOpen(false);
    setSelectedStockForAdjust(null);
  };

  // Submit calibration
  const handleSubmitAdjust = async (payload) => {
    if (!selectedStockForAdjust) return;
    setIsSubmittingAdjust(true);
    setFeedback(null);
    try {
      await bloodStockService.updateBloodStock(selectedStockForAdjust.id, payload);
      setFeedback({
        type: 'success',
        message: `Successfully calibrated blood stock for ${selectedStockForAdjust.blood_group}.`,
      });
      handleCloseAdjust();
      fetchStockList();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to calibrate blood stock';
      setFeedback({
        type: 'error',
        message,
      });
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  // Helpers for Status Badges
  const getStatusBadge = (status) => {
    const normalized = (status || '').toLowerCase();
    switch (normalized) {
      case 'critical':
        return <span className="status-badge status-critical">Critical</span>;
      case 'low':
        return <span className="status-badge status-low">Low Stock</span>;
      case 'normal':
        return <span className="status-badge status-normal">Normal</span>;
      case 'sufficient':
      case 'good':
      case 'good stock':
        return <span className="status-badge status-sufficient">Good Stock</span>;
      default:
        return <span className="status-badge">{status || 'Unknown'}</span>;
    }
  };

  // Helper to derive status from available quantity if table row doesn't have it
  const deriveStatusFromAvailable = (avail) => {
    if (avail === 0) return 'critical';
    if (avail < 1000) return 'low';
    if (avail < 3000) return 'normal';
    return 'sufficient';
  };

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime())
        ? dateStr
        : d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  // Prepare Chart Data
  const chartData = useMemo(() => {
    if (!summary?.stock_by_group) return [];
    return summary.stock_by_group.map((item) => ({
      blood_group: item.blood_group,
      available_ml: item.available_ml,
      reserved_ml: item.reserved_ml,
      total_ml: item.total_ml,
      status: item.status,
    }));
  }, [summary]);

  // Color generator for chart bars based on stock status
  const getBarColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'critical':
        return '#EF4444'; // Red
      case 'low':
        return '#F59E0B'; // Amber
      case 'normal':
        return '#2563EB'; // Primary Blue
      case 'sufficient':
      case 'good':
      case 'good stock':
        return '#0D9488'; // Teal
      default:
        return '#2563EB';
    }
  };

  // Custom Chart Tooltip
  const CustomChartTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="stock-chart-tooltip">
          <p className="tooltip-title">Group: {label}</p>
          <div className="tooltip-row">
            <span className="tooltip-dot available" />
            <span className="tooltip-label">Available:</span>
            <span className="tooltip-value">{data.available_ml?.toLocaleString()} ml</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-dot reserved" />
            <span className="tooltip-label">Reserved:</span>
            <span className="tooltip-value">{data.reserved_ml?.toLocaleString()} ml</span>
          </div>
          <div className="tooltip-row total">
            <span className="tooltip-label">Total Volume:</span>
            <span className="tooltip-value">{data.total_ml?.toLocaleString()} ml</span>
          </div>
          <div className="tooltip-status">
            Status: <span className={`tooltip-tag status-${data.status}`}>{data.status}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="stock-page-container" data-testid="blood-stock-page">
      {/* 1. Page Header */}
      <header className="stock-page-header">
        <div className="header-title-wrapper">
          <div className="header-badge">
            <svg
              className="badge-icon"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <span>Clinical Inventory</span>
          </div>
          <h1 className="page-title">Blood Stock Inventory</h1>
          <p className="page-subtitle">
            Monitor available, reserved, and total blood supply across all blood groups.
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-refresh-stock"
            onClick={handleRefreshClick}
            disabled={loading || isRefreshing}
            title="Refresh Stock Data"
            data-testid="btn-refresh-stock"
          >
            <svg
              className={`refresh-icon ${isRefreshing ? 'spin-refresh' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {/* Feedback Messages */}
      {feedback && (
        <div
          className={`alert-banner ${feedback.type === 'error' ? 'alert-danger' : 'alert-success'}`}
          data-testid="feedback-banner"
          role="status"
        >
          <div className="alert-content">
            <svg className="alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {feedback.type === 'error' ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              )}
            </svg>
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            className="alert-close"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss feedback"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Global Stock Summary Metric Cards */}
      <section className="stock-metrics-section" aria-label="Inventory Metrics Overview">
        {loading && !summary ? (
          <div className="stock-metrics-grid" data-testid="stock-metrics-summary">
            <div className="metric-card skeleton-card">
              <div className="skeleton-icon" />
              <div className="skeleton-lines">
                <div className="skeleton-line sm" />
                <div className="skeleton-line lg" />
                <div className="skeleton-line xs" />
              </div>
            </div>
            <div className="metric-card skeleton-card">
              <div className="skeleton-icon" />
              <div className="skeleton-lines">
                <div className="skeleton-line sm" />
                <div className="skeleton-line lg" />
                <div className="skeleton-line xs" />
              </div>
            </div>
            <div className="metric-card skeleton-card">
              <div className="skeleton-icon" />
              <div className="skeleton-lines">
                <div className="skeleton-line sm" />
                <div className="skeleton-line lg" />
                <div className="skeleton-line xs" />
              </div>
            </div>
          </div>
        ) : (
          <div className="stock-metrics-grid" data-testid="stock-metrics-summary">
            {/* Card 1: Total Available */}
            <div className="metric-card available-card">
              <div className="metric-icon-box available-icon">
                <svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
              </div>
              <div className="metric-info">
                <span className="metric-label">Total Available</span>
                <span className="metric-value available-val-accent" data-testid="total-available-ml">
                  {summary ? `${summary.total_available_ml.toLocaleString()} ml` : '—'}
                </span>
                <span className="metric-subtext">Ready for immediate transfusion.</span>
              </div>
            </div>

            {/* Card 2: Total Reserved */}
            <div className="metric-card reserved-card">
              <div className="metric-icon-box reserved-icon">
                <svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                </svg>
              </div>
              <div className="metric-info">
                <span className="metric-label">Total Reserved</span>
                <span className="metric-value reserved-val-accent" data-testid="total-reserved-ml">
                  {summary ? `${summary.total_reserved_ml.toLocaleString()} ml` : '—'}
                </span>
                <span className="metric-subtext">Allocated to pending requests.</span>
              </div>
            </div>

            {/* Card 3: Total Inventory */}
            <div className="metric-card total-card">
              <div className="metric-icon-box total-icon">
                <svg fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" />
                </svg>
              </div>
              <div className="metric-info">
                <span className="metric-label">Total Inventory</span>
                <span className="metric-value total-val-accent" data-testid="total-inventory-ml">
                  {summary ? `${summary.total_inventory_ml.toLocaleString()} ml` : '—'}
                </span>
                <span className="metric-subtext">Available + Reserved units.</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. Blood Group Status Overview (8 Groups Grid) */}
      <section className="blood-groups-section" aria-label="Blood Group Status Overview">
        <div className="section-title-wrap">
          <div>
            <h2 className="section-title">Blood Group Status Overview</h2>
            <p className="section-desc">
              Real-time clinical reserve levels and availability status across all eight standard blood types.
            </p>
          </div>
        </div>

        {loading && !summary ? (
          <div className="blood-group-cards-grid" data-testid="blood-group-cards">
            {ALL_BLOOD_GROUPS.map((g) => (
              <div key={g} className="blood-card skeleton-card">
                <div className="skeleton-card-header">
                  <div className="skeleton-badge" />
                  <div className="skeleton-pill" />
                </div>
                <div className="skeleton-card-body">
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                  <div className="skeleton-bar" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="blood-group-cards-grid" data-testid="blood-group-cards">
            {(
              summary?.stock_by_group ||
              ALL_BLOOD_GROUPS.map((g) => ({
                blood_group: g,
                available_ml: 0,
                reserved_ml: 0,
                total_ml: 0,
                status: 'critical',
              }))
            ).map((groupStock) => {
              // Calculate progress bar percentage safely
              const percent = Math.min(
                100,
                Math.round((groupStock.available_ml / MAX_CAPACITY_TARGET_ML) * 100)
              );

              return (
                <div
                  key={groupStock.blood_group}
                  className={`blood-card status-${(groupStock.status || 'critical').toLowerCase()}`}
                  data-testid={`blood-card-${groupStock.blood_group}`}
                >
                  <div className="blood-card-top">
                    <div className="blood-badge-wrap">
                      <span className="blood-type-badge">{groupStock.blood_group}</span>
                      <div className="blood-type-label">Blood Type</div>
                    </div>
                    {getStatusBadge(groupStock.status)}
                  </div>

                  {/* Progress Bar for Stock Level */}
                  <div className="stock-level-bar-container">
                    <div className="stock-level-bar-header">
                      <span className="level-label">Stock Level</span>
                      <span className="level-percentage">{percent}% Target</span>
                    </div>
                    <div className="stock-progress-track">
                      <div
                        className={`stock-progress-fill fill-${(groupStock.status || 'critical').toLowerCase()}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="blood-card-body">
                    <div className="blood-card-stat">
                      <span className="stat-label">Available:</span>
                      <strong className="stat-val available-val">
                        {groupStock.available_ml.toLocaleString()} ml
                      </strong>
                    </div>
                    <div className="blood-card-stat">
                      <span className="stat-label">Reserved:</span>
                      <span className="stat-val reserved-val">
                        {groupStock.reserved_ml.toLocaleString()} ml
                      </span>
                    </div>
                    <div className="blood-card-divider" />
                    <div className="blood-card-stat total-stat">
                      <span className="stat-label">Total Volume:</span>
                      <span className="stat-val total-val">
                        {groupStock.total_ml.toLocaleString()} ml
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Blood Stock Visualization (Recharts Bar Chart) */}
      <section className="stock-chart-section" aria-label="Inventory Analytics Visualization">
        <div className="chart-header">
          <div>
            <h2 className="section-title">Blood Stock Supply Visualization</h2>
            <p className="section-desc">
              Comparative distribution of immediately available inventory (ml) by blood group.
            </p>
          </div>
          <div className="chart-legend-custom">
            <span className="legend-item">
              <span className="legend-color legend-good" /> Good / Sufficient
            </span>
            <span className="legend-item">
              <span className="legend-color legend-normal" /> Normal
            </span>
            <span className="legend-item">
              <span className="legend-color legend-low" /> Low Stock
            </span>
            <span className="legend-item">
              <span className="legend-color legend-critical" /> Critical
            </span>
          </div>
        </div>

        <div className="chart-wrapper" data-testid="blood-stock-chart-container">
          {loading && !summary ? (
            <div className="chart-loading-placeholder">
              <span className="spinner" />
              <span>Generating inventory visualization...</span>
            </div>
          ) : chartData.length === 0 ? (
            <div className="chart-empty-placeholder">
              <p>No inventory visualization data available.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="blood_group"
                  tick={{ fill: '#475569', fontSize: 13, fontWeight: 600 }}
                  axisLine={{ stroke: '#CBD5E1' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  unit=" ml"
                  tickFormatter={(val) => `${val}`}
                />
                <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(241, 245, 249, 0.6)' }} />
                <Bar
                  dataKey="available_ml"
                  name="Available Volume"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry.status)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* 5. Detailed Inventory Table Section */}
      <section className="inventory-table-section" aria-label="Inventory Records & Management">
        <div className="section-header">
          <div>
            <h2 className="section-title">Inventory Records & Management</h2>
            <p className="section-desc">
              Filter, sort, and calibrate operational stock volumes for clinical operations.
            </p>
          </div>
          <span className="items-count-badge">
            {totalItems} {totalItems === 1 ? 'Record' : 'Records'}
          </span>
        </div>

        {/* Filter and Controls Toolbar */}
        <div className="table-controls-bar" data-testid="table-controls">
          <div className="controls-group">
            <div className="filter-item">
              <label htmlFor="group-filter">Blood Group</label>
              <select
                id="group-filter"
                value={selectedGroup}
                onChange={(e) => {
                  setSelectedGroup(e.target.value);
                  setPage(1);
                }}
                data-testid="filter-blood-group"
              >
                <option value="all">All Blood Groups</option>
                {ALL_BLOOD_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-item">
              <label htmlFor="min-qty">Min Available (ml)</label>
              <input
                id="min-qty"
                type="number"
                min="0"
                placeholder="e.g. 500"
                value={minQty}
                onChange={(e) => {
                  setMinQty(e.target.value);
                  setPage(1);
                }}
                data-testid="filter-min-qty"
              />
            </div>

            <div className="filter-item">
              <label htmlFor="max-qty">Max Available (ml)</label>
              <input
                id="max-qty"
                type="number"
                min="0"
                placeholder="e.g. 5000"
                value={maxQty}
                onChange={(e) => {
                  setMaxQty(e.target.value);
                  setPage(1);
                }}
                data-testid="filter-max-qty"
              />
            </div>
          </div>

          <div className="controls-group">
            <div className="filter-item">
              <label htmlFor="sort-by">Sort By</label>
              <select
                id="sort-by"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                data-testid="select-sort-by"
              >
                <option value="blood_group">Blood Group</option>
                <option value="available_quantity_ml">Available Volume</option>
                <option value="reserved_quantity_ml">Reserved Volume</option>
                <option value="updated_at">Last Updated</option>
              </select>
            </div>

            <div className="filter-item">
              <label htmlFor="sort-order">Order</label>
              <select
                id="sort-order"
                value={sortOrder}
                onChange={(e) => {
                  setSortOrder(e.target.value);
                  setPage(1);
                }}
                data-testid="select-sort-order"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>
        </div>

        {/* Loading / Error / Content */}
        {loading && stockItems.length === 0 ? (
          <div className="state-container loading-state" data-testid="stock-loading">
            <span className="spinner" />
            <p>Loading blood stock data...</p>
          </div>
        ) : error ? (
          <div className="state-container error-state" data-testid="stock-error">
            <div className="state-icon-box error-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3>Unable to Load Inventory</h3>
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-secondary-retry"
              onClick={() => fetchStockList(true)}
            >
              🔄 Retry Request
            </button>
          </div>
        ) : stockItems.length === 0 ? (
          <div className="state-container empty-state" data-testid="stock-empty">
            <div className="state-icon-box empty-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3>No Blood Stock Found</h3>
            <p>No inventory records match the selected filter criteria.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="stock-table" data-testid="stock-table">
              <thead>
                <tr>
                  <th>Blood Group</th>
                  <th>Available Volume</th>
                  <th>Reserved Volume</th>
                  <th>Total Volume</th>
                  <th>Clinical Status</th>
                  <th>Last Updated</th>
                  {isStaffOrAdmin && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {stockItems.map((item) => {
                  const derivedStatus = deriveStatusFromAvailable(item.available_quantity_ml);
                  return (
                    <tr key={item.id} data-testid={`stock-row-${item.blood_group}`}>
                      <td>
                        <span className="group-badge" data-testid={`group-badge-${item.blood_group}`}>
                          {item.blood_group}
                        </span>
                      </td>
                      <td className="volume-cell available-text">
                        <strong>{item.available_quantity_ml.toLocaleString()} ml</strong>
                      </td>
                      <td className="volume-cell reserved-text">
                        {item.reserved_quantity_ml.toLocaleString()} ml
                      </td>
                      <td className="volume-cell total-text">
                        <strong>{item.total_quantity_ml.toLocaleString()} ml</strong>
                      </td>
                      <td>{getStatusBadge(derivedStatus)}</td>
                      <td className="date-cell">{formatDate(item.updated_at)}</td>
                      {isStaffOrAdmin && (
                        <td className="text-right actions-cell">
                          <button
                            type="button"
                            className="btn btn-action-edit"
                            onClick={() => handleOpenAdjust(item)}
                            title={`Calibrate stock for ${item.blood_group}`}
                            data-testid={`btn-adjust-${item.blood_group}`}
                          >
                            <svg className="action-btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            <span>Adjust</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && totalPages > 1 && (
          <div className="pagination-bar" data-testid="stock-pagination">
            <button
              type="button"
              className="btn btn-secondary pagination-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              data-testid="pagination-prev"
            >
              Previous
            </button>
            <span className="pagination-info" data-testid="pagination-info">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary pagination-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              data-testid="pagination-next"
            >
              Next
            </button>
          </div>
        )}
      </section>

      {/* Adjust Modal (Admin/Staff only) */}
      {isStaffOrAdmin && (
        <StockAdjustmentModal
          isOpen={isAdjustModalOpen}
          onClose={handleCloseAdjust}
          stock={selectedStockForAdjust}
          onSubmit={handleSubmitAdjust}
          isSubmitting={isSubmittingAdjust}
        />
      )}
    </div>
  );
};

export default BloodStock;
