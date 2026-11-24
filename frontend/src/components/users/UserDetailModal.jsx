import React from 'react';
import './UserModals.css';

export const UserDetailModal = ({ isOpen, onClose, user }) => {
  if (!isOpen || !user) return null;

  return (
    <div className="modal-backdrop" data-testid="user-detail-backdrop" onClick={onClose}>
      <div
        className="modal-container user-detail-modal"
        role="dialog"
        aria-labelledby="user-detail-title"
        data-testid="user-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="header-badge-group">
            <h2 id="user-detail-title">User Account Details</h2>
            <span className="user-id-badge">#{user.id}</span>
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
          <div className="user-summary-card">
            <div className="user-avatar-circle">
              {user.full_name ? user.full_name[0].toUpperCase() : 'U'}
            </div>
            <div className="user-summary-text">
              <h3 className="user-display-name" data-testid="detail-user-name">{user.full_name}</h3>
              <p className="user-display-email" data-testid="detail-user-email">{user.email}</p>
            </div>
          </div>

          <div className="detail-grid">
            <div className="detail-field">
              <span className="detail-label">User ID:</span>
              <span className="detail-value">#{user.id}</span>
            </div>

            <div className="detail-field">
              <span className="detail-label">Assigned Role:</span>
              <span className={`badge-role role-${user.role}`} data-testid="detail-user-role">
                {user.role ? user.role.toUpperCase() : 'USER'}
              </span>
            </div>

            <div className="detail-field">
              <span className="detail-label">Account Status:</span>
              <span
                className={`badge-status status-${user.is_active ? 'active' : 'inactive'}`}
                data-testid="detail-user-status"
              >
                {user.is_active ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
          </div>
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
