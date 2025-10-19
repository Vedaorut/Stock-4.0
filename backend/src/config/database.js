import pg from 'pg';
import { config } from './env.js';
import logger from '../utils/logger.js';

const { Pool } = pg;

/**
 * PostgreSQL connection pool
 */
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
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
 * Execute a query
 */
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

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
  const query = client.query.bind(client);
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
  closePool
};
