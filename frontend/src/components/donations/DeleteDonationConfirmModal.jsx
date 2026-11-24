import React from 'react';
import '../donors/DonorModals.css';

export const DeleteDonationConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  donation,
  isDeleting,
}) => {
  if (!isOpen || !donation) return null;

  return (
    <div className="modal-backdrop" data-testid="delete-donation-modal">
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
          <div className="confirm-warning-icon">🩸</div>
          <p className="confirm-text">
            Are you sure you want to delete donation record <strong>#{donation.id}</strong> (
            {donation.quantity_ml}ml of {donation.blood_group})?
          </p>
          <p className="confirm-text" style={{ fontSize: '0.85rem', color: '#991b1b' }}>
            Deleting this record will automatically reconcile and decrement blood inventory.
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
              data-testid="confirm-delete-donation-btn"
            >
              {isDeleting ? 'Deleting...' : 'Yes, Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteDonationConfirmModal;
