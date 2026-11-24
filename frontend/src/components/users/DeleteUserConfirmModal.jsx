import React from 'react';
import './UserModals.css';

export const DeleteUserConfirmModal = ({
  isOpen,
  onClose,
  user,
  onConfirm,
  isDeleting,
}) => {
  if (!isOpen || !user) return null;

  return (
    <div className="modal-backdrop" data-testid="delete-user-backdrop" onClick={onClose}>
      <div
        className="modal-container delete-user-modal"
        role="dialog"
        aria-labelledby="delete-user-title"
        data-testid="delete-user-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="delete-user-title">Confirm User Deletion</h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p className="delete-warning-text">
            Are you sure you want to permanently delete the user account for{' '}
            <strong>{user.full_name}</strong> (<code>{user.email}</code>)?
          </p>
          <div className="alert-box alert-warning">
            <span>⚠️</span>
            <span>
              This action cannot be undone. Backend will reject deletion if this is the last active administrator.
            </span>
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={isDeleting}
            data-testid="btn-confirm-delete-user"
          >
            {isDeleting ? 'Deleting...' : 'Delete User'}
          </button>
        </div>
      </div>
    </div>
  );
};
