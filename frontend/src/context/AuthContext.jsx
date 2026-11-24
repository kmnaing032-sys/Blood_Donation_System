import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import authService, {
  login as authServiceLogin,
  logout as authServiceLogout,
  getCurrentUser as authServiceGetCurrentUser,
  refreshSession as authServiceRefreshSession,
  getStoredRefreshToken,
  getStoredUser,
  clearAuthSession,
} from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize Auth state on mount
  const initializeAuth = useCallback(async () => {
    setLoading(true);
    setError(null);

    const refreshToken = getStoredRefreshToken();

    // If no refresh token exists, there is no session to restore.
    if (!refreshToken) {
      clearAuthSession();
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      // Step 1: Attempt to refresh session to obtain active access token
      await authServiceRefreshSession();
      // Step 2: Fetch current user profile with the new access token
      const currentUser = await authServiceGetCurrentUser();
      setUser(currentUser);
    } catch (err) {
      // Session invalid, expired, or revoked
      clearAuthSession();
      setUser(null);
      // We don't necessarily treat a missing/expired session on startup as a fatal error state
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Login handler
  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      await authServiceLogin(email, password);
      const currentUser = await authServiceGetCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch (err) {
      const errorMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'Login failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Logout handler
  const logout = useCallback(() => {
    authServiceLogout();
    setUser(null);
    setError(null);
  }, []);

  const updateCurrentUser = useCallback((updatedUser) => {
    setUser(updatedUser);
    authService.storeUser(updatedUser);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      isAuthenticated: Boolean(user),
      login,
      logout,
      updateCurrentUser,
      initializeAuth,
    }),
    [user, loading, error, login, logout, updateCurrentUser, initializeAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
