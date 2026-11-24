import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationBell } from '../NotificationBell';
import { Topbar } from '../layout/Topbar';
import * as AuthContextModule from '../../context/AuthContext';
import notificationService from '../../services/notificationService';

describe('NotificationBell Component', () => {
  it('renders bell button and SVG icon', () => {
    render(<NotificationBell unreadCount={0} notifications={[]} supported={false} />);
    const bellBtn = screen.getByTestId('notification-bell-btn');
    expect(bellBtn).toBeDefined();
    expect(screen.getByTestId('bell-svg-icon')).toBeDefined();
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });

  it('renders badge when unreadCount > 0', () => {
    render(<NotificationBell unreadCount={5} notifications={[]} supported={true} />);
    const badge = screen.getByTestId('notification-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe('5');
  });

  it('caps unread badge at 99+ when greater than 99', () => {
    render(<NotificationBell unreadCount={120} notifications={[]} supported={true} />);
    const badge = screen.getByTestId('notification-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe('99+');
  });

  it('opens dropdown when bell button is clicked', () => {
    render(<NotificationBell unreadCount={0} notifications={[]} supported={false} />);
    expect(screen.queryByTestId('notification-dropdown')).toBeNull();

    fireEvent.click(screen.getByTestId('notification-bell-btn'));
    expect(screen.getByTestId('notification-dropdown')).toBeDefined();
    expect(screen.getByText('Notifications')).toBeDefined();
  });

  it('shows not-supported informational message when backend does not support notifications', () => {
    render(<NotificationBell unreadCount={0} notifications={[]} supported={false} />);
    fireEvent.click(screen.getByTestId('notification-bell-btn'));

    expect(screen.getByTestId('notification-not-supported')).toBeDefined();
    expect(screen.getByText('No Notifications')).toBeDefined();
    expect(screen.getByText(/Notification support is not yet available/i)).toBeDefined();
    expect(screen.getByTestId('notification-footer-note').textContent).toBe('Feature coming soon');
  });

  it('shows empty state when supported is true and notifications is empty', () => {
    render(<NotificationBell unreadCount={0} notifications={[]} supported={true} />);
    fireEvent.click(screen.getByTestId('notification-bell-btn'));

    expect(screen.getByTestId('notification-empty')).toBeDefined();
    expect(screen.getByText('All caught up!')).toBeDefined();
    expect(screen.getByText('You have no new notifications.')).toBeDefined();
    expect(screen.getByTestId('notification-footer-note').textContent).toBe('0 notifications');
  });

  it('renders list of notifications with titles and categories', () => {
    const mockItems = [
      { id: 1, title: 'Donation Ready', message: 'Your blood donation is approved', category: 'donation', is_read: false, created_at: '2026-11-19T10:00:00Z' },
      { id: 2, title: 'Stock Low', message: 'Stock update: O- is low', category: 'stock', is_read: true, created_at: '2026-11-18T10:00:00Z' },
    ];
    render(<NotificationBell unreadCount={1} notifications={mockItems} supported={true} />);
    fireEvent.click(screen.getByTestId('notification-bell-btn'));

    expect(screen.getByTestId('notification-list')).toBeDefined();
    expect(screen.getByText('Donation Ready')).toBeDefined();
    expect(screen.getByText('Your blood donation is approved')).toBeDefined();
    expect(screen.getByTestId('category-badge-1').textContent).toBe('donation');
    expect(screen.getByText('Stock Low')).toBeDefined();
    expect(screen.getByTestId('category-badge-2').textContent).toBe('stock');
    expect(screen.getByTestId('notification-footer-note').textContent).toBe('2 notifications');
  });

  it('triggers onMarkAsRead when clicking mark-read button', () => {
    const onMarkAsRead = vi.fn();
    const mockItems = [
      { id: 10, title: 'Test Item', message: 'Message here', category: 'system', is_read: false },
    ];
    render(
      <NotificationBell
        unreadCount={1}
        notifications={mockItems}
        supported={true}
        onMarkAsRead={onMarkAsRead}
      />
    );
    fireEvent.click(screen.getByTestId('notification-bell-btn'));

    const markBtn = screen.getByTestId('mark-read-btn-10');
    fireEvent.click(markBtn);
    expect(onMarkAsRead).toHaveBeenCalledWith(10);
  });

  it('triggers onDelete when clicking delete button', () => {
    const onDelete = vi.fn();
    const mockItems = [
      { id: 20, title: 'Delete me', message: 'Message to delete', category: 'system', is_read: true },
    ];
    render(
      <NotificationBell
        unreadCount={0}
        notifications={mockItems}
        supported={true}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByTestId('notification-bell-btn'));

    const delBtn = screen.getByTestId('delete-btn-20');
    fireEvent.click(delBtn);
    expect(onDelete).toHaveBeenCalledWith(20);
  });

  it('triggers onMarkAllAsRead when clicking Mark all read in header', () => {
    const onMarkAllAsRead = vi.fn();
    const mockItems = [
      { id: 1, title: 'Item 1', message: 'Msg 1', is_read: false },
    ];
    render(
      <NotificationBell
        unreadCount={1}
        notifications={mockItems}
        supported={true}
        onMarkAllAsRead={onMarkAllAsRead}
      />
    );
    fireEvent.click(screen.getByTestId('notification-bell-btn'));

    const markAllBtn = screen.getByTestId('mark-all-read-btn');
    fireEvent.click(markAllBtn);
    expect(onMarkAllAsRead).toHaveBeenCalled();
  });

  it('closes dropdown when close button is clicked', () => {
    render(<NotificationBell unreadCount={0} notifications={[]} supported={false} />);
    fireEvent.click(screen.getByTestId('notification-bell-btn'));
    expect(screen.getByTestId('notification-dropdown')).toBeDefined();

    fireEvent.click(screen.getByTestId('notification-close-btn'));
    expect(screen.queryByTestId('notification-dropdown')).toBeNull();
  });

  it('closes dropdown when Escape key is pressed', () => {
    render(<NotificationBell unreadCount={0} notifications={[]} supported={false} />);
    fireEvent.click(screen.getByTestId('notification-bell-btn'));
    expect(screen.getByTestId('notification-dropdown')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('notification-dropdown')).toBeNull();
  });
});

describe('Topbar with NotificationBell Live Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { full_name: 'Kyaw Moe Naing', role: 'admin' },
      logout: vi.fn(),
      isAuthenticated: true,
    });
  });

  it('renders topbar with NotificationBell and user info', async () => {
    render(<Topbar onToggleSidebar={vi.fn()} />);

    expect(screen.getByTestId('topbar')).toBeDefined();
    expect(screen.getByTestId('notification-bell-btn')).toBeDefined();
    expect(screen.getByTestId('topbar-user-name').textContent).toBe('Kyaw Moe Naing');
    expect(screen.getByTestId('topbar-user-role').textContent).toBe('admin');
  });

  it('fetches notifications and unread count on mount when user is authenticated', async () => {
    const spyGet = vi.spyOn(notificationService, 'getNotifications').mockResolvedValueOnce({
      items: [{ id: 1, title: 'Welcome', message: 'Hello', category: 'system', is_read: false }],
      total: 1,
      unread_count: 1,
      supported: true,
    });
    const spyCount = vi.spyOn(notificationService, 'getUnreadCount').mockResolvedValueOnce(1);

    render(<Topbar onToggleSidebar={vi.fn()} />);

    await waitFor(() => {
      expect(spyGet).toHaveBeenCalled();
      expect(spyCount).toHaveBeenCalled();
    });
  });
});
