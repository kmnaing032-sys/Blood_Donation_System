import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import donationService, { DONATION_STATUSES } from '../services/donationService';
import { BLOOD_GROUPS } from '../services/donorService';
import { DonationFormModal } from '../components/donations/DonationFormModal';
import { DonationDetailModal } from '../components/donations/DonationDetailModal';
import { DeleteDonationConfirmModal } from '../components/donations/DeleteDonationConfirmModal';
import './Donors.css';
import '../components/donations/DonationModals.css';

export const Donations = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isStaffOrAdmin = user?.role === 'staff' || user?.role === 'admin';

  // List state
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Pagination & Filtering state
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState('');
  const [bloodGroup, setBloodGroup] = useState('all');
  const [status, setStatus] = useState('all');

  // Modal dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedDonationForEdit, setSelectedDonationForEdit] = useState(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDonationForDetail, setSelectedDonationForDetail] = useState(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedDonationForDelete, setSelectedDonationForDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load donations from backend
  const fetchDonations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await donationService.getDonations({
        page,
        page_size: pageSize,
        search,
        blood_group: bloodGroup,
        status,
      });

      setDonations(data.items || []);
      setTotalPages(data.total_pages || 1);
      setTotalItems(data.total || 0);
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to load donations list';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, bloodGroup, status]);

  useEffect(() => {
    fetchDonations();
  }, [fetchDonations]);

  // Handle Form Submission (Create or Update)
  const handleFormSubmit = async (payload) => {
    setIsSubmittingForm(true);
    setFeedback(null);
    try {
      if (selectedDonationForEdit) {
        await donationService.updateDonation(selectedDonationForEdit.id, payload);
        setFeedback({ type: 'success', message: 'Donation record updated successfully!' });
      } else {
        await donationService.createDonation(payload);
        setFeedback({ type: 'success', message: 'Blood donation recorded successfully!' });
      }
      setIsFormOpen(false);
      setSelectedDonationForEdit(null);
      fetchDonations();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to save donation record';
      setFeedback({ type: 'error', message });
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Handle Delete Confirmation
  const handleDeleteConfirm = async () => {
    if (!selectedDonationForDelete) return;
    setIsDeleting(true);
    setFeedback(null);
    try {
      await donationService.deleteDonation(selectedDonationForDelete.id);
      setFeedback({ type: 'success', message: 'Donation record deleted and stock reconciled!' });
      setIsDeleteOpen(false);
      setSelectedDonationForDelete(null);
      fetchDonations();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to delete donation record';
      setFeedback({ type: 'error', message });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="donors-page" data-testid="donations-page">
      <div className="donors-header">
        <div className="donors-title-group">
          <h1>Blood Donation Management</h1>
          <p>Record, inspect, and monitor whole blood donations</p>
        </div>

        <button
          className="btn-primary"
          onClick={() => {
            setSelectedDonationForEdit(null);
            setIsFormOpen(true);
          }}
          data-testid="add-donation-btn"
        >
          <span>➕</span>
          <span>Record Donation</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`donors-feedback-banner ${feedback.type}`}
          role="status"
          data-testid="donation-feedback-banner"
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
            placeholder="Search by donor name or notes..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            data-testid="donation-search-input"
          />
        </div>

        <select
          className="filter-select"
          value={bloodGroup}
          onChange={(e) => {
            setBloodGroup(e.target.value);
            setPage(1);
          }}
          data-testid="donation-blood-group-filter"
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
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          data-testid="donation-status-filter"
        >
          <option value="all">All Statuses</option>
          {DONATION_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st.charAt(0).toUpperCase() + st.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Donations Table */}
      <div className="donors-table-card">
        {loading ? (
          <div className="loading-state" data-testid="donations-loading">
            <div className="loading-state-icon">⏳</div>
            <p>Loading donations list...</p>
          </div>
        ) : error ? (
          <div className="empty-state" data-testid="donations-error">
            <div className="empty-state-icon">⚠️</div>
            <p style={{ color: '#dc2626', fontWeight: 600 }}>{error}</p>
            <button className="btn-secondary" onClick={fetchDonations}>
              Retry
            </button>
          </div>
        ) : donations.length === 0 ? (
          <div className="empty-state" data-testid="donations-empty">
            <div className="empty-state-icon">🩸</div>
            <p style={{ fontWeight: 600 }}>No donation records found</p>
            <p style={{ fontSize: '0.85rem' }}>Try adjusting your search criteria or record a new donation.</p>
          </div>
        ) : (
          <>
            <table className="donors-table" data-testid="donations-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Donor</th>
                  <th>Blood Group</th>
                  <th>Quantity</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {donations.map((d) => (
                  <tr key={d.id} data-testid={`donation-row-${d.id}`}>
                    <td>#{d.id}</td>
                    <td style={{ fontWeight: 600 }}>
                      {d.donor_name || `Donor #${d.donor_id}`}
                    </td>
                    <td>
                      <span className="blood-badge">{d.blood_group}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{d.quantity_ml} ml</td>
                    <td>{d.donation_date}</td>
                    <td>
                      <span className={`status-badge ${d.status}`}>{d.status}</span>
                    </td>
                    <td>
                      <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="btn-action-view"
                          onClick={() => {
                            setSelectedDonationForDetail(d);
                            setIsDetailOpen(true);
                          }}
                          data-testid={`view-donation-${d.id}`}
                        >
                          View
                        </button>

                        {isStaffOrAdmin && (
                          <button
                            className="btn-action-edit"
                            onClick={() => {
                              setSelectedDonationForEdit(d);
                              setIsFormOpen(true);
                            }}
                            data-testid={`edit-donation-${d.id}`}
                          >
                            Edit
                          </button>
                        )}

                        {isAdmin && (
                          <button
                            className="btn-action-delete"
                            onClick={() => {
                              setSelectedDonationForDelete(d);
                              setIsDeleteOpen(true);
                            }}
                            data-testid={`delete-donation-${d.id}`}
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

            {/* Pagination Controls */}
            <div className="pagination-bar" data-testid="pagination-bar">
              <span>
                Showing {donations.length} of {totalItems} donations (Page {page} of {totalPages})
              </span>
              <div className="pagination-controls">
                <button
                  className="page-btn"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={page <= 1}
                  data-testid="prev-donation-page-btn"
                >
                  Previous
                </button>
                <button
                  className="page-btn"
                  onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={page >= totalPages}
                  data-testid="next-donation-page-btn"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      <DonationFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
        donation={selectedDonationForEdit}
        isSubmitting={isSubmittingForm}
      />

      <DonationDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        donation={selectedDonationForDetail}
      />

      <DeleteDonationConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDeleteConfirm}
        donation={selectedDonationForDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
};

export default Donations;
