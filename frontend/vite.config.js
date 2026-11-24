import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: 'localhost',
  },
  test: {
    // Use jsdom to simulate browser APIs (sessionStorage, localStorage, etc.)
    environment: 'jsdom',
    // Make Vitest globals (describe, it, expect, vi) available without import
    globals: true,
    // Clear mocks between each test automatically
    clearMocks: true,
  },
});
