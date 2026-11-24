import React from 'react';
import '../donors/DonorModals.css';
import './DonationModals.css';

export const DonationDetailModal = ({ isOpen, onClose, donation }) => {
  if (!isOpen || !donation) return null;

  return (
    <div className="modal-backdrop" data-testid="donation-detail-modal">
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">Donation Record Details</h2>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <dl className="donor-detail-list">
            <dt className="detail-term">Donation ID</dt>
            <dd className="detail-desc">#{donation.id}</dd>

            <dt className="detail-term">Donor</dt>
            <dd className="detail-desc" data-testid="detail-donor-name">
              {donation.donor_name || `Donor #${donation.donor_id}`}
            </dd>

            {donation.donor_phone && (
              <>
                <dt className="detail-term">Donor Contact</dt>
                <dd className="detail-desc">{donation.donor_phone}</dd>
              </>
            )}

            <dt className="detail-term">Blood Group</dt>
            <dd className="detail-desc">
              <span className="blood-badge">{donation.blood_group}</span>
            </dd>

            <dt className="detail-term">Quantity</dt>
            <dd className="detail-desc">{donation.quantity_ml} ml</dd>

            <dt className="detail-term">Donation Date</dt>
            <dd className="detail-desc">{donation.donation_date}</dd>

            <dt className="detail-term">Status</dt>
            <dd className="detail-desc">
              <span className={`status-badge ${donation.status}`}>
                {donation.status}
              </span>
            </dd>

            {donation.notes && (
              <>
                <dt className="detail-term">Notes</dt>
                <dd className="detail-desc">{donation.notes}</dd>
              </>
            )}

            {donation.created_at && (
              <>
                <dt className="detail-term">Recorded At</dt>
                <dd className="detail-desc">
                  {new Date(donation.created_at).toLocaleString()}
                </dd>
              </>
            )}
          </dl>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DonationDetailModal;
