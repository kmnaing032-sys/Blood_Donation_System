import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import userService, { USER_ROLES } from '../services/userService';
import { UserFormModal } from '../components/users/UserFormModal';
import { UserDetailModal } from '../components/users/UserDetailModal';
import { DeleteUserConfirmModal } from '../components/users/DeleteUserConfirmModal';
import { ResetPasswordModal } from '../components/users/ResetPasswordModal';
import './Users.css';

export const Users = () => {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  // User list state
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState(null);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedUserForDetail, setSelectedUserForDetail] = useState(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedUserForDelete, setSelectedUserForDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset Password Modal state
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState(null);
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  // Fetch users from API (Admin only)
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await userService.getUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err?.response?.status === 403) {
        setError('Access denied: You must be an administrator to manage user accounts.');
      } else {
        const message =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          'Failed to load user accounts.';
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Client-side filtering & search
  const filteredUsers = users.filter((u) => {
    // Search query filter (matches name or email)
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = u.full_name?.toLowerCase().includes(q);
      const matchEmail = u.email?.toLowerCase().includes(q);
      if (!matchName && !matchEmail) return false;
    }

    // Role filter
    if (roleFilter !== 'all' && u.role !== roleFilter) {
      return false;
    }

    // Status filter
    if (statusFilter === 'active' && !u.is_active) return false;
    if (statusFilter === 'inactive' && u.is_active) return false;

    return true;
  });

  // Handle Form Submission (Create or Edit)
  const handleFormSubmit = async (formData) => {
    setIsSubmittingForm(true);
    setFeedback(null);
    try {
      if (selectedUserForEdit) {
        await userService.updateUser(selectedUserForEdit.id, formData);
        setFeedback({
          type: 'success',
          message: `User ${formData.full_name} updated successfully.`,
        });
      } else {
        await userService.createUser(formData);
        setFeedback({
          type: 'success',
          message: `User account for ${formData.full_name} created successfully.`,
        });
      }
      setIsFormOpen(false);
      setSelectedUserForEdit(null);
      fetchUsers();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to save user account.';
      setFeedback({ type: 'error', message });
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Handle Admin Password Reset
  const handleResetPasswordSubmit = async (newPassword, confirmPassword) => {
    if (!selectedUserForReset || isSubmittingReset) return;
    setIsSubmittingReset(true);
    setFeedback(null);
    try {
      await userService.resetUserPassword(selectedUserForReset.id, newPassword, confirmPassword);
      setFeedback({
        type: 'success',
        message: `Password for ${selectedUserForReset.full_name} (${selectedUserForReset.email}) was reset successfully.`,
      });
      setIsResetOpen(false);
      setSelectedUserForReset(null);
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to reset user password.';
      setFeedback({ type: 'error', message });
    } finally {
      setIsSubmittingReset(false);
    }
  };

  // Handle Direct Status Toggle
  const handleToggleStatus = async (userToToggle) => {
    setFeedback(null);
    try {
      await userService.toggleUserStatus(userToToggle.id, !userToToggle.is_active);
      setFeedback({
        type: 'success',
        message: `Account for ${userToToggle.full_name} is now ${!userToToggle.is_active ? 'ACTIVE' : 'INACTIVE'}.`,
      });
      fetchUsers();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        'Failed to update user status.';
      setFeedback({ type: 'error', message });
    }
  };

  // Handle User Deletion


  const handleDeleteConfirm = async () => {
    if (!selectedUserForDelete || isDeleting) return;

    const deletedUser = selectedUserForDelete;
    const deletedUserId = String(deletedUser.id);

    setIsDeleting(true);
    setFeedback(null);

    try {
      // 1. Send DELETE request to backend
      await userService.deleteUser(deletedUser.id);

      // 2. Immediately remove deleted user from React state
      setUsers((previousUsers) =>
        previousUsers.filter(
          (user) => String(user.id) !== deletedUserId
        )
      );

      // 3. Show success message
      setFeedback({
        type: 'success',
        message: `User ${deletedUser.full_name} was deleted successfully.`,
      });

      // 4. Close confirmation modal only on success
      setIsDeleteOpen(false);
      setSelectedUserForDelete(null);

    } catch (err) {
      // Keep modal open or closed? "Close the confirmation modal only after successful deletion"
      // "If deletion fails, keep the user in the table and show the backend error message."
      let message = 'Failed to delete user account.';

      if (err?.response?.data) {
        const data = err.response.data;
        if (typeof data.message === 'string' && data.message.trim()) {
          message = data.message;
        } else if (typeof data.detail === 'string' && data.detail.trim()) {
          message = data.detail;
        } else if (Array.isArray(data.detail) && data.detail.length > 0) {
          message = data.detail.map((d) => d.message || d.msg || JSON.stringify(d)).join(', ');
        }
      } else if (err?.message) {
        message = err.message;
      }

      setFeedback({
        type: 'error',
        message,
      });
    } finally {
      setIsDeleting(false);
    }
  };


  return (
    <div className="users-page-container" data-testid="users-page">
      {/* Page Header */}
      <div className="users-page-header">
        <div>
          <h1 className="page-title">User Management & RBAC</h1>
          <p className="page-subtitle">
            Admin portal for managing system credentials, role-based access, and account activation.
          </p>
        </div>
        <div className="header-actions">
          {isAdmin && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setSelectedUserForEdit(null);
                setIsFormOpen(true);
              }}
              data-testid="btn-create-user"
            >
              + Create User
            </button>
          )}
        </div>
      </div>

      {/* Dismissible Feedback Banner */}
      {feedback && (
        <div
          className={`alert-banner ${feedback.type === 'error' ? 'alert-danger' : 'alert-success'}`}
          data-testid="feedback-banner"
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            className="alert-close"
            onClick={() => setFeedback(null)}
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Toolbar Controls */}
      <div className="table-controls-bar" data-testid="users-controls">
        <div className="controls-group search-box">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-user-search"
          />
        </div>

        <div className="controls-group">
          <div className="filter-item">
            <label htmlFor="filter-role">Role:</label>
            <select
              id="filter-role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              data-testid="select-filter-role"
            >
              <option value="all">All Roles</option>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label htmlFor="filter-status">Status:</label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              data-testid="select-filter-status"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="users-table-section">
        {loading ? (
          <div className="state-container loading-state" data-testid="users-loading">
            <span className="spinner" />
            <p>Loading user accounts...</p>
          </div>
        ) : error ? (
          <div className="state-container error-state" data-testid="users-error">
            <span className="state-icon">⚠️</span>
            <p>{error}</p>
            {isAdmin && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={fetchUsers}
              >
                Retry
              </button>
            )}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="state-container empty-state" data-testid="users-empty">
            <span className="state-icon">👥</span>
            <h3>No Users Found</h3>
            <p>No user accounts matched the filter criteria.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="users-table" data-testid="users-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Full Name</th>
                  <th>Email</th>
                  <th>System Role</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} data-testid={`user-row-${u.id}`}>
                      <td className="id-cell">#{u.id}</td>
                      <td className="user-name-cell">
                        <strong>{u.full_name}</strong>
                        {isSelf && <span className="self-tag">(You)</span>}
                      </td>
                      <td className="email-cell">{u.email}</td>
                      <td>
                        <span className={`badge-role role-${u.role}`} data-testid={`badge-role-${u.id}`}>
                          {u.role ? u.role.toUpperCase() : 'USER'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge-status status-${u.is_active ? 'active' : 'inactive'}`}
                          data-testid={`badge-status-${u.id}`}
                        >
                          {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="text-right actions-cell">
                        <div className="users-actions-group">
                          {/* View Action */}
                          <button
                            type="button"
                            className="btn-action-outline btn-outline-primary"
                            onClick={() => {
                              setSelectedUserForDetail(u);
                              setIsDetailOpen(true);
                            }}
                            title="View User Details"
                            data-testid={`btn-view-user-${u.id}`}
                          >
                            View
                          </button>

                          {/* Edit Action (Admin only) */}
                          {isAdmin && (
                            <button
                              type="button"
                              className="btn-action-outline btn-outline-primary"
                              onClick={() => {
                                setSelectedUserForEdit(u);
                                setIsFormOpen(true);
                              }}
                              title="Edit User"
                              data-testid={`btn-edit-user-${u.id}`}
                            >
                              Edit
                            </button>
                          )}

                          {/* Reset Password Action (Admin only) */}
                          {isAdmin && (
                            <button
                              type="button"
                              className="btn-action-outline btn-outline-primary"
                              onClick={() => {
                                setSelectedUserForReset(u);
                                setIsResetOpen(true);
                              }}
                              title="Reset User Password"
                              data-testid={`btn-reset-password-${u.id}`}
                            >
                              Reset Password
                            </button>
                          )}

                          {/* Toggle Status Action (Admin only; cannot deactivate self if admin) */}
                          {isAdmin && !(isSelf && u.role === 'admin') && (
                            <button
                              type="button"
                              className={`btn-action-outline ${u.is_active ? 'btn-outline-warning' : 'btn-outline-success'}`}
                              onClick={() => handleToggleStatus(u)}
                              title={u.is_active ? 'Deactivate Account' : 'Activate Account'}
                              data-testid={`btn-toggle-status-${u.id}`}
                            >
                              {u.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          )}

                          {/* Delete Action (Admin only; cannot delete self) */}
                          {isAdmin && !isSelf && (
                            <button
                              type="button"
                              className="btn-action-outline btn-outline-danger"
                              onClick={() => {
                                setSelectedUserForDelete(u);
                                setIsDeleteOpen(true);
                              }}
                              title="Delete User Account"
                              data-testid={`btn-delete-user-${u.id}`}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal (Create or Edit) */}
      <UserFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setSelectedUserForEdit(null);
        }}
        initialData={selectedUserForEdit}
        onSubmit={handleFormSubmit}
        isSubmitting={isSubmittingForm}
        currentUserId={currentUser?.id}
      />

      {/* Detail Modal */}
      <UserDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedUserForDetail(null);
        }}
        user={selectedUserForDetail}
      />

      {/* Delete Confirmation Modal */}
      <DeleteUserConfirmModal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setSelectedUserForDelete(null);
        }}
        user={selectedUserForDelete}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
      />

      {/* Admin Reset Password Modal */}
      <ResetPasswordModal
        isOpen={isResetOpen}
        onClose={() => {
          setIsResetOpen(false);
          setSelectedUserForReset(null);
        }}
        user={selectedUserForReset}
        onSubmit={handleResetPasswordSubmit}
        isSubmitting={isSubmittingReset}
      />
    </div>
  );
};

export default Users;
