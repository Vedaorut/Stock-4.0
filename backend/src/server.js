import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { initWebSocket } from './utils/websocket.js';
import { config } from './config/env.js';

// Initialize Sentry BEFORE any other code (captures all errors)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: config.nodeEnv,
    release: process.env.npm_package_version || '1.0.0',
    tracesSampleRate: config.nodeEnv === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev
    integrations: [
      Sentry.httpIntegration({ tracing: true }),
      Sentry.expressIntegration(),
    ],
    // Don't send PII
    beforeSend(event) {
      // Remove sensitive data from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(bc => {
          if (bc.data?.body) {
            // Mask password, token fields
            const body = typeof bc.data.body === 'string' ? bc.data.body : JSON.stringify(bc.data.body);
            bc.data.body = body.replace(/"(password|token|secret|apiKey)":\s*"[^"]*"/gi, '"$1":"[REDACTED]"');
          }
          return bc;
        });
      }
      return event;
    },
  });
  console.log('✓ Sentry initialized for error tracking');
}
import { testConnection, closePool, warmupPool } from './config/database.js';
import { userQueries } from './database/queries/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import middleware
import {
  errorHandler,
  notFoundHandler,
  apiLimiter,
  requestLogger,
  sensitiveDataLogger,
} from './middleware/index.js';
import { validateOrigin } from './middleware/csrfProtection.js';
import { requestIdMiddleware } from './middleware/requestId.js';

// Import logger
import logger from './utils/logger.js';

// Import schema validator
import { ensureSchemaValid } from './utils/schemaValidator.js';

// Import routes
import authRoutes from './routes/auth.js';
import shopRoutes from './routes/shops.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import subscriptionRoutes from './routes/subscriptions.js';
import followRoutes from './routes/follows.js';
import workerRoutes from './routes/workers.js';
import webhookRoutes from './routes/webhooks.js';
import internalRoutes from './routes/internal.js';
import aiRoutes from './routes/ai.js';
import debugRoutes from './routes/debug.js';
import userRoutes from './routes/users.js';
import feedbackRoutes from './routes/feedback.js';

// Routes registration (will be added after middleware setup)

// Import cron jobs
import { startSyncCron, stopSyncCron } from './jobs/productSyncCron.js';
import { startSubscriptionJobs, stopSubscriptionJobs } from './jobs/subscriptionChecker.js';

// Import order cleanup service
import orderCleanupService from './services/orderCleanupService.js';

// Import invoice cleanup service
import { startInvoiceCleanup } from './services/invoiceCleanupService.js';

// Import payment verification worker
import { startPaymentVerificationWorker, stopPaymentVerificationWorker } from './workers/paymentVerificationWorker.js';

/**
 * Database Sequences Validation
 * Validates that all required wallet address sequences exist in database
 * Prevents crypto payment failures due to missing sequences (migration 033)
 * 
 * Required sequences (created by migration 033):
 * - wallet_address_index_btc
 * - wallet_address_index_eth
 * - wallet_address_index_ltc
 * - wallet_address_index_usdt_trc20
 */
async function validateDatabaseSequences() {
  try {
    const { pool } = await import('./config/database.js');
    
    const requiredSequences = [
      'wallet_address_index_btc',
      'wallet_address_index_eth',
      'wallet_address_index_ltc',
      'wallet_address_index_usdt_trc20',
    ];
    
    // Query to check if all sequences exist
    const query = `
      SELECT 
        sequence_name
      FROM 
        information_schema.sequences
      WHERE 
        sequence_name = ANY($1::text[])
    `;
    
    const result = await pool.query(query, [requiredSequences]);
    const foundSequences = result.rows.map(row => row.sequence_name);
    const missing = requiredSequences.filter(seq => !foundSequences.includes(seq));
    
    if (missing.length > 0) {
      logger.error('❌ CRITICAL: Missing required database sequences!');
      logger.error('');
      logger.error('Missing sequences:');
      missing.forEach(seq => {
        logger.error(`  - ${seq}`);
      });
      logger.error('');
      logger.error('These sequences are required for crypto payment invoice generation.');
      logger.error('Please apply migration 033:');
      logger.error('  psql $DATABASE_URL -f backend/database/migrations/033_add_wallet_address_sequences.sql');
      logger.error('');
      logger.error('Exiting...');
      
      process.exit(1); // Stop server startup
    }
    
    logger.info('✓ Database sequences validation passed');
    logger.info(`✓ Found all ${requiredSequences.length} wallet address sequences`);
  } catch (error) {
    logger.error('❌ Failed to validate database sequences', {
      error: error.message,
      stack: error.stack,
    });
    logger.error('');
    logger.error('Cannot verify required sequences. Check database connection.');
    logger.error('Exiting...');
    process.exit(1);
  }
}

