import React, { useState } from 'react';
import './BloodRequestModals.css';

export const RequestStatusModal = ({
  isOpen,
  onClose,
  request,
  actionType, // 'approve' | 'reject' | 'fulfill' | 'cancel'
  onSubmit,
  isSubmitting,
}) => {
  const [notes, setNotes] = useState('');

  if (!isOpen || !request || !actionType) return null;

  const actionLabels = {
    approve: {
      title: 'Approve Blood Request',
      button: 'Confirm Approval',
      btnClass: 'btn-success',
      desc: 'Approve this request for medical preparation. Note: Blood stock will NOT be deducted until fulfilled.',
    },
    reject: {
      title: 'Reject Blood Request',
      button: 'Confirm Rejection',
      btnClass: 'btn-danger',
      desc: 'Reject this blood request. This is a terminal state and cannot be undone.',
    },
    fulfill: {
      title: 'Fulfill Blood Request',
      button: 'Confirm & Deduct Stock',
      btnClass: 'btn-primary',
      desc: `Fulfill this blood request. This will atomically deduct ${request.quantity_ml} ml of ${request.blood_group} blood from active stock and complete the request.`,
    },
    cancel: {
      title: 'Cancel Blood Request',
      button: 'Confirm Cancellation',
      btnClass: 'btn-warning',
      desc: 'Cancel this blood request. This action cannot be reversed.',
    },
  };

  const config = actionLabels[actionType] || {
    title: 'Update Request Status',
    button: 'Confirm',
    btnClass: 'btn-primary',
    desc: 'Confirm status update for this request.',
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(actionType, notes);
  };

  return (
    <div className="modal-backdrop" data-testid="status-modal-backdrop" onClick={onClose}>
      <div
        className="modal-container status-modal"
        role="dialog"
        aria-labelledby="status-modal-title"
        data-testid="status-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="status-modal-title">{config.title}</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <p className="modal-description">{config.desc}</p>

          <div className="request-summary-pill">
            <span>Patient: <strong>{request.patient_name}</strong></span>
            <span>Blood Group: <strong className="blood-tag">{request.blood_group}</strong></span>
            <span>Quantity: <strong>{request.quantity_ml} ml</strong></span>
          </div>

          <div className="form-group full-width">
            <label htmlFor="status_notes">
              Audit / Action Reason {actionType === 'reject' || actionType === 'cancel' ? '(Recommended)' : '(Optional)'}
            </label>
            <textarea
              id="status_notes"
              rows="3"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Reason for clinical decision or dispatch details..."
              data-testid="input-status-notes"
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`btn ${config.btnClass}`}
              disabled={isSubmitting}
              data-testid="btn-confirm-status-action"
            >
              {isSubmitting ? 'Processing...' : config.button}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
