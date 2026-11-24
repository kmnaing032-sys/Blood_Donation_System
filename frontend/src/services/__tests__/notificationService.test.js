import { describe, it, expect, vi, beforeEach } from 'vitest';
import notificationService, {
  NOTIFICATIONS_SUPPORTED,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../notificationService';
import apiClient from '../../api/axios';
import { API_ENDPOINTS } from '../../api/endpoints';

vi.mock('../../api/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('notificationService (backend SUPPORTED)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports NOTIFICATIONS_SUPPORTED as true', () => {
    expect(NOTIFICATIONS_SUPPORTED).toBe(true);
  });

  it('getNotifications calls GET /notifications/ with pagination and returns data', async () => {
    const mockData = {
      items: [
        { id: 1, title: 'Stock Alert', message: 'Low O-', category: 'stock', is_read: false },
      ],
      total: 1,
      unread_count: 1,
    };
    apiClient.get.mockResolvedValueOnce({ data: mockData });

    const result = await getNotifications(0, 10);
    expect(apiClient.get).toHaveBeenCalledWith(API_ENDPOINTS.NOTIFICATIONS.LIST, {
      params: { skip: 0, limit: 10 },
    });
    expect(result.items).toEqual(mockData.items);
    expect(result.total).toBe(1);
    expect(result.supported).toBe(true);
  });

  it('getUnreadCount calls GET /notifications/unread-count and returns number', async () => {
    apiClient.get.mockResolvedValueOnce({ data: { unread_count: 3 } });

    const count = await getUnreadCount();
    expect(apiClient.get).toHaveBeenCalledWith(API_ENDPOINTS.NOTIFICATIONS.UNREAD_COUNT);
    expect(count).toBe(3);
  });

  it('markAsRead calls PATCH /notifications/{id}/read', async () => {
    const mockUpdated = { id: 5, is_read: true };
    apiClient.patch.mockResolvedValueOnce({ data: mockUpdated });

    const result = await markAsRead(5);
    expect(apiClient.patch).toHaveBeenCalledWith(API_ENDPOINTS.NOTIFICATIONS.MARK_READ(5));
    expect(result).toEqual(mockUpdated);
  });

  it('markAllAsRead calls POST /notifications/read-all', async () => {
    const mockRes = { message: 'All notifications marked as read', updated_count: 4 };
    apiClient.post.mockResolvedValueOnce({ data: mockRes });

    const result = await markAllAsRead();
    expect(apiClient.post).toHaveBeenCalledWith(API_ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ);
    expect(result).toEqual(mockRes);
  });

  it('deleteNotification calls DELETE /notifications/{id}', async () => {
    const mockRes = { message: 'Notification deleted successfully' };
    apiClient.delete.mockResolvedValueOnce({ data: mockRes });

    const result = await deleteNotification(10);
    expect(apiClient.delete).toHaveBeenCalledWith(API_ENDPOINTS.NOTIFICATIONS.DELETE(10));
    expect(result).toEqual(mockRes);
  });

  it('default export exposes all functions', () => {
    expect(typeof notificationService.getNotifications).toBe('function');
    expect(typeof notificationService.getUnreadCount).toBe('function');
    expect(typeof notificationService.markAsRead).toBe('function');
    expect(typeof notificationService.markAllAsRead).toBe('function');
    expect(typeof notificationService.deleteNotification).toBe('function');
  });
});
