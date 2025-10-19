import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import { config } from './config/env.js';
import { testConnection, closePool } from './config/database.js';

// Import middleware
import {
  errorHandler,
  notFoundHandler,
  apiLimiter,
  requestLogger,
  sensitiveDataLogger
} from './middleware/index.js';

// Import logger
import logger from './utils/logger.js';

// Import routes
import authRoutes from './routes/auth.js';
import shopRoutes from './routes/shops.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import subscriptionRoutes from './routes/subscriptions.js';

/**
 * Initialize Express app
 */
const app = express();

/**
 * Security middleware
 */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

/**
 * CORS configuration
 */
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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
 * Body parser middleware
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv
  });
});

/**
 * API routes
 */
app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

/**
 * 404 handler
 */
app.use(notFoundHandler);

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

    // Start HTTP server
    const server = app.listen(config.port, () => {
      logger.info('Server started successfully', {
        environment: config.nodeEnv,
        port: config.port,
        database: 'Connected'
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
    });

    // Setup WebSocket server for real-time updates
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws, req) => {
      logger.info('WebSocket client connected', {
        ip: req.socket.remoteAddress
      });

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          logger.debug('WebSocket message received', { data });

          // Handle different message types
          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
        } catch (error) {
          logger.error('WebSocket message error', {
            error: error.message
          });
        }
      });

      ws.on('close', () => {
        logger.info('WebSocket client disconnected');
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', {
          error: error.message
        });
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to Telegram Shop WebSocket',
        timestamp: Date.now()
      }));
    });

    // Broadcast function for real-time updates
    global.broadcastUpdate = (data) => {
      wss.clients.forEach((client) => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify(data));
        }
      });
    };

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received, shutting down gracefully...`);

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
      stack: error.stack
    });
    process.exit(1);
  }
};

// Start the server
startServer();

export default app;
