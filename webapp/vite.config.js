/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import compression from 'vite-plugin-compression';
import { VitePWA } from 'vite-plugin-pwa';

const dropConsole = process.env.DROP_CONSOLE === 'true';

/**
 * Build-time environment validation plugin
 * Warns about missing environment variables during build
 */
function envValidationPlugin() {
  return {
    name: 'env-validation',
    buildStart() {
      const warnings = [];

      // VITE_API_URL - warn if not set (will use fallback)
      if (!process.env.VITE_API_URL) {
        warnings.push('VITE_API_URL not set - API calls will use relative URLs or fallback');
      }

      // VITE_BOT_USERNAME - warn if not set (needed for bot links)
      if (!process.env.VITE_BOT_USERNAME) {
        warnings.push('VITE_BOT_USERNAME not set - bot links may not work correctly');
      }

      // VITE_SENTRY_DSN - info if not set (optional for error tracking)
      if (!process.env.VITE_SENTRY_DSN && process.env.NODE_ENV === 'production') {
        warnings.push('VITE_SENTRY_DSN not set - error tracking disabled in production');
      }

      // Log warnings via console.error (ESLint only allows console.error)
      if (warnings.length > 0) {
        console.error('\n[Vite Build] Environment warnings:');
        warnings.forEach((w) => console.error(`  - ${w}`));
        console.error('');
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    envValidationPlugin(),
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024, // Only compress files > 1KB
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'Status Stock',
        short_name: 'StatusStock',
        description: 'Telegram E-Commerce Platform',
        theme_color: '#181818',
        background_color: '#181818',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
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
    // SECURITY FIX: Disable source maps in production to prevent code exposure
    sourcemap: process.env.NODE_ENV === 'development',
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
