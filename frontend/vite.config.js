
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    host: 'localhost',
  },

  // Railway Production Preview Configuration
  preview: {
    host: '0.0.0.0',
    allowedHosts: [
      'frontend-production-ce169c1e.up.railway.app',
    ],
  },

  test: {
    environment: 'jsdom',
    globals: true,
    clearMocks: true,
  },
});
