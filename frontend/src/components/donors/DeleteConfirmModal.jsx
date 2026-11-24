import React from 'react';
import './DonorModals.css';

export const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, donor, isDeleting }) => {
  if (!isOpen || !donor) return null;

  return (
    <div className="modal-backdrop" data-testid="delete-confirm-modal">
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">Confirm Deletion</h2>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
            disabled={isDeleting}
          >
            ✕
          </button>
        </div>

        <div className="modal-body confirm-delete-box">
          <div className="confirm-warning-icon">⚠️</div>
          <p className="confirm-text">
            Are you sure you want to delete the donor profile for{' '}
            <strong>{donor.full_name || `Donor #${donor.id}`}</strong>?
          </p>
          <p className="confirm-text" style={{ fontSize: '0.85rem', color: '#991b1b' }}>
            This action is permanent and cannot be undone.
          </p>

          <div className="modal-actions" style={{ justifyContent: 'center' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={onConfirm}
              disabled={isDeleting}
              data-testid="confirm-delete-btn"
            >
              {isDeleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
