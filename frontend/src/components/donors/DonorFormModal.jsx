import React, { useState, useEffect } from 'react';
import { BLOOD_GROUPS, GENDERS } from '../../services/donorService';
import './DonorModals.css';

export const DonorFormModal = ({ isOpen, onClose, onSubmit, donor, isSubmitting }) => {
  const [formData, setFormData] = useState({
    phone: '',
    date_of_birth: '',
    gender: 'male',
    blood_group: 'A+',
    address: '',
    user_id: '',
    last_donation_date: '',
  });

  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (donor) {
      setFormData({
        phone: donor.phone || '',
        date_of_birth: donor.date_of_birth || '',
        gender: donor.gender || 'male',
        blood_group: donor.blood_group || 'A+',
        address: donor.address || '',
        user_id: donor.user_id ? String(donor.user_id) : '',
        last_donation_date: donor.last_donation_date || '',
      });
    } else {
      setFormData({
        phone: '',
        date_of_birth: '',
        gender: 'male',
        blood_group: 'A+',
        address: '',
        user_id: '',
        last_donation_date: '',
      });
    }
    setFormErrors({});
  }, [donor, isOpen]);

  if (!isOpen) return null;

  const validate = () => {
    const errors = {};

    if (!formData.phone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!/^\+?[0-9\s\-()]{7,20}$/.test(formData.phone.trim())) {
      errors.phone = 'Invalid phone format (7-20 digits or phone symbols)';
    }

    if (!formData.date_of_birth) {
      errors.date_of_birth = 'Date of birth is required';
    } else {
      const dob = new Date(formData.date_of_birth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      if (age < 18) {
        errors.date_of_birth = 'Donor must be at least 18 years old';
      } else if (age > 65) {
        errors.date_of_birth = 'Donor age cannot exceed 65 years';
      }
    }

    if (!formData.address.trim()) {
      errors.address = 'Address is required';
    } else if (formData.address.trim().length < 5) {
      errors.address = 'Address must be at least 5 characters';
    }

    if (formData.last_donation_date) {
      const ldd = new Date(formData.last_donation_date);
      const today = new Date();
      if (ldd > today) {
        errors.last_donation_date = 'Last donation date cannot be in the future';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      phone: formData.phone.trim(),
      date_of_birth: formData.date_of_birth,
      gender: formData.gender,
      blood_group: formData.blood_group,
      address: formData.address.trim(),
    };

    if (formData.user_id.trim()) {
      payload.user_id = parseInt(formData.user_id.trim(), 10);
    }

    if (donor && formData.last_donation_date) {
      payload.last_donation_date = formData.last_donation_date;
    }

    onSubmit(payload);
  };

  return (
    <div className="modal-backdrop" data-testid="donor-form-modal">
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">
            {donor ? 'Edit Donor Profile' : 'Register New Donor'}
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
          <div className="form-group">
            <label className="form-label" htmlFor="phone">
              Phone Number *
            </label>
            <input
              id="phone"
              type="text"
              className={`form-input ${formErrors.phone ? 'input-error' : ''}`}
              placeholder="+1-555-0192"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              disabled={isSubmitting}
            />
            {formErrors.phone && <span className="field-error">{formErrors.phone}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="date_of_birth">
                Date of Birth *
              </label>
              <input
                id="date_of_birth"
                type="date"
                className={`form-input ${formErrors.date_of_birth ? 'input-error' : ''}`}
                value={formData.date_of_birth}
                onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                disabled={isSubmitting}
              />
              {formErrors.date_of_birth && (
                <span className="field-error">{formErrors.date_of_birth}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="gender">
                Gender *
              </label>
              <select
                id="gender"
                className="form-input"
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                disabled={isSubmitting}
              >
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="blood_group">
                Blood Group *
              </label>
              <select
                id="blood_group"
                className="form-input"
                value={formData.blood_group}
                onChange={(e) => setFormData({ ...formData, blood_group: e.target.value })}
                disabled={isSubmitting}
              >
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="user_id">
                User ID (optional)
              </label>
              <input
                id="user_id"
                type="number"
                className="form-input"
                placeholder="Defaults to self"
                value={formData.user_id}
                onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                disabled={isSubmitting || Boolean(donor)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="address">
              Address *
            </label>
            <textarea
              id="address"
              rows="3"
              className={`form-input ${formErrors.address ? 'input-error' : ''}`}
              placeholder="Full address (min 5 characters)"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              disabled={isSubmitting}
            />
            {formErrors.address && <span className="field-error">{formErrors.address}</span>}
          </div>

          {donor && (
            <div className="form-group">
              <label className="form-label" htmlFor="last_donation_date">
                Last Donation Date (optional)
              </label>
              <input
                id="last_donation_date"
                type="date"
                className={`form-input ${formErrors.last_donation_date ? 'input-error' : ''}`}
                value={formData.last_donation_date}
                onChange={(e) =>
                  setFormData({ ...formData, last_donation_date: e.target.value })
                }
                disabled={isSubmitting}
              />
              {formErrors.last_donation_date && (
                <span className="field-error">{formErrors.last_donation_date}</span>
              )}
            </div>
          )}

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
              data-testid="submit-donor-btn"
            >
              {isSubmitting ? 'Saving...' : donor ? 'Update Donor' : 'Save Donor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DonorFormModal;
