import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import donorService, { BLOOD_GROUPS, GENDERS } from '../services/donorService';
import { DonorFormModal } from '../components/donors/DonorFormModal';
import { DonorDetailModal } from '../components/donors/DonorDetailModal';
import { DeleteConfirmModal } from '../components/donors/DeleteConfirmModal';
import './Donors.css';

export const Donors = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isStaffOrAdmin = user?.role === 'staff' || user?.role === 'admin';

  // List state
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Pagination & Advanced Filtering state
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState('');
  const [bloodGroup, setBloodGroup] = useState('all');
  const [gender, setGender] = useState('all');
  const [accountStatus, setAccountStatus] = useState('all'); // 'all' | 'active' | 'inactive'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Modal dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedDonorForEdit, setSelectedDonorForEdit] = useState(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDonorForDetail, setSelectedDonorForDetail] = useState(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedDonorForDelete, setSelectedDonorForDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk Selection & Batch Operations State
  const [selectedDonorIds, setSelectedDonorIds] = useState([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState(null); // 'activate' | 'deactivate' | 'delete'
  const [isBulkExecuting, setIsBulkExecuting] = useState(false);

  // Load donors from backend
  const fetchDonors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        page_size: pageSize,
        search,
        blood_group: bloodGroup,
        gender,
      };

      if (accountStatus === 'active') params.is_active = true;
      if (accountStatus === 'inactive') params.is_active = false;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const data = await donorService.getDonors(params);

      setDonors(data.items || []);
      setTotalPages(data.total_pages || 1);
      setTotalItems(data.total || 0);
      setSelectedDonorIds([]); // Clear selection when data refreshes
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to load donors list';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, bloodGroup, gender, accountStatus, startDate, endDate]);

  useEffect(() => {
    fetchDonors();
  }, [fetchDonors]);

  // Handle Form Submission (Create or Update)
  const handleFormSubmit = async (payload) => {
    setIsSubmittingForm(true);
    setFeedback(null);
    try {
      if (selectedDonorForEdit) {
        await donorService.updateDonor(selectedDonorForEdit.id, payload);
        setFeedback({ type: 'success', message: 'Donor profile updated successfully!' });
      } else {
        await donorService.createDonor(payload);
        setFeedback({ type: 'success', message: 'Donor registered successfully!' });
      }
      setIsFormOpen(false);
      setSelectedDonorForEdit(null);
      fetchDonors();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to save donor profile';
      setFeedback({ type: 'error', message });
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Handle Delete Confirmation
  const handleDeleteConfirm = async () => {
    if (!selectedDonorForDelete) return;
    setIsDeleting(true);
    setFeedback(null);
    try {
      await donorService.deleteDonor(selectedDonorForDelete.id);
      setFeedback({ type: 'success', message: 'Donor deleted successfully!' });
      setIsDeleteOpen(false);
      setSelectedDonorForDelete(null);
      fetchDonors();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to delete donor profile';
      setFeedback({ type: 'error', message });
    } finally {
      setIsDeleting(false);
    }
  };

  // Bulk Selection Handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = donors.map((d) => d.id);
      setSelectedDonorIds(allIds);
    } else {
      setSelectedDonorIds([]);
    }
  };

  const handleToggleSelectOne = (id) => {
    setSelectedDonorIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleOpenBulkAction = (action) => {
    setBulkActionType(action);
    setIsBulkModalOpen(true);
  };

  // Clear all filters
  const handleClearFilters = () => {
    setSearch('');
    setBloodGroup('all');
    setGender('all');
    setAccountStatus('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  // Export Filtered Donors to CSV (Staff/Admin)
  const handleExportCSV = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setFeedback(null);
    try {
      const params = {
        search,
        blood_group: bloodGroup,
        gender,
      };
      if (accountStatus === 'active') params.is_active = true;
      if (accountStatus === 'inactive') params.is_active = false;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const blobData = await donorService.exportDonorsCSV(params);

      // Trigger browser download
      const blob = new Blob([blobData], { type: 'text/csv;charset=utf-8;' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `donors_filtered_export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setFeedback({ type: 'success', message: 'Donor CSV export downloaded successfully.' });
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to export donors CSV.';
      setFeedback({ type: 'error', message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleBulkConfirm = async () => {
    if (!bulkActionType || selectedDonorIds.length === 0) return;
    setIsBulkExecuting(true);
    setFeedback(null);
    try {
      const result = await donorService.bulkDonorAction(bulkActionType, selectedDonorIds);
      setFeedback({
        type: 'success',
        message: result.message || `Successfully completed bulk ${bulkActionType}.`,
      });
      setIsBulkModalOpen(false);
      setSelectedDonorIds([]);
      fetchDonors();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        `Bulk ${bulkActionType} failed. Please try again.`;
      setFeedback({ type: 'error', message });
    } finally {
      setIsBulkExecuting(false);
    }
  };

  // Open modals
  const handleOpenAdd = () => {
    setSelectedDonorForEdit(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (donor) => {
    setSelectedDonorForEdit(donor);
    setIsFormOpen(true);
  };

  const handleOpenDetail = (donor) => {
    setSelectedDonorForDetail(donor);
    setIsDetailOpen(true);
  };

  const handleOpenDelete = (donor) => {
    setSelectedDonorForDelete(donor);
    setIsDeleteOpen(true);
  };

  return (
    <div className="donors-page" data-testid="donors-page">
      <div className="donors-header">
        <div className="donors-title-group">
          <h1>Donor Management</h1>
          <p>Register, inspect, and manage blood donor profiles</p>
        </div>

        <div className="donors-header-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {isStaffOrAdmin && (
            <button
              className="btn-secondary"
              onClick={handleExportCSV}
              disabled={isExporting}
              data-testid="export-donors-csv-btn"
              title="Export currently filtered donors to CSV"
            >
              <span>{isExporting ? '⏳' : '📥'}</span>
              <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>
          )}

          <button
            className="btn-primary"
            onClick={handleOpenAdd}
            data-testid="add-donor-btn"
          >
            <span>➕</span>
            <span>Add Donor</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`donors-feedback-banner ${feedback.type}`}
          role="status"
          data-testid="feedback-banner"
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="donors-filter-card">
        <div className="search-input-wrapper">
          <input
            type="text"
            className="form-input"
            placeholder="Search by name, email, phone, or address..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            data-testid="donor-search-input"
          />
        </div>

        <select
          className="filter-select"
          value={bloodGroup}
          onChange={(e) => {
            setBloodGroup(e.target.value);
            setPage(1);
          }}
          data-testid="blood-group-filter"
        >
          <option value="all">All Blood Groups</option>
          {BLOOD_GROUPS.map((bg) => (
            <option key={bg} value={bg}>
              {bg}
            </option>
          ))}
        </select>

        <select
          className="filter-select"
          value={gender}
          onChange={(e) => {
            setGender(e.target.value);
            setPage(1);
          }}
          data-testid="gender-filter"
        >
          <option value="all">All Genders</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </option>
          ))}
        </select>

        <select
          className="filter-select"
          value={accountStatus}
          onChange={(e) => {
            setAccountStatus(e.target.value);
            setPage(1);
          }}
          data-testid="account-status-filter"
          aria-label="Filter by account status"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>

        <div className="date-filter-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="date"
            className="filter-date-input"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            placeholder="From Date"
            data-testid="filter-start-date"
            title="Registered From Date"
          />
          <span style={{ color: 'var(--color-text-muted)' }}>–</span>
          <input
            type="date"
            className="filter-date-input"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            placeholder="To Date"
            data-testid="filter-end-date"
            title="Registered To Date"
          />
        </div>

        {(search || bloodGroup !== 'all' || gender !== 'all' || accountStatus !== 'all' || startDate || endDate) && (
          <button
            type="button"
            className="btn-clear-filters"
            onClick={handleClearFilters}
            data-testid="clear-filters-btn"
            title="Reset all filters"
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Bulk Action Toolbar for Staff / Admin */}
      {isStaffOrAdmin && selectedDonorIds.length > 0 && (
        <div className="bulk-actions-toolbar" data-testid="bulk-actions-toolbar">
          <div className="bulk-selection-count">
            <span className="count-badge">{selectedDonorIds.length}</span>
            <span>{selectedDonorIds.length} donor{selectedDonorIds.length > 1 ? 's' : ''} selected</span>
          </div>

          <div className="bulk-actions-group">
            <button
              className="btn-bulk-activate"
              onClick={() => handleOpenBulkAction('activate')}
              data-testid="bulk-activate-btn"
            >
              <span>✅</span> Activate
            </button>

            <button
              className="btn-bulk-deactivate"
              onClick={() => handleOpenBulkAction('deactivate')}
              data-testid="bulk-deactivate-btn"
            >
              <span>⏸️</span> Deactivate
            </button>

            {isAdmin && (
              <button
                className="btn-bulk-delete"
                onClick={() => handleOpenBulkAction('delete')}
                data-testid="bulk-delete-btn"
              >
                <span>🗑️</span> Delete
              </button>
            )}

            <button
              className="btn-bulk-clear"
              onClick={() => setSelectedDonorIds([])}
              data-testid="bulk-clear-btn"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table Section */}
      <div className="donors-table-card">
        {loading ? (
          <div className="loading-state" data-testid="donors-loading">
            <div className="loading-state-icon">⏳</div>
            <p>Loading donors list...</p>
          </div>
        ) : error ? (
          <div className="empty-state" data-testid="donors-error">
            <div className="empty-state-icon">⚠️</div>
            <p style={{ color: '#dc2626', fontWeight: 600 }}>{error}</p>
            <button className="btn-secondary" onClick={fetchDonors}>
              Retry
            </button>
          </div>
        ) : donors.length === 0 ? (
          <div className="empty-state" data-testid="donors-empty">
            <div className="empty-state-icon">👤</div>
            <p style={{ fontWeight: 600 }}>No donor records found</p>
            <p style={{ fontSize: '0.85rem' }}>Try adjusting your search criteria or register a new donor.</p>
          </div>
        ) : (
          <>
            <table className="donors-table" data-testid="donors-table">
              <thead>
                <tr>
                  {isStaffOrAdmin && (
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label="Select all donors on current page"
                        checked={
                          donors.length > 0 &&
                          donors.every((d) => selectedDonorIds.includes(d.id))
                        }
                        onChange={handleSelectAll}
                        data-testid="select-all-checkbox"
                      />
                    </th>
                  )}
                  <th>ID</th>
                  <th>Full Name</th>
                  <th>Blood Group</th>
                  <th>Gender</th>
                  <th>Age</th>
                  <th>Phone</th>
                  <th>Last Donation</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {donors.map((donor) => {
                  const isSelected = selectedDonorIds.includes(donor.id);
                  return (
                    <tr
                      key={donor.id}
                      data-testid={`donor-row-${donor.id}`}
                      className={isSelected ? 'row-selected' : ''}
                    >
                      {isStaffOrAdmin && (
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            aria-label={`Select donor ${donor.full_name || donor.id}`}
                            checked={isSelected}
                            onChange={() => handleToggleSelectOne(donor.id)}
                            data-testid={`select-donor-${donor.id}`}
                          />
                        </td>
                      )}
                      <td>#{donor.id}</td>
                      <td style={{ fontWeight: 600 }}>{donor.full_name || 'Anonymous Donor'}</td>
                      <td>
                        <span className="blood-badge">{donor.blood_group}</span>
                      </td>
                      <td>{donor.gender ? donor.gender.charAt(0).toUpperCase() + donor.gender.slice(1) : '—'}</td>
                      <td>{donor.age} yrs</td>
                      <td>{donor.phone || '—'}</td>
                      <td>{donor.last_donation_date || '—'}</td>
                      <td>
                        <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                          <button
                            className="btn-action-view"
                            onClick={() => handleOpenDetail(donor)}
                            data-testid={`view-donor-${donor.id}`}
                          >
                            View
                          </button>

                          {(isStaffOrAdmin || donor.user_id === user?.id) && (
                            <button
                              className="btn-action-edit"
                              onClick={() => handleOpenEdit(donor)}
                              data-testid={`edit-donor-${donor.id}`}
                            >
                              Edit
                            </button>
                          )}

                          {isAdmin && (
                            <button
                              className="btn-action-delete"
                              onClick={() => handleOpenDelete(donor)}
                              data-testid={`delete-donor-${donor.id}`}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="pagination-bar" data-testid="pagination-bar">
              <span>
                Showing {donors.length} of {totalItems} donors (Page {page} of {totalPages})
              </span>
              <div className="pagination-controls">
                <button
                  className="page-btn"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={page <= 1}
                  data-testid="prev-page-btn"
                >
                  Previous
                </button>
                <button
                  className="page-btn"
                  onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={page >= totalPages}
                  data-testid="next-page-btn"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      <DonorFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
        donor={selectedDonorForEdit}
        isSubmitting={isSubmittingForm}
      />

      <DonorDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        donor={selectedDonorForDetail}
      />

      <DeleteConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDeleteConfirm}
        donor={selectedDonorForDelete}
        isDeleting={isDeleting}
      />

      {/* Bulk Action Confirmation Modal */}
      {isBulkModalOpen && (
        <div className="modal-backdrop" data-testid="bulk-confirm-modal">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">
                {bulkActionType === 'delete'
                  ? 'Confirm Bulk Deletion'
                  : bulkActionType === 'activate'
                  ? 'Confirm Bulk Activation'
                  : 'Confirm Bulk Deactivation'}
              </h2>
              <button
                className="modal-close-btn"
                onClick={() => setIsBulkModalOpen(false)}
                aria-label="Close modal"
                disabled={isBulkExecuting}
              >
                ✕
              </button>
            </div>

            <div className="modal-body confirm-delete-box">
              <div className="confirm-warning-icon">
                {bulkActionType === 'delete' ? '⚠️' : bulkActionType === 'activate' ? '✅' : '⏸️'}
              </div>
              <p className="confirm-text">
                Are you sure you want to <strong>{bulkActionType}</strong> {selectedDonorIds.length} selected donor
                {selectedDonorIds.length > 1 ? 's' : ''}?
              </p>
              {bulkActionType === 'delete' && (
                <p className="confirm-text" style={{ fontSize: '0.85rem', color: '#991b1b' }}>
                  This will permanently delete the selected donor profiles. Donors with existing donation records cannot be deleted.
                </p>
              )}
              {bulkActionType !== 'delete' && (
                <p className="confirm-text" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  This will set the donor accounts to {bulkActionType === 'activate' ? 'active' : 'inactive'} status.
                </p>
              )}

              <div className="modal-actions" style={{ justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsBulkModalOpen(false)}
                  disabled={isBulkExecuting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={bulkActionType === 'delete' ? 'btn-danger' : 'btn-primary'}
                  onClick={handleBulkConfirm}
                  disabled={isBulkExecuting}
                  data-testid="confirm-bulk-action-btn"
                >
                  {isBulkExecuting
                    ? 'Processing...'
                    : `Confirm ${bulkActionType ? bulkActionType.charAt(0).toUpperCase() + bulkActionType.slice(1) : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Donors;
