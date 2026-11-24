import React, { useState, useEffect } from 'react';
import './StockAdjustmentModal.css';

export const StockAdjustmentModal = ({
  isOpen,
  onClose,
  stock,
  onSubmit,
  isSubmitting,
}) => {
  const [availableQuantity, setAvailableQuantity] = useState('');
  const [reservedQuantity, setReservedQuantity] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (stock) {
      setAvailableQuantity(stock.available_quantity_ml ?? stock.available_ml ?? 0);
      setReservedQuantity(stock.reserved_quantity_ml ?? stock.reserved_ml ?? 0);
      setValidationError('');
    }
  }, [stock, isOpen]);

  if (!isOpen || !stock) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setValidationError('');

    const availNum = Number(availableQuantity);
    const resNum = Number(reservedQuantity);

    if (isNaN(availNum) || availNum < 0) {
      setValidationError('Available quantity must be a non-negative number (>= 0 ml).');
      return;
    }

    if (isNaN(resNum) || resNum < 0) {
      setValidationError('Reserved quantity must be a non-negative number (>= 0 ml).');
      return;
    }

    onSubmit({
      available_quantity_ml: availNum,
      reserved_quantity_ml: resNum,
    });
  };

  return (
    <div className="modal-backdrop" data-testid="stock-adjust-modal-backdrop" onClick={onClose}>
      <div
        className="modal-container stock-modal"
        role="dialog"
        aria-labelledby="stock-modal-title"
        data-testid="stock-adjust-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="stock-modal-title">
            Adjust Blood Stock — <span className="blood-group-tag">{stock.blood_group}</span>
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

        <form onSubmit={handleSubmit} className="modal-form">
          {validationError && (
            <div className="alert-box error" data-testid="stock-validation-error">
              {validationError}
            </div>
          )}

          <div className="form-info-banner">
            <span className="banner-icon">ℹ️</span>
            <span>
              Manually calibrate physical inventory levels (e.g. inventory audits, discards, or expirations).
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="available_quantity_ml">
              Available Volume (ml) <span className="required">*</span>
            </label>
            <input
              id="available_quantity_ml"
              name="available_quantity_ml"
              type="number"
              min="0"
              step="1"
              required
              value={availableQuantity}
              onChange={(e) => setAvailableQuantity(e.target.value)}
              placeholder="e.g. 2500"
              data-testid="input-available-quantity"
            />
            <small className="field-hint">Volume currently unreserved and ready for allocation.</small>
          </div>

          <div className="form-group">
            <label htmlFor="reserved_quantity_ml">
              Reserved Volume (ml) <span className="required">*</span>
            </label>
            <input
              id="reserved_quantity_ml"
              name="reserved_quantity_ml"
              type="number"
              min="0"
              step="1"
              required
              value={reservedQuantity}
              onChange={(e) => setReservedQuantity(e.target.value)}
              placeholder="e.g. 500"
              data-testid="input-reserved-quantity"
            />
            <small className="field-hint">Volume earmarked for approved recipient requests.</small>
          </div>

          <div className="modal-total-preview">
            <span>Total Stock Preview:</span>
            <strong>{(Number(availableQuantity) || 0) + (Number(reservedQuantity) || 0)} ml</strong>
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
              data-testid="btn-save-stock"
            >
              {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StockAdjustmentModal;
