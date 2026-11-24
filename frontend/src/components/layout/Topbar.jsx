import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { NotificationBell } from '../NotificationBell';
import notificationService from '../../services/notificationService';
import './Topbar.css';

export const Topbar = ({ onToggleSidebar }) => {
  const { user, logout } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [supported, setSupported] = useState(true);

  const fetchNotificationData = useCallback(async () => {
    try {
      const [resList, count] = await Promise.all([
        notificationService.getNotifications(0, 20),
        notificationService.getUnreadCount(),
      ]);
      setNotifications(resList?.items || []);
      setSupported(resList?.supported ?? true);
      setUnreadCount(typeof count === 'number' ? count : (resList?.unread_count || 0));
    } catch {
      setSupported(false);
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (user) {
      fetchNotificationData();
    }
    return () => {
      isMounted = false;
    };
  }, [user, fetchNotificationData]);

  const handleMarkAsRead = async (id) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Keep UI stable if call fails
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // Keep UI stable if call fails
    }
  };

  const handleDelete = async (id) => {
    try {
      await notificationService.deleteNotification(id);
      setNotifications((prev) => {
        const item = prev.find((n) => n.id === id);
        if (item && !item.is_read) {
          setUnreadCount((count) => Math.max(0, count - 1));
        }
        return prev.filter((n) => n.id !== id);
      });
    } catch {
      // Keep UI stable if call fails
    }
  };

  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar-left">
        <button
          className="mobile-toggle-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar menu"
          data-testid="sidebar-toggle-btn"
        >
          ☰
        </button>
        <h2 className="topbar-page-title">Blood Donation Management</h2>
      </div>

      <div className="topbar-right">
        <NotificationBell
          unreadCount={unreadCount}
          notifications={notifications}
          supported={supported}
          onMarkAsRead={handleMarkAsRead}
          onMarkAllAsRead={handleMarkAllAsRead}
          onDelete={handleDelete}
        />

        {user && (
          <div className="topbar-user-badge" data-testid="topbar-user-badge">
            <span data-testid="topbar-user-name">{user.full_name}</span>
            <span className="user-badge-role" data-testid="topbar-user-role">
              {user.role}
            </span>
          </div>
        )}

        <button
          className="topbar-logout-btn"
          onClick={logout}
          aria-label="Log out"
          data-testid="logout-btn"
        >
          Logout
        </button>
      </div>
    </header>
  );
};

export default Topbar;
