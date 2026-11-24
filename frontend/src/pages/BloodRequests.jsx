import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import bloodRequestService, {
  REQUEST_STATUSES,
  REQUEST_URGENCIES,
} from '../services/bloodRequestService';
import { RequestFormModal } from '../components/bloodRequests/RequestFormModal';
import { RequestDetailModal } from '../components/bloodRequests/RequestDetailModal';
import { RequestStatusModal } from '../components/bloodRequests/RequestStatusModal';
import './BloodRequests.css';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const BloodRequests = () => {
  const { user } = useAuth();
  const isStaffOrAdmin = user?.role === 'admin' || user?.role === 'staff';

  // Request list state
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Filters, search & pagination state
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState('');
  const [bloodGroup, setBloodGroup] = useState('all');
  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Modal dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedForEdit, setSelectedForEdit] = useState(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedForDetail, setSelectedForDetail] = useState(null);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedForStatusAction, setSelectedForStatusAction] = useState(null);
  const [statusActionType, setStatusActionType] = useState(null);
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);

  // Load blood requests
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await bloodRequestService.getBloodRequests({
        page,
        page_size: pageSize,
        search,
        blood_group: bloodGroup,
        status,
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      setRequests(data.items || []);
      setTotalPages(data.total_pages || 1);
      setTotalItems(data.total || 0);
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to load blood requests';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, bloodGroup, status, sortBy, sortOrder]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Handle Form Submission (Create or Edit pending)
  const handleFormSubmit = async (payload) => {
    setIsSubmittingForm(true);
    setFeedback(null);
    try {
      if (selectedForEdit) {
        await bloodRequestService.updateBloodRequest(selectedForEdit.id, payload);
        setFeedback({
          type: 'success',
          message: `Blood request for ${payload.patient_name} updated successfully.`,
        });
      } else {
        await bloodRequestService.createBloodRequest(payload);
        setFeedback({
          type: 'success',
          message: `Blood request for ${payload.patient_name} submitted successfully.`,
        });
      }
      setIsFormOpen(false);
      setSelectedForEdit(null);
      fetchRequests();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to save blood request';
      setFeedback({ type: 'error', message });
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Open Status Transition Modal
  const handleOpenStatusModal = (req, action) => {
    setSelectedForStatusAction(req);
    setStatusActionType(action);
    setIsStatusModalOpen(true);
  };

  // Handle Status Action Submission
  const handleStatusActionSubmit = async (action, notes) => {
    if (!selectedForStatusAction) return;
    setIsSubmittingStatus(true);
    setFeedback(null);
    try {
      if (action === 'approve') {
        await bloodRequestService.approveBloodRequest(selectedForStatusAction.id, notes);
        setFeedback({
          type: 'success',
          message: `Request #${selectedForStatusAction.id} approved successfully.`,
        });
      } else if (action === 'reject') {
        await bloodRequestService.rejectBloodRequest(selectedForStatusAction.id, notes);
        setFeedback({
          type: 'success',
          message: `Request #${selectedForStatusAction.id} rejected.`,
        });
      } else if (action === 'fulfill') {
        await bloodRequestService.fulfillBloodRequest(selectedForStatusAction.id, notes);
        setFeedback({
          type: 'success',
          message: `Request #${selectedForStatusAction.id} fulfilled and stock deducted.`,
        });
      } else if (action === 'cancel') {
        await bloodRequestService.cancelBloodRequest(selectedForStatusAction.id, notes);
        setFeedback({
          type: 'success',
          message: `Request #${selectedForStatusAction.id} cancelled.`,
        });
      }

      setIsStatusModalOpen(false);
      setSelectedForStatusAction(null);
      setStatusActionType(null);
      fetchRequests();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        `Failed to ${action} request`;
      setFeedback({ type: 'error', message });
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  // View details
  const handleOpenDetail = (req) => {
    setSelectedForDetail(req);
    setIsDetailOpen(true);
  };

  // Edit pending request
  const handleOpenEdit = (req) => {
    setSelectedForEdit(req);
    setIsFormOpen(true);
  };

  // Helper formatting
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const getUrgencyBadge = (urgency) => {
    const u = (urgency || 'normal').toLowerCase();
    return <span className={`badge-urgency urgency-${u}`}>{u.toUpperCase()}</span>;
  };

  const getStatusBadge = (s) => {
    const st = (s || 'pending').toLowerCase();
    return <span className={`status-badge status-${st}`}>{st.toUpperCase()}</span>;
  };

  // Permission check for modifying / cancelling
  const canEdit = (req) => {
    if (req.status !== 'pending') return false;
    return isStaffOrAdmin || req.user_id === user?.id;
  };

  const canCancel = (req) => {
    if (req.status !== 'pending' && req.status !== 'approved') return false;
    return isStaffOrAdmin || req.user_id === user?.id;
  };

  return (
    <div className="requests-page-container" data-testid="blood-requests-page">
      {/* Header */}
      <div className="requests-header">
        <div>
          <h1 className="page-title">Blood Requests</h1>
          <p className="page-subtitle">
            Manage, approve, and track emergency and routine clinical blood requests.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setSelectedForEdit(null);
              setIsFormOpen(true);
            }}
            data-testid="btn-create-request"
          >
            + Request Blood
          </button>
        </div>
      </div>

      {/* Dismissible Feedback Banner */}
      {feedback && (
        <div
          className={`alert-banner ${feedback.type === 'error' ? 'alert-danger' : 'alert-success'}`}
          data-testid="feedback-banner"
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            className="alert-close"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="table-controls-bar" data-testid="requests-controls">
        <div className="controls-group search-box">
          <input
            type="text"
            placeholder="Search patient, hospital, or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            data-testid="input-search"
          />
        </div>

        <div className="controls-group">
          <div className="filter-item">
            <label htmlFor="filter-group">Blood Group:</label>
            <select
              id="filter-group"
              value={bloodGroup}
              onChange={(e) => {
                setBloodGroup(e.target.value);
                setPage(1);
              }}
              data-testid="select-filter-group"
            >
              <option value="all">All Groups</option>
              {BLOOD_GROUPS.map((bg) => (
                <option key={bg} value={bg}>
                  {bg}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label htmlFor="filter-status">Status:</label>
            <select
              id="filter-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              data-testid="select-filter-status"
            >
              <option value="all">All Statuses</option>
              {REQUEST_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label htmlFor="filter-sort">Sort:</label>
            <select
              id="filter-sort"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              data-testid="select-sort-by"
            >
              <option value="created_at">Submission Date</option>
              <option value="quantity_ml">Quantity</option>
              <option value="patient_name">Patient Name</option>
              <option value="urgency">Urgency</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Content Section */}
      <div className="requests-table-section">
        {loading ? (
          <div className="state-container loading-state" data-testid="requests-loading">
            <span className="spinner" />
            <p>Loading blood requests...</p>
          </div>
        ) : error ? (
          <div className="state-container error-state" data-testid="requests-error">
            <span className="state-icon">⚠️</span>
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={fetchRequests}
            >
              Retry
            </button>
          </div>
        ) : requests.length === 0 ? (
          <div className="state-container empty-state" data-testid="requests-empty">
            <span className="state-icon">📋</span>
            <h3>No Blood Requests Found</h3>
            <p>There are no blood requests matching your search or filters.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="requests-table" data-testid="requests-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Patient Name</th>
                  <th>Hospital</th>
                  <th>Blood Group</th>
                  <th>Quantity</th>
                  <th>Urgency</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id} data-testid={`request-row-${req.id}`}>
                    <td className="id-cell">#{req.id}</td>
                    <td className="patient-name-cell">
                      <strong>{req.patient_name}</strong>
                    </td>
                    <td className="hospital-cell">{req.hospital_name}</td>
                    <td>
                      <span className="group-badge" data-testid={`badge-group-${req.id}`}>
                        {req.blood_group}
                      </span>
                    </td>
                    <td className="volume-cell" data-testid={`cell-quantity-${req.id}`}>
                      <strong>{req.quantity_ml} ml</strong>
                    </td>
                    <td>{getUrgencyBadge(req.urgency)}</td>
                    <td>{getStatusBadge(req.status)}</td>
                    <td className="date-cell">{formatDate(req.created_at)}</td>
                    <td className="text-right actions-cell">
                      {/* View Action */}
                      <button
                        type="button"
                        className="btn-action-icon"
                        onClick={() => handleOpenDetail(req)}
                        title="View Request Details"
                        data-testid={`btn-view-${req.id}`}
                      >
                        View
                      </button>

                      {/* Edit Pending Request */}
                      {canEdit(req) && (
                        <button
                          type="button"
                          className="btn-action-icon"
                          onClick={() => handleOpenEdit(req)}
                          title="Edit Pending Request"
                          data-testid={`btn-edit-${req.id}`}
                        >
                          Edit
                        </button>
                      )}

                      {/* Staff/Admin: Approve */}
                      {isStaffOrAdmin && req.status === 'pending' && (
                        <button
                          type="button"
                          className="btn-action-pill btn-pill-approve"
                          onClick={() => handleOpenStatusModal(req, 'approve')}
                          title="Approve Request"
                          data-testid={`btn-approve-${req.id}`}
                        >
                          Approve
                        </button>
                      )}

                      {/* Staff/Admin: Reject */}
                      {isStaffOrAdmin && req.status === 'pending' && (
                        <button
                          type="button"
                          className="btn-action-pill btn-pill-reject"
                          onClick={() => handleOpenStatusModal(req, 'reject')}
                          title="Reject Request"
                          data-testid={`btn-reject-${req.id}`}
                        >
                          Reject
                        </button>
                      )}

                      {/* Staff/Admin: Fulfill (Deduct stock) */}
                      {isStaffOrAdmin && req.status === 'approved' && (
                        <button
                          type="button"
                          className="btn-action-pill btn-pill-fulfill"
                          onClick={() => handleOpenStatusModal(req, 'fulfill')}
                          title="Fulfill Request & Deduct Stock"
                          data-testid={`btn-fulfill-${req.id}`}
                        >
                          Fulfill
                        </button>
                      )}

                      {/* Cancel (Pending or Approved) */}
                      {canCancel(req) && (
                        <button
                          type="button"
                          className="btn-action-pill btn-pill-cancel"
                          onClick={() => handleOpenStatusModal(req, 'cancel')}
                          title="Cancel Request"
                          data-testid={`btn-cancel-${req.id}`}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && totalPages > 1 && (
          <div className="pagination-bar" data-testid="requests-pagination">
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
      </div>

      {/* Form Modal (Create / Edit) */}
      <RequestFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setSelectedForEdit(null);
        }}
        initialData={selectedForEdit}
        onSubmit={handleFormSubmit}
        isSubmitting={isSubmittingForm}
      />

      {/* Detail Modal */}
      <RequestDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedForDetail(null);
        }}
        request={selectedForDetail}
      />

      {/* Status Transition Action Modal */}
      <RequestStatusModal
        isOpen={isStatusModalOpen}
        onClose={() => {
          setIsStatusModalOpen(false);
          setSelectedForStatusAction(null);
          setStatusActionType(null);
        }}
        request={selectedForStatusAction}
        actionType={statusActionType}
        onSubmit={handleStatusActionSubmit}
        isSubmitting={isSubmittingStatus}
      />
    </div>
  );
};

export default BloodRequests;
