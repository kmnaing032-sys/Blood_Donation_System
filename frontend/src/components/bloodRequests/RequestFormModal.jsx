import React, { useState, useEffect } from 'react';
import { REQUEST_URGENCIES } from '../../services/bloodRequestService';
import './BloodRequestModals.css';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const RequestFormModal = ({
  isOpen,
  onClose,
  initialData,
  onSubmit,
  isSubmitting,
}) => {
  const isEditing = Boolean(initialData);

  const [formData, setFormData] = useState({
    patient_name: '',
    hospital_name: '',
    hospital_address: '',
    blood_group: 'A+',
    quantity_ml: 450,
    urgency: 'normal',
    contact_phone: '',
    required_by: '',
    notes: '',
  });

  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (initialData) {
      setFormData({
        patient_name: initialData.patient_name || '',
        hospital_name: initialData.hospital_name || '',
        hospital_address: initialData.hospital_address || '',
        blood_group: initialData.blood_group || 'A+',
        quantity_ml: initialData.quantity_ml || 450,
        urgency: initialData.urgency || 'normal',
        contact_phone: initialData.contact_phone || '',
        required_by: initialData.required_by ? initialData.required_by.slice(0, 16) : '',
        notes: initialData.notes || '',
      });
      setFieldErrors({});
    } else {
      setFormData({
        patient_name: '',
        hospital_name: '',
        hospital_address: '',
        blood_group: 'A+',
        quantity_ml: 450,
        urgency: 'normal',
        contact_phone: '',
        required_by: '',
        notes: '',
      });
      setFieldErrors({});
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const validate = () => {
    const errors = {};
    if (!formData.patient_name || formData.patient_name.trim().length < 2) {
      errors.patient_name = 'Patient name must be at least 2 characters.';
    }
    if (!formData.hospital_name || formData.hospital_name.trim().length < 2) {
      errors.hospital_name = 'Hospital name must be at least 2 characters.';
    }
    if (!formData.hospital_address || formData.hospital_address.trim().length < 5) {
      errors.hospital_address = 'Hospital address must be at least 5 characters.';
    }
    if (!formData.blood_group) {
      errors.blood_group = 'Please select a blood group.';
    }
    const qty = Number(formData.quantity_ml);
    if (!qty || qty <= 0 || qty > 5000) {
      errors.quantity_ml = 'Quantity must be between 1 and 5000 ml.';
    }
    if (!formData.contact_phone || !/^\+?[0-9\s\-()]{7,20}$/.test(formData.contact_phone.trim())) {
      errors.contact_phone = 'Enter a valid contact phone (7 to 20 digits/symbols).';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      ...formData,
      quantity_ml: Number(formData.quantity_ml),
    };
    if (!payload.required_by) {
      delete payload.required_by;
    }
    onSubmit(payload);
  };

  return (
    <div className="modal-backdrop" data-testid="request-form-modal-backdrop" onClick={onClose}>
      <div
        className="modal-container request-modal"
        role="dialog"
        aria-labelledby="request-modal-title"
        data-testid="request-form-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="request-modal-title">
            {isEditing ? 'Edit Blood Request' : 'Submit New Blood Request'}
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form" noValidate>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="patient_name">
                Patient Name <span className="required">*</span>
              </label>
              <input
                id="patient_name"
                name="patient_name"
                type="text"
                required
                value={formData.patient_name}
                onChange={handleChange}
                placeholder="e.g. Jane Doe"
                data-testid="input-patient-name"
              />
              {fieldErrors.patient_name && (
                <span className="field-error" data-testid="error-patient-name">
                  {fieldErrors.patient_name}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="contact_phone">
                Contact Phone <span className="required">*</span>
              </label>
              <input
                id="contact_phone"
                name="contact_phone"
                type="tel"
                required
                value={formData.contact_phone}
                onChange={handleChange}
                placeholder="e.g. +1-555-0199"
                data-testid="input-contact-phone"
              />
              {fieldErrors.contact_phone && (
                <span className="field-error" data-testid="error-contact-phone">
                  {fieldErrors.contact_phone}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="hospital_name">
                Hospital / Clinic Name <span className="required">*</span>
              </label>
              <input
                id="hospital_name"
                name="hospital_name"
                type="text"
                required
                value={formData.hospital_name}
                onChange={handleChange}
                placeholder="e.g. St. Jude General Hospital"
                data-testid="input-hospital-name"
              />
              {fieldErrors.hospital_name && (
                <span className="field-error" data-testid="error-hospital-name">
                  {fieldErrors.hospital_name}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="blood_group">
                Required Blood Group <span className="required">*</span>
              </label>
              <select
                id="blood_group"
                name="blood_group"
                required
                value={formData.blood_group}
                onChange={handleChange}
                disabled={isEditing}
                data-testid="select-blood-group"
              >
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
              {isEditing && (
                <small className="field-hint">Blood group cannot be altered once requested.</small>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="quantity_ml">
                Quantity (ml) <span className="required">*</span>
              </label>
              <input
                id="quantity_ml"
                name="quantity_ml"
                type="number"
                min="100"
                max="5000"
                step="50"
                required
                value={formData.quantity_ml}
                onChange={handleChange}
                data-testid="input-quantity-ml"
              />
              {fieldErrors.quantity_ml && (
                <span className="field-error" data-testid="error-quantity-ml">
                  {fieldErrors.quantity_ml}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="urgency">Urgency Level</label>
              <select
                id="urgency"
                name="urgency"
                value={formData.urgency}
                onChange={handleChange}
                data-testid="select-urgency"
              >
                {REQUEST_URGENCIES.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group full-width">
              <label htmlFor="hospital_address">
                Hospital Address <span className="required">*</span>
              </label>
              <input
                id="hospital_address"
                name="hospital_address"
                type="text"
                required
                value={formData.hospital_address}
                onChange={handleChange}
                placeholder="e.g. Ward 4, Building B, 100 Medical Blvd"
                data-testid="input-hospital-address"
              />
              {fieldErrors.hospital_address && (
                <span className="field-error" data-testid="error-hospital-address">
                  {fieldErrors.hospital_address}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="required_by">Required By (Target Date & Time)</label>
              <input
                id="required_by"
                name="required_by"
                type="datetime-local"
                value={formData.required_by}
                onChange={handleChange}
                data-testid="input-required-by"
              />
            </div>

            <div className="form-group full-width">
              <label htmlFor="notes">Clinical Notes / Indications</label>
              <textarea
                id="notes"
                name="notes"
                rows="3"
                value={formData.notes}
                onChange={handleChange}
                placeholder="e.g. Scheduled emergency bypass surgery, doctor contact details..."
                data-testid="input-notes"
              />
            </div>
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
              className="btn btn-primary"
              disabled={isSubmitting}
              data-testid="btn-submit-request"
            >
              {isSubmitting
                ? isEditing
                  ? 'Saving Changes...'
                  : 'Submitting...'
                : isEditing
                ? 'Save Changes'
                : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
