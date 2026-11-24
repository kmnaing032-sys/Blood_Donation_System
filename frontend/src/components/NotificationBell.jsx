import React, { useState, useRef, useEffect, useCallback } from 'react';
import './NotificationBell.css';

/**
 * NotificationBell
 *
 * Renders an accessible notification trigger in Topbar.
 * Displays unread count badge and toggles a dropdown panel
 * supporting live backend notification listings, read/unread states,
 * and mark-as-read/delete actions.
 *
 * Props:
 *   unreadCount {number}         — unread notification count
 *   notifications {Array}        — list of notification objects
 *   supported {boolean}          — backend support status flag
 *   onMarkAsRead {Function}      — callback to mark single notification read
 *   onMarkAllAsRead {Function}   — callback to mark all notifications read
 *   onDelete {Function}          — callback to delete a notification
 */
export const NotificationBell = ({
  unreadCount = 0,
  notifications = [],
  supported = true,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        close();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, close]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, close]);

  return (
    <div
      className="notification-bell-wrapper"
      ref={containerRef}
      data-testid="notification-bell-wrapper"
    >
      {/* Bell Button */}
      <button
        className="notification-bell-btn"
        onClick={toggle}
        aria-label={
          unreadCount > 0
            ? `Notifications — ${unreadCount} unread`
            : 'Notifications'
        }
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        data-testid="notification-bell-btn"
      >
        <svg
          className="bell-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
          width="20"
          height="20"
          data-testid="bell-svg-icon"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span
            className="notification-badge"
            aria-label={`${unreadCount} unread notifications`}
            data-testid="notification-badge"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          className="notification-dropdown"
          role="dialog"
          aria-label="Notifications panel"
          aria-modal="false"
          data-testid="notification-dropdown"
        >
          {/* Header */}
          <div className="notification-dropdown-header">
            <span className="notification-dropdown-title">Notifications</span>
            <div className="notification-header-actions">
              {supported && unreadCount > 0 && onMarkAllAsRead && (
                <button
                  className="mark-all-btn"
                  onClick={onMarkAllAsRead}
                  data-testid="mark-all-read-btn"
                >
                  Mark all read
                </button>
              )}
              <button
                className="notification-close-btn"
                onClick={close}
                aria-label="Close notifications"
                data-testid="notification-close-btn"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  width="16"
                  height="16"
                  aria-hidden="true"
                  focusable="false"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="notification-dropdown-body" data-testid="notification-dropdown-body">
            {!supported ? (
              <div
                className="notification-not-supported"
                data-testid="notification-not-supported"
              >
                <svg
                  className="not-supported-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="40"
                  height="40"
                  aria-hidden="true"
                  focusable="false"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="not-supported-title">No Notifications</p>
                <p className="not-supported-desc">
                  Notification support is not yet available. The backend notification
                  system is planned for a future release.
                </p>
              </div>
            ) : notifications.length === 0 ? (
              <div
                className="notification-empty"
                data-testid="notification-empty"
              >
                <svg
                  className="empty-bell-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="40"
                  height="40"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <p className="notification-empty-title">All caught up!</p>
                <p className="notification-empty-desc">You have no new notifications.</p>
              </div>
            ) : (
              <ul
                className="notification-list"
                role="list"
                data-testid="notification-list"
              >
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`notification-item${n.is_read ? '' : ' unread'}`}
                    data-testid={`notification-item-${n.id}`}
                  >
                    <div className="notification-item-content">
                      <div className="notification-item-header">
                        <span className="notification-item-title">{n.title}</span>
                        {n.category && (
                          <span
                            className={`notification-category-badge category-${n.category}`}
                            data-testid={`category-badge-${n.id}`}
                          >
                            {n.category}
                          </span>
                        )}
                      </div>
                      <span className="notification-item-message">{n.message}</span>
                      {n.created_at && (
                        <span className="notification-item-time">
                          {new Date(n.created_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="notification-item-actions">
                      {!n.is_read && onMarkAsRead && (
                        <button
                          className="item-action-btn mark-read-btn"
                          onClick={() => onMarkAsRead(n.id)}
                          title="Mark as read"
                          aria-label={`Mark notification ${n.id} as read`}
                          data-testid={`mark-read-btn-${n.id}`}
                        >
                          ✓
                        </button>
                      )}
                      {onDelete && (
                        <button
                          className="item-action-btn delete-btn"
                          onClick={() => onDelete(n.id)}
                          title="Delete notification"
                          aria-label={`Delete notification ${n.id}`}
                          data-testid={`delete-btn-${n.id}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="notification-dropdown-footer">
            <span className="notification-footer-note" data-testid="notification-footer-note">
              {supported
                ? `${notifications.length} notification${notifications.length !== 1 ? 's' : ''}`
                : 'Feature coming soon'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