/**
 * ENV Validation - check critical environment variables
 */
function validateEnvironment() {
  // CrystalPay credentials check
  const crystalPayLogin = process.env.CRYSTALPAY_LOGIN;
  const crystalPaySecret = process.env.CRYSTALPAY_SECRET;

  if (!crystalPayLogin || !crystalPaySecret) {
    logger.warn('⚠️ CrystalPay credentials not configured (CRYSTALPAY_LOGIN, CRYSTALPAY_SECRET)');
    logger.warn('Payment processing will not work without CrystalPay configuration');
  } else {
    logger.info('✓ CrystalPay credentials configured');
  }

  logger.info('✓ Environment validation passed');
}

// Call validation BEFORE starting server
validateEnvironment();

/**
 * Initialize Express app
 */
const app = express();

/**
 * Trust proxy - REQUIRED for Cloudflare Tunnel / ngrok / reverse proxies
 * Without this, express-rate-limit fails with ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
 */
app.set('trust proxy', 1);

/**
 * Security middleware
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        scriptSrc: ["'self'", 'https://telegram.org'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: [
          "'self'",
          'ws://localhost:3000',
          'wss://localhost:3000',
          'http://localhost:3000',
          'https://*.ngrok-free.app',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        frameAncestors: [
          "'self'",
          'https://web.telegram.org',
          'https://*.telegram.org',
          'https://telegram.org',
        ],
        formAction: ["'self'"], // Prevent forms from submitting to external domains (CSRF protection)
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow Telegram WebApp embed
    frameguard: false, // Disable X-Frame-Options to allow Telegram iframe
  })
);

/**
 * HTTPS enforcement in production
 */
if (config.nodeEnv === 'production' && process.env.HTTPS_ENABLED === 'true') {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      return next();
    }
    logger.info('HTTP → HTTPS redirect', { url: req.url, ip: req.ip });
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  });

  // Add HSTS header for HTTPS security
  app.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  logger.info('HTTPS enforcement enabled');
}

/**
 * CORS configuration (API-6: Preflight cache added)
 */
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true, // Allow cookies and credentials
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400, // API-6: Cache preflight requests for 24 hours (86400 seconds)
  })
);

/**
 * CSRF Protection
 * Validates Origin/Referer headers to prevent cross-site request forgery
 * Applied to all state-changing requests (POST, PUT, DELETE, PATCH)
 */
app.use(validateOrigin);

/**
 * Compression middleware (GZIP for all responses)
 * Reduces API response size by ~60-70% for JSON
 */
app.use(
  compression({
    filter: (req, res) => {
      // Compress all responses except already compressed formats
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    threshold: 1024, // Only compress responses > 1KB
    level: 6, // Compression level (0-9, 6 is optimal balance)
  })
);

/**
 * Request logging
 */
if (config.nodeEnv === 'development') {
  app.use(sensitiveDataLogger);
} else {
  app.use(requestLogger);
}

/**
 * Rate limiting
 */
app.use('/api/', apiLimiter);

/**
 * Request ID middleware (API-2: X-Request-ID tracing)
 */
app.use(requestIdMiddleware);

/**
 * Body parser middleware
 * ✅ FIX P0-CRITICAL: Save raw body for debugging malformed JSON errors
 */
app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf, encoding) => {
      if (buf && buf.length) {
        // Save raw body to req.rawBody for error logging
        req.rawBody = buf.toString(encoding || 'utf8');
      }
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * ✅ FIX P0-CRITICAL: Body Parser error handler
 * Catches SyntaxError from express.json() when client sends malformed JSON
 * This happens BEFORE validation middleware, so validation logs won't appear
 *
 * Common causes:
 * - Truncated JSON due to unstable network (ngrok tunnel, mobile internet)
 * - Race condition sending incomplete data
 * - Network packet corruption
 */
app.use((error, req, res, next) => {
  // Check if this is a JSON parsing error
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    // ✅ This is the "missing" 400 error that doesn't reach validation middleware!
    logger.error('❌ [BodyParser] Malformed JSON received', {
      path: req.path,
      method: req.method,
      errorMessage: error.message,
      rawBody: req.rawBody || '(empty)',
      contentLength: req.headers['content-length'],
      contentType: req.headers['content-type'],
    });

    return res.status(400).json({
      success: false,
      error: 'Malformed JSON payload',
      details: 'Request body contains invalid JSON syntax',
    });
  }

  // Not a JSON parsing error, pass to next error handler
  next(error);
});

