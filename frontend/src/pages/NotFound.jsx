import React from 'react';
import { Link } from 'react-router-dom';

export const NotFound = () => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
        padding: '2rem',
        backgroundColor: '#fff5f5',
      }}
    >
      <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>🩸</span>
      <h1 style={{ fontSize: '2.5rem', color: '#991b1b', margin: '0 0 1rem 0' }}>404</h1>
      <h2 style={{ fontSize: '1.25rem', color: '#374151', margin: '0 0 1rem 0' }}>
        Page Not Found
      </h2>
      <p style={{ color: '#64748b', maxWidth: '400px', marginBottom: '1.5rem' }}>
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        to="/"
        style={{
          backgroundColor: '#dc2626',
          color: '#ffffff',
          padding: '0.75rem 1.5rem',
          borderRadius: '8px',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Return to Dashboard
      </Link>
    </div>
  );
};

export default NotFound;
