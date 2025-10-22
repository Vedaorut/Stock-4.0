/**
 * Test App Helper
 * Creates Express app instance for testing
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Import routes
import authRoutes from '../../src/routes/auth.js';
import shopRoutes from '../../src/routes/shops.js';
import productRoutes from '../../src/routes/products.js';
import orderRoutes from '../../src/routes/orders.js';
import paymentRoutes from '../../src/routes/payments.js';
import subscriptionRoutes from '../../src/routes/subscriptions.js';
import walletRoutes from '../../src/routes/wallets.js';

// Import middleware
import { errorHandler } from '../../src/middleware/errorHandler.js';

/**
 * Create test app instance
 * Minimal Express app with routes but without WebSocket
 */
export const createTestApp = () => {
  const app = express();

  // Basic middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check (for testing)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', environment: 'test' });
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/shops', shopRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/subscriptions', subscriptionRoutes);
  app.use('/api/wallets', walletRoutes);

  // Error handling
  app.use(errorHandler);

  return app;
};
