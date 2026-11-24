import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Donors } from './pages/Donors';
import { Donations } from './pages/Donations';
import { BloodStock } from './pages/BloodStock';
import { BloodRequests } from './pages/BloodRequests';
import { Users } from './pages/Users';
import { AuditLogs } from './pages/AuditLogs';
import { Reports } from './pages/Reports';
import { SystemSettings } from './pages/SystemSettings';
import { BackupManagement } from './pages/BackupManagement';
import { SystemHealth } from './pages/SystemHealth';
import { DataImport } from './pages/DataImport';
import { Profile } from './pages/Profile';
import { NotFound } from './pages/NotFound';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardLayout } from './components/layout/DashboardLayout';

// Public Route guard: if authenticated, redirect to '/'
const PublicOnlyRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

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

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Dashboard />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/donors"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Donors />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/donations"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Donations />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <BloodStock />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/requests"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <BloodRequests />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute requiredRole="admin">
              <DashboardLayout>
                <Users />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit-logs"
          element={
            <ProtectedRoute requiredRole="admin">
              <DashboardLayout>
                <AuditLogs />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute requiredRole={["admin", "staff"]}>
              <DashboardLayout>
                <Reports />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute requiredRole="admin">
              <DashboardLayout>
                <SystemSettings />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/backups"
          element={
            <ProtectedRoute requiredRole="admin">
              <DashboardLayout>
                <BackupManagement />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/health"
          element={
            <ProtectedRoute requiredRole="admin">
              <DashboardLayout>
                <SystemHealth />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/imports"
          element={
            <ProtectedRoute requiredRole={["admin", "staff"]}>
              <DashboardLayout>
                <DataImport />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Profile />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
