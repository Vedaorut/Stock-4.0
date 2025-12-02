/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const dropConsole = process.env.DROP_CONSOLE === 'true';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/test/**', 'src/**/*.test.{js,jsx}', 'src/main.jsx'],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true, // Enable source maps for debugging minified code
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: dropConsole,
        drop_debugger: dropConsole,
        passes: 2, // More aggressive compression
        pure_funcs: dropConsole ? ['console.log', 'console.info', 'console.debug'] : [],
      },
      mangle: {
        safari10: true, // Better Safari compatibility
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks for better caching
          'react-vendor': ['react', 'react-dom'],
          animation: ['framer-motion'],
          state: ['zustand'],
          // QR code now lazy-loaded, remove from vendor chunk
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'framer-motion', 'zustand'],
  },
});