/**
 * Serve static files from webapp/dist (for production-like testing with single ngrok tunnel)
 * This allows serving React app from backend when built with npm run build
 */
const webappDistPath = path.join(__dirname, '../../webapp/dist');
if (fs.existsSync(webappDistPath)) {
  logger.info('Serving webapp static files from:', { path: webappDistPath });
  app.use(express.static(webappDistPath));
} else {
  logger.warn('WebApp dist folder not found. Build webapp with: npm run build:webapp');
}

/**
 * Health check endpoint (API-3: Enhanced with database and memory checks)
 */
app.get('/health', async (req, res) => {
  const health = {
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB',
    },
  };

  // Check database connection
  try {
    const { testConnection } = await import('./config/database.js');
    await testConnection();
    health.database = 'Connected';
  } catch (error) {
    health.success = false;
    health.database = 'Disconnected';
    health.databaseError = error.message;
    return res.status(503).json(health);
  }

  res.status(200).json(health);
});

/**
 * API routes
 */
app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/shops', workerRoutes); // Worker management (mounted on /api/shops)
app.use('/api/workers', workerRoutes); // Worker self-management (mute notifications)
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/follows', followRoutes);
app.use('/api/shop-follows', followRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/webhooks', webhookRoutes); // Crypto payment webhooks
app.use('/api/internal', internalRoutes); // Internal API for bot-backend communication

// Debug routes (development only - protected by authentication)
if (config.nodeEnv === 'development' || process.env.ENABLE_DEBUG_ROUTES === 'true') {
  app.use('/api/debug', debugRoutes);
  logger.info('Debug routes enabled at /api/debug');
}

/**
 * Fallback for React Router: serve index.html for non-API routes
 * This allows client-side routing to work when webapp is served from backend
 */
app.get('*', (req, res, next) => {
  // Skip API routes, webhooks, and file requests (with extensions)
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/webhooks') ||
    req.path.includes('.') ||
    req.path === '/health'
  ) {
    return next();
  }

  const indexPath = path.join(webappDistPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
});

/**
 * 404 handler
 */
app.use(notFoundHandler);

/**
 * Sentry error handler (must be BEFORE custom error handler)
 * Captures all errors and sends to Sentry dashboard
 */
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

/**
 * Global error handler
 */
app.use(errorHandler);

/**
 * Start server
 */
const startServer = async () => {
  try {
    // Test database connection
    await testConnection();

    // Warm up connection pool to avoid cold start latency
    await warmupPool();

    // ✅ REGRESSION PREVENTION: Validate database sequences before starting
    await validateDatabaseSequences();

    // ✅ SCHEMA VALIDATION: Check all required columns exist before starting
    await ensureSchemaValid();

    // Start HTTP server
    const server = app.listen(config.port, () => {
      logger.info('Server started successfully', {
        environment: config.nodeEnv,
        port: config.port,
        database: 'Connected',
      });

      console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║   🚀 Telegram Shop Backend Server                     ║
║                                                        ║
║   Environment: ${config.nodeEnv.padEnd(39)}║
║   Port:        ${config.port.toString().padEnd(39)}║
║   Database:    Connected ✓                            ║
║                                                        ║
║   API:         http://localhost:${config.port}/api              ║
║   Health:      http://localhost:${config.port}/health           ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
      `);

      // Start product sync cron job
      startSyncCron();

      // Start subscription cron jobs
      startSubscriptionJobs();

      // Start order cleanup service
      orderCleanupService.startOrderCleanup();
      logger.info('Order cleanup service started');

      // Start invoice cleanup service (cleanup expired invoices every hour)
      startInvoiceCleanup();
      logger.info('Invoice cleanup service started');

      // Start payment verification worker (verify pending crypto payments every 30 seconds)
      startPaymentVerificationWorker();
      logger.info('Payment verification worker started');
    });

    // Setup WebSocket server for real-time updates
    const wss = new WebSocketServer({ server });

    // Initialize WebSocket module for use in controllers
    initWebSocket(wss);

    /**
     * WebSocket Authorization
     * FIX P1: Validate JWT token on connection to prevent anonymous access
     * Token passed via query parameter: ws://host?token=JWT_TOKEN
     */
    wss.on('connection', async (ws, req) => {
      const ip = req.socket.remoteAddress;

      // Extract token from URL query params
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      // Validate token
      if (!token) {
        logger.warn('[WebSocket] Connection rejected: no token', { ip });
        ws.close(4001, 'Authentication required');
        return;
      }

      let userId = null;
      try {
        // Verify JWT (same logic as auth.js verifyToken)
        const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });

        // Verify user exists in database
        const userExists = await userQueries.findById(decoded.id);
        if (!userExists) {
          logger.warn('[WebSocket] Connection rejected: user not found', {
            ip,
            tokenUserId: decoded.id
          });
          ws.close(4002, 'User not found');
          return;
        }

        // Store user info on the websocket client for filtering broadcasts
        userId = decoded.id;
        ws.userId = userId;
        ws.telegramId = decoded.telegram_id;
        ws.isAuthenticated = true;

        logger.info('[WebSocket] Client authenticated', {
          ip,
          userId,
          telegramId: decoded.telegram_id,
        });
      } catch (error) {
        if (error.name === 'JsonWebTokenError') {
          logger.warn('[WebSocket] Connection rejected: invalid token', { ip });
          ws.close(4003, 'Invalid token');
        } else if (error.name === 'TokenExpiredError') {
          logger.warn('[WebSocket] Connection rejected: token expired', { ip });
          ws.close(4004, 'Token expired');
        } else {
          logger.error('[WebSocket] Connection rejected: auth error', {
            ip,
            error: error.message
          });
          ws.close(4005, 'Authentication error');
        }
        return;
      }

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          logger.debug('WebSocket message received', { data, userId });

          // Handle different message types
          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }

          // Subscribe to specific shop updates
          if (data.type === 'subscribe' && data.shopId) {
            ws.subscribedShops = ws.subscribedShops || new Set();
            ws.subscribedShops.add(parseInt(data.shopId, 10));
            logger.debug('[WebSocket] Client subscribed to shop', {
              userId,
              shopId: data.shopId
            });
          }

          // Unsubscribe from shop
          if (data.type === 'unsubscribe' && data.shopId) {
            if (ws.subscribedShops) {
              ws.subscribedShops.delete(parseInt(data.shopId, 10));
            }
          }
        } catch (error) {
          // API-9: Enhanced error handling for WebSocket messages
          logger.error('WebSocket message error', {
            error: error.message,
            stack: error.stack,
            rawMessage: message?.toString().substring(0, 100), // Log first 100 chars
            userId,
          });

          // Send error response to client
          try {
            ws.send(
              JSON.stringify({
                type: 'error',
                error: 'Invalid message format',
                timestamp: Date.now(),
              })
            );
          } catch (sendError) {
            logger.error('Failed to send error response', { error: sendError.message });
          }
        }
      });

      ws.on('close', (code, reason) => {
        logger.info('WebSocket client disconnected', {
          code,
          reason: reason?.toString() || 'No reason provided',
          userId,
        });
      });

      ws.on('error', (error) => {
        // API-9: Enhanced WebSocket error logging
        logger.error('WebSocket error', {
          error: error.message,
          stack: error.stack,
          code: error.code,
          errno: error.errno,
          userId,
        });
      });

      // Send welcome message with error handling
      try {
        ws.send(
          JSON.stringify({
            type: 'connected',
            message: 'Connected to Telegram Shop WebSocket',
            timestamp: Date.now(),
            userId,
          })
        );
      } catch (error) {
        logger.error('Failed to send welcome message', {
          error: error.message,
          userId,
        });
      }
    });

    // API-9: Global WebSocket server error handler
    wss.on('error', (error) => {
      logger.error('WebSocket server error', {
        error: error.message,
        stack: error.stack,
      });
    });

    // Broadcast function for real-time updates
    global.broadcastUpdate = (data) => {
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          // WebSocket.OPEN
          client.send(JSON.stringify(data));
        }
      });
    };

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received, shutting down gracefully...`);

      // Stop subscription cron jobs
      stopSubscriptionJobs();

      // Stop payment verification worker
      stopPaymentVerificationWorker();

      // Stop Telegram bot
      if (global.botInstance) {
        try {
          await global.botInstance.stop();
          logger.info('Telegram bot stopped');
        } catch (error) {
          logger.error('Error stopping bot:', error);
        }
      }

      // Stop product sync cron job
      stopSyncCron();

      server.close(async () => {
        logger.info('HTTP server closed');

        // Close WebSocket connections
        wss.clients.forEach((client) => {
          client.close();
        });
        wss.close(() => {
          logger.info('WebSocket server closed');
        });

        // Close database pool
        await closePool();

        logger.info('Shutdown complete');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
};

// Start the server (but not in test environment)
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
