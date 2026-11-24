import React from 'react';
import './BloodRequestModals.css';

export const RequestDetailModal = ({ isOpen, onClose, request }) => {
  if (!isOpen || !request) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  const getUrgencyBadge = (urgency) => {
    const u = (urgency || 'normal').toLowerCase();
    return <span className={`badge-urgency urgency-${u}`}>{u.toUpperCase()}</span>;
  };

  const getStatusBadge = (status) => {
    const s = (status || 'pending').toLowerCase();
    return <span className={`status-badge status-${s}`}>{s.toUpperCase()}</span>;
  };

  return (
    <div className="modal-backdrop" data-testid="request-detail-backdrop" onClick={onClose}>
      <div
        className="modal-container request-detail-modal"
        role="dialog"
        aria-labelledby="detail-title"
        data-testid="request-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="header-badge-group">
            <h2 id="detail-title">Blood Request Details</h2>
            <span className="req-id-badge">#{request.id}</span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="modal-body detail-body">
          <div className="detail-status-bar">
            <div className="status-item">
              <span className="detail-label">Current Status:</span>
              {getStatusBadge(request.status)}
            </div>
            <div className="status-item">
              <span className="detail-label">Urgency Level:</span>
              {getUrgencyBadge(request.urgency)}
            </div>
            <div className="status-item">
              <span className="detail-label">Blood Group:</span>
              <span className="blood-group-tag" data-testid="detail-blood-group">{request.blood_group}</span>
            </div>
            <div className="status-item">
              <span className="detail-label">Required Volume:</span>
              <strong className="volume-strong" data-testid="detail-quantity">{request.quantity_ml} ml</strong>
            </div>
          </div>

          <div className="detail-grid">
            <div className="detail-field">
              <span className="detail-label">Patient Name:</span>
              <span className="detail-value" data-testid="detail-patient-name">{request.patient_name}</span>
            </div>

            <div className="detail-field">
              <span className="detail-label">Contact Phone:</span>
              <span className="detail-value" data-testid="detail-contact-phone">{request.contact_phone}</span>
            </div>

            <div className="detail-field">
              <span className="detail-label">Hospital Name:</span>
              <span className="detail-value" data-testid="detail-hospital-name">{request.hospital_name}</span>
            </div>

            <div className="detail-field">
              <span className="detail-label">Hospital Address:</span>
              <span className="detail-value">{request.hospital_address}</span>
            </div>

            <div className="detail-field">
              <span className="detail-label">Required By:</span>
              <span className="detail-value">{formatDate(request.required_by)}</span>
            </div>

            <div className="detail-field">
              <span className="detail-label">Created At:</span>
              <span className="detail-value">{formatDate(request.created_at)}</span>
            </div>

            <div className="detail-field">
              <span className="detail-label">Last Updated:</span>
              <span className="detail-value">{formatDate(request.updated_at)}</span>
            </div>

            {request.user_id && (
              <div className="detail-field">
                <span className="detail-label">Requester User ID:</span>
                <span className="detail-value">User #{request.user_id}</span>
              </div>
            )}
          </div>

          {request.notes && (
            <div className="detail-notes-section">
              <span className="detail-label">Audit / Clinical Notes:</span>
              <pre className="notes-box" data-testid="detail-notes">{request.notes}</pre>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
