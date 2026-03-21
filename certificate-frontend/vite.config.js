// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Expose to local network so phones on same WiFi can access it
    host: true,   // same as "0.0.0.0"
    port: 5174,
  }
});