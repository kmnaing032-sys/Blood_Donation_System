import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import systemSettingService from '../services/systemSettingService';
import emailNotificationService from '../services/emailNotificationService';
import './SystemSettings.css';

const CATEGORY_TITLES = {
  system: 'System Information',
  donation: 'Donation Configuration',
  blood_stock: 'Blood Stock Thresholds',
  notification: 'Notification Preferences',
  general: 'General Preferences',
};

export const SystemSettings = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Grouped raw settings from server: { category: [ { id, key, value, ... } ] }
  const [rawGrouped, setRawGrouped] = useState({});
  // Form edit values keyed by setting key
  const [formValues, setFormValues] = useState({});
  const [initialValues, setInitialValues] = useState({});

  // Safe SMTP status for administrators
  const [smtpStatus, setSmtpStatus] = useState(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await systemSettingService.getSettings();
      const grouped = data.settings || {};
      setRawGrouped(grouped);

      const flatMap = {};
      Object.values(grouped).forEach((items) => {
        items.forEach((item) => {
          flatMap[item.key] = item.value;
        });
      });
      setFormValues(flatMap);
      setInitialValues(flatMap);

      if (isAdmin) {
        try {
          const statusData = await emailNotificationService.getSmtpStatus();
          setSmtpStatus(statusData);
        } catch (smtpErr) {
          console.warn('Could not load SMTP diagnostics:', smtpErr);
        }
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load system settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (key, value) => {
    setFormValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleCancel = () => {
    setFormValues({ ...initialValues });
    setError(null);
    setSuccessMessage(null);
  };

  const hasChanges = Object.keys(formValues).some(
    (k) => formValues[k] !== initialValues[k]
  );

  const handleSave = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      // Collect only changed settings
      const changed = Object.keys(formValues)
        .filter((k) => formValues[k] !== initialValues[k])
        .map((k) => ({ key: k, value: formValues[k] }));

      if (changed.length === 0) {
        setSuccessMessage('No changes to save.');
        setSaving(false);
        return;
      }

      await systemSettingService.bulkUpdateSettings(changed);
      setInitialValues({ ...formValues });
      setSuccessMessage('System settings updated successfully.');
      fetchSettings(); // Refresh from backend to sync state
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save system settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-loading" data-testid="settings-loading">
        <div className="spinner" aria-label="Loading settings..." />
        <p>Loading system configuration...</p>
      </div>
    );
  }

  if (error && Object.keys(rawGrouped).length === 0) {
    return (
      <div className="settings-error-state" data-testid="settings-error">
        <h2>Unable to Load Settings</h2>
        <p>{error}</p>
        <button
          className="settings-btn settings-btn-primary"
          onClick={fetchSettings}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="settings-container" data-testid="system-settings-page">
      <div className="settings-header">
        <div>
          <h1>System Settings & Configuration</h1>
          <p>
            Manage application parameters, stock thresholds, and operational preferences.
          </p>
        </div>
        <div className="settings-actions">
          <button
            type="button"
            className="settings-btn settings-btn-secondary"
            onClick={fetchSettings}
            disabled={saving}
          >
            Refresh
          </button>
          {isAdmin && (
            <>
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                onClick={handleCancel}
                disabled={!hasChanges || saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-btn settings-btn-primary"
                onClick={handleSave}
                disabled={!hasChanges || saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>

      {successMessage && (
        <div className="settings-feedback-banner success" data-testid="settings-success-alert">
          <span>{successMessage}</span>
          <button
            type="button"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
            onClick={() => setSuccessMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="settings-feedback-banner error" data-testid="settings-error-alert">
          <span>{error}</span>
          <button
            type="button"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}

      {!isAdmin && (
        <div className="settings-feedback-banner" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
          <span>Viewing in read-only mode. Only system administrators can modify settings.</span>
        </div>
      )}

      {isAdmin && smtpStatus && (
        <div className="smtp-status-card" data-testid="smtp-diagnostics-card">
          <div className="smtp-card-header">
            <h2>Outbound Email Configuration (SMTP)</h2>
            <span className={`smtp-badge ${smtpStatus.configured ? 'configured' : 'unconfigured'}`}>
              {smtpStatus.configured ? 'Configured & Active' : 'Not Configured (In-App Only)'}
            </span>
          </div>
          <div className="smtp-grid">
            <div className="smtp-item">
              <span className="smtp-label">SMTP Host</span>
              <span className="smtp-val">{smtpStatus.host || 'None (Environment unset)'}</span>
            </div>
            <div className="smtp-item">
              <span className="smtp-label">Port</span>
              <span className="smtp-val">{smtpStatus.port || 587}</span>
            </div>
            <div className="smtp-item">
              <span className="smtp-label">From Address</span>
              <span className="smtp-val">{smtpStatus.from_email || 'Not configured'}</span>
            </div>
            <div className="smtp-item">
              <span className="smtp-label">Security Protocol</span>
              <span className="smtp-val">
                {smtpStatus.use_ssl ? 'SSL / SMTPS' : smtpStatus.use_tls ? 'STARTTLS' : 'Plaintext'}
              </span>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSave}>
        <div className="settings-grid">
          {Object.entries(rawGrouped).map(([catKey, items]) => (
            <div key={catKey} className="settings-card" data-testid={`category-card-${catKey}`}>
              <div className="settings-card-header">
                <h2>{CATEGORY_TITLES[catKey] || catKey.toUpperCase()}</h2>
              </div>
              <div className="settings-card-body">
                {items.map((setting) => {
                  const currentValue = formValues[setting.key] ?? setting.value;

                  if (setting.data_type === 'boolean') {
                    const isChecked = currentValue === 'true' || currentValue === true;
                    return (
                      <div key={setting.key} className="setting-form-group">
                        <label className="setting-checkbox-label">
                          <input
                            type="checkbox"
                            className="setting-checkbox"
                            checked={isChecked}
                            disabled={!isAdmin || saving}
                            onChange={(e) =>
                              handleChange(setting.key, e.target.checked ? 'true' : 'false')
                            }
                          />
                          <span>{setting.key.replace(/_/g, ' ').toUpperCase()}</span>
                        </label>
                        {setting.description && (
                          <p className="setting-description">{setting.description}</p>
                        )}
                      </div>
                    );
                  }

                  if (setting.key === 'date_format') {
                    return (
                      <div key={setting.key} className="setting-form-group">
                        <div className="setting-label-row">
                          <label htmlFor={setting.key} className="setting-label">
                            Date Format
                          </label>
                          <span className="setting-key-badge">{setting.key}</span>
                        </div>
                        <select
                          id={setting.key}
                          className="setting-select"
                          value={currentValue}
                          disabled={!isAdmin || saving}
                          onChange={(e) => handleChange(setting.key, e.target.value)}
                        >
                          <option value="YYYY-MM-DD">YYYY-MM-DD (ISO standard)</option>
                          <option value="DD/MM/YYYY">DD/MM/YYYY (Day first)</option>
                          <option value="MM/DD/YYYY">MM/DD/YYYY (Month first)</option>
                        </select>
                        {setting.description && (
                          <p className="setting-description">{setting.description}</p>
                        )}
                      </div>
                    );
                  }

                  if (setting.key === 'timezone') {
                    return (
                      <div key={setting.key} className="setting-form-group">
                        <div className="setting-label-row">
                          <label htmlFor={setting.key} className="setting-label">
                            Timezone
                          </label>
                          <span className="setting-key-badge">{setting.key}</span>
                        </div>
                        <select
                          id={setting.key}
                          className="setting-select"
                          value={currentValue}
                          disabled={!isAdmin || saving}
                          onChange={(e) => handleChange(setting.key, e.target.value)}
                        >
                          <option value="UTC">UTC (Universal Coordinated Time)</option>
                          <option value="GMT">GMT (Greenwich Mean Time)</option>
                          <option value="Asia/Yangon">Asia/Yangon (Myanmar Time)</option>
                          <option value="Asia/Bangkok">Asia/Bangkok (Indochina Time)</option>
                          <option value="America/New_York">America/New_York (Eastern Time)</option>
                          <option value="Europe/London">Europe/London (UK)</option>
                        </select>
                        {setting.description && (
                          <p className="setting-description">{setting.description}</p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={setting.key} className="setting-form-group">
                      <div className="setting-label-row">
                        <label htmlFor={setting.key} className="setting-label">
                          {setting.key.replace(/_/g, ' ').toUpperCase()}
                        </label>
                        <span className="setting-key-badge">{setting.key}</span>
                      </div>
                      <input
                        id={setting.key}
                        type={setting.data_type === 'integer' ? 'number' : 'text'}
                        className="setting-input"
                        value={currentValue}
                        disabled={!isAdmin || saving}
                        onChange={(e) => handleChange(setting.key, e.target.value)}
                      />
                      {setting.description && (
                        <p className="setting-description">{setting.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </form>
    </div>
  );
};

export default SystemSettings;
