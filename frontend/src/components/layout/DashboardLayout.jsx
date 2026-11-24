import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { DeveloperBranding } from '../branding/DeveloperBranding';
import './DashboardLayout.css';

export const DashboardLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="dashboard-layout" data-testid="dashboard-layout">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={closeSidebar}
          data-testid="sidebar-backdrop"
        />
      )}

      <div className="layout-main-wrapper">
        <Topbar onToggleSidebar={toggleSidebar} />
        <main className="layout-content">{children}</main>
        <DeveloperBranding />
      </div>
    </div>
  );
};

export default DashboardLayout;
