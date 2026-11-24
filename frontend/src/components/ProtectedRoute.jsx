import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute = ({ children, requiredRole = null }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        data-testid="auth-loading"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'system-ui, sans-serif',
          color: '#64748b',
          backgroundColor: '#f8fafc',
        }}
      >
        <span style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🩸</span>
        <p style={{ fontSize: '1rem', fontWeight: 500 }}>Initializing session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Preserve requested location in state so user can be redirected after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // RBAC check: If a specific role is required (or array of roles)
  if (requiredRole) {
    const allowed = Array.isArray(requiredRole)
      ? requiredRole.includes(user?.role)
      : user?.role === requiredRole;

    if (!allowed) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
