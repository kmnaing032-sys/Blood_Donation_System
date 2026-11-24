import React from 'react';
import './DonorModals.css';

export const DonorDetailModal = ({ isOpen, onClose, donor }) => {
  if (!isOpen || !donor) return null;

  return (
    <div className="modal-backdrop" data-testid="donor-detail-modal">
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">Donor Profile Details</h2>
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
            <dt className="detail-term">Donor ID</dt>
            <dd className="detail-desc">#{donor.id}</dd>

            {donor.full_name && (
              <>
                <dt className="detail-term">Full Name</dt>
                <dd className="detail-desc" data-testid="detail-full-name">{donor.full_name}</dd>
              </>
            )}

            {donor.email && (
              <>
                <dt className="detail-term">Email</dt>
                <dd className="detail-desc">{donor.email}</dd>
              </>
            )}

            {donor.phone && (
              <>
                <dt className="detail-term">Phone</dt>
                <dd className="detail-desc">{donor.phone}</dd>
              </>
            )}

            <dt className="detail-term">Blood Group</dt>
            <dd className="detail-desc">
              <span className="blood-badge">{donor.blood_group}</span>
            </dd>

            <dt className="detail-term">Gender</dt>
            <dd className="detail-desc">
              {donor.gender ? donor.gender.charAt(0).toUpperCase() + donor.gender.slice(1) : '—'}
            </dd>

            <dt className="detail-term">Age</dt>
            <dd className="detail-desc">{donor.age} years</dd>

            {donor.date_of_birth && (
              <>
                <dt className="detail-term">Date of Birth</dt>
                <dd className="detail-desc">{donor.date_of_birth}</dd>
              </>
            )}

            {donor.address && (
              <>
                <dt className="detail-term">Address</dt>
                <dd className="detail-desc">{donor.address}</dd>
              </>
            )}

            <dt className="detail-term">Last Donation</dt>
            <dd className="detail-desc">
              {donor.last_donation_date || 'No prior record'}
            </dd>

            {donor.created_at && (
              <>
                <dt className="detail-term">Registered On</dt>
                <dd className="detail-desc">
                  {new Date(donor.created_at).toLocaleDateString()}
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

export default DonorDetailModal;
