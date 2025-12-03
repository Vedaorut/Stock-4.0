import pg from 'pg';
import { config } from './env.js';
import logger from '../utils/logger.js';

/**
 * PostgreSQL connection pool
 *
 * For Neon DB in long-running Node.js servers:
 * - Use standard pg driver with -pooler endpoint (PgBouncer)
 * - PgBouncer on Neon side manages connection pooling
 * - TCP connections stay alive (no WebSocket handshake overhead)
 *
 * @neondatabase/serverless is only needed for:
 * - Edge functions (Cloudflare Workers, Vercel Edge)
 * - Serverless functions with short-lived execution
 *
 * Performance comparison:
 * - @neondatabase/serverless Pool: ~1400ms first query (WebSocket handshake)
 * - pg + -pooler endpoint: ~50-100ms (TCP + PgBouncer)
 */
const isNeonDb = config.databaseUrl?.includes('neon.tech');

// Use standard pg Pool for all environments
// For Neon: keep -pooler suffix for PgBouncer connection pooling
const Pool = pg.Pool;

logger.info(`Database driver: pg (${isNeonDb ? 'Neon with PgBouncer' : 'local PostgreSQL'})`);

export const pool = new Pool({
  connectionString: config.databaseUrl, // Keep -pooler suffix for Neon!
  max: isNeonDb ? 20 : 35, // Neon PgBouncer can handle more than serverless driver
  min: isNeonDb ? 5 : 5, // Keep minimum connections alive
  idleTimeoutMillis: isNeonDb ? 300000 : 30000, // 5 min for Neon (long-lived connections)
  connectionTimeoutMillis: isNeonDb ? 10000 : 5000, // Neon needs more time for SSL
  statement_timeout: 30000, // 30 second timeout for long-running queries
  ssl: isNeonDb ? { rejectUnauthorized: false } : false, // SSL required for Neon
});

// Clear cached prepared statements on connect (fixes schema changes after migrations)
pool.on('connect', async (client) => {
  try {
    await client.query('DEALLOCATE ALL');
  } catch (err) {
    // Ignore errors (DEALLOCATE ALL fails if no statements exist)
  }
});

/**
 * P1-DB-004: Connection Pool Metrics
 * Log pool statistics every 60 seconds for monitoring
 */
const logPoolMetrics = () => {
  const totalCount = pool.totalCount;
  const idleCount = pool.idleCount;
  const waitingCount = pool.waitingCount;
  const activeCount = totalCount - idleCount;

  logger.info('Database Pool Metrics', {
    total: totalCount,
    active: activeCount,
    idle: idleCount,
    waiting: waitingCount,
    utilization: totalCount > 0 ? ((activeCount / totalCount) * 100).toFixed(1) + '%' : '0%',
  });

  // Warning if pool is heavily utilized
  if (totalCount > 0 && activeCount / totalCount > 0.8) {
    logger.warn('Database pool utilization high', {
      activeCount,
      totalCount,
      utilization: ((activeCount / totalCount) * 100).toFixed(1) + '%',
    });
  }

  // Warning if requests are waiting
  if (waitingCount > 0) {
    logger.warn('Database pool has waiting requests', {
      waiting: waitingCount,
      suggestion: 'Consider increasing pool.max or optimizing queries',
    });
  }
};

// Log pool metrics every 60 seconds
const poolMetricsInterval = setInterval(logPoolMetrics, 60000);

// Clear interval on pool close
pool.on('remove', () => {
  clearInterval(poolMetricsInterval);
});

/**
 * Test database connection
 */
export const testConnection = async () => {
  try {
    const client = await pool.connect();
    logger.info('Database connected successfully');
    client.release();
    return true;
  } catch (error) {
    logger.error('Database connection error:', { error: error.message, stack: error.stack });
    throw error;
  }
};

/**
 * Warm up connection pool
 * Creates minimum connections at startup to avoid cold start latency
 */
export const warmupPool = async () => {
  const minConnections = 5; // Same for both Neon and local with pg driver
  const clients = [];

  logger.info(`Warming up connection pool (${minConnections} connections)...`);
  const start = Date.now();

  try {
    // Acquire minimum connections in parallel
    for (let i = 0; i < minConnections; i++) {
      clients.push(pool.connect());
    }
    const connected = await Promise.all(clients);

    // Release all connections back to pool
    connected.forEach(client => client.release());

    logger.info(`Pool warmed up in ${Date.now() - start}ms`, {
      total: pool.totalCount,
      idle: pool.idleCount,
    });
  } catch (error) {
    logger.error('Pool warmup failed:', { error: error.message });
    // Don't throw - server can still work with cold pool
  }
};

/**
 * Execute a query
 * P1-DB-008: Slow Query Logging (queries > 1000ms)
 */
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    // P1-DB-008: Log slow queries (> 1000ms) in ALL environments
    if (duration > 1000) {
      logger.warn('Slow query detected', {
        duration: `${duration}ms`,
        query: text.substring(0, 200) + (text.length > 200 ? '...' : ''), // Truncate long queries
        rows: res.rowCount,
        params: params ? (params.length > 5 ? `[${params.length} params]` : params) : undefined,
      });
    }

    if (config.nodeEnv === 'development') {
      logger.debug('Executed query', { text, duration, rows: res.rowCount });
    }

    return res;
  } catch (error) {
    logger.error('Query error:', { error: error.message, stack: error.stack });
    throw error;
  }
};

/**
 * Get a client from the pool for transactions
 */
export const getClient = async () => {
  const client = await pool.connect();
  const release = client.release.bind(client);

  // Set a timeout of 5 seconds, after which we will log this client's last query
  const timeout = setTimeout(() => {
    logger.warn('A client has been checked out for more than 5 seconds!');
  }, 5000);

  // Monkey patch the release method to clear our timeout
  client.release = () => {
    clearTimeout(timeout);
    client.release = release;
    return release();
  };

  return client;
};

/**
 * Graceful shutdown
 */
export const closePool = async () => {
  await pool.end();
  logger.info('Database pool closed');
};

export default {
  pool,
  query,
  getClient,
  testConnection,
  warmupPool,
  closePool,
};
