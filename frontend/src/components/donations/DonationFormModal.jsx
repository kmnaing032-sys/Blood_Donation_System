import React, { useState, useEffect } from 'react';
import donorService, { BLOOD_GROUPS } from '../../services/donorService';
import { DONATION_STATUSES } from '../../services/donationService';
import '../donors/DonorModals.css';
import './DonationModals.css';

export const DonationFormModal = ({
  isOpen,
  onClose,
  onSubmit,
  donation,
  isSubmitting,
}) => {
  const [donorsList, setDonorsList] = useState([]);
  const [loadingDonors, setLoadingDonors] = useState(false);

  const [formData, setFormData] = useState({
    donor_id: '',
    donation_date: new Date().toISOString().split('T')[0],
    quantity_ml: '450',
    blood_group: 'A+',
    status: 'completed',
    notes: '',
  });

  const [selectedDonor, setSelectedDonor] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  // Fetch available donors for selection
  useEffect(() => {
    if (isOpen) {
      const fetchDonors = async () => {
        setLoadingDonors(true);
        try {
          // Fetch up to 100 donors for selection
          const data = await donorService.getDonors({ page: 1, page_size: 100 });
          setDonorsList(data.items || []);
        } catch {
          // Handled gracefully
        } finally {
          setLoadingDonors(false);
        }
      };
      fetchDonors();
    }
  }, [isOpen]);

  useEffect(() => {
    if (donation) {
      setFormData({
        donor_id: String(donation.donor_id || ''),
        donation_date: donation.donation_date || new Date().toISOString().split('T')[0],
        quantity_ml: String(donation.quantity_ml || '450'),
        blood_group: donation.blood_group || 'A+',
        status: donation.status || 'completed',
        notes: donation.notes || '',
      });
    } else {
      setFormData({
        donor_id: '',
        donation_date: new Date().toISOString().split('T')[0],
        quantity_ml: '450',
        blood_group: 'A+',
        status: 'completed',
        notes: '',
      });
      setSelectedDonor(null);
    }
    setFormErrors({});
  }, [donation, isOpen]);

  // Sync donor info when donor selection changes
  const handleDonorChange = (e) => {
    const selectedId = e.target.value;
    setFormData((prev) => ({
      ...prev,
      donor_id: selectedId,
    }));

    if (selectedId) {
      const d = donorsList.find((item) => String(item.id) === selectedId);
      if (d) {
        setSelectedDonor(d);
        // Automatically sync blood group to donor's registered blood group
        setFormData((prev) => ({
          ...prev,
          donor_id: selectedId,
          blood_group: d.blood_group || prev.blood_group,
        }));
      }
    } else {
      setSelectedDonor(null);
    }
  };

  if (!isOpen) return null;

  const validate = () => {
    const errors = {};

    if (!donation && !formData.donor_id) {
      errors.donor_id = 'Please select a donor';
    }

    if (!formData.donation_date) {
      errors.donation_date = 'Donation date is required';
    } else {
      const dDate = new Date(formData.donation_date);
      const today = new Date();
      if (dDate > today) {
        errors.donation_date = 'Donation date cannot be in the future';
      }
    }

    const qty = parseInt(formData.quantity_ml, 10);
    if (isNaN(qty)) {
      errors.quantity_ml = 'Quantity is required';
    } else if (qty < 100 || qty > 800) {
      errors.quantity_ml = 'Quantity must be between 100ml and 800ml';
    }

    if (formData.notes && formData.notes.length > 1000) {
      errors.notes = 'Notes cannot exceed 1000 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    if (donation) {
      // DonationUpdate schema: donation_date, quantity_ml, status, notes
      const payload = {
        donation_date: formData.donation_date,
        quantity_ml: parseInt(formData.quantity_ml, 10),
        status: formData.status,
        notes: formData.notes.trim() || null,
      };
      onSubmit(payload);
    } else {
      // DonationCreate schema: donor_id, donation_date, quantity_ml, blood_group, status, notes
      const payload = {
        donor_id: parseInt(formData.donor_id, 10),
        donation_date: formData.donation_date,
        quantity_ml: parseInt(formData.quantity_ml, 10),
        blood_group: formData.blood_group,
        status: formData.status,
        notes: formData.notes.trim() || null,
      };
      onSubmit(payload);
    }
  };

  return (
    <div className="modal-backdrop" data-testid="donation-form-modal">
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">
            {donation ? 'Edit Donation Record' : 'Record Blood Donation'}
          </h2>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body donor-form" noValidate>
          {!donation && (
            <div className="form-group">
              <label className="form-label" htmlFor="donor_id">
                Select Donor *
              </label>
              <select
                id="donor_id"
                className={`form-input ${formErrors.donor_id ? 'input-error' : ''}`}
                value={formData.donor_id}
                onChange={handleDonorChange}
                disabled={isSubmitting || loadingDonors}
                data-testid="donor-select"
              >
                <option value="">
                  {loadingDonors ? 'Loading donors...' : '-- Choose a Donor --'}
                </option>
                {donorsList.map((d) => (
                  <option key={d.id} value={d.id}>
                    #{d.id} - {d.full_name || 'Anonymous Donor'} ({d.blood_group})
                  </option>
                ))}
              </select>
              {formErrors.donor_id && (
                <span className="field-error">{formErrors.donor_id}</span>
              )}

              {selectedDonor && (
                <div className="donor-selection-info" data-testid="donor-info-preview">
                  <span>
                    Registered Blood Group: <strong>{selectedDonor.blood_group}</strong>
                  </span>
                  <span>Age: {selectedDonor.age} yrs</span>
                </div>
              )}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="donation_date">
                Donation Date *
              </label>
              <input
                id="donation_date"
                type="date"
                className={`form-input ${formErrors.donation_date ? 'input-error' : ''}`}
                value={formData.donation_date}
                onChange={(e) =>
                  setFormData({ ...formData, donation_date: e.target.value })
                }
                disabled={isSubmitting}
              />
              {formErrors.donation_date && (
                <span className="field-error">{formErrors.donation_date}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="quantity_ml">
                Quantity (ml) *
              </label>
              <input
                id="quantity_ml"
                type="number"
                min="100"
                max="800"
                step="50"
                className={`form-input ${formErrors.quantity_ml ? 'input-error' : ''}`}
                placeholder="e.g. 450"
                value={formData.quantity_ml}
                onChange={(e) =>
                  setFormData({ ...formData, quantity_ml: e.target.value })
                }
                disabled={isSubmitting}
              />
              {formErrors.quantity_ml && (
                <span className="field-error">{formErrors.quantity_ml}</span>
              )}
            </div>
          </div>

          <div className="form-row">
            {!donation && (
              <div className="form-group">
                <label className="form-label" htmlFor="blood_group">
                  Blood Group *
                </label>
                <select
                  id="blood_group"
                  className="form-input"
                  value={formData.blood_group}
                  onChange={(e) =>
                    setFormData({ ...formData, blood_group: e.target.value })
                  }
                  disabled={isSubmitting}
                >
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg} value={bg}>
                      {bg}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group" style={{ gridColumn: donation ? '1 / -1' : 'auto' }}>
              <label className="form-label" htmlFor="status">
                Status *
              </label>
              <select
                id="status"
                className="form-input"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                disabled={isSubmitting}
              >
                {DONATION_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st.charAt(0).toUpperCase() + st.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="notes">
              Clinical / Administrative Notes (optional)
            </label>
            <textarea
              id="notes"
              rows="3"
              className={`form-input ${formErrors.notes ? 'input-error' : ''}`}
              placeholder="e.g. Routine donation at central hospital drive..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              disabled={isSubmitting}
            />
            {formErrors.notes && <span className="field-error">{formErrors.notes}</span>}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
              data-testid="submit-donation-btn"
            >
              {isSubmitting
                ? 'Saving...'
                : donation
                ? 'Update Record'
                : 'Save Donation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DonationFormModal;
