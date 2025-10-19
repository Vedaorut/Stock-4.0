import logger from '../utils/logger.js';
import { maskString } from '../utils/helpers.js';

/**
 * Request logger middleware
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log request
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    logger.info('Response sent', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id
    });
  });

  next();
};

/**
 * Sensitive data logger (masks passwords, tokens, etc.)
 */
export const sensitiveDataLogger = (req, res, next) => {
  const startTime = Date.now();

  // Clone body and mask sensitive fields
  const logBody = { ...req.body };
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'privateKey'];

  for (const field of sensitiveFields) {
    if (logBody[field]) {
      logBody[field] = maskString(logBody[field], 2);
    }
  }

  logger.debug('Request details', {
    method: req.method,
    path: req.path,
    body: logBody,
    query: req.query,
    params: req.params,
    ip: req.ip,
    userId: req.user?.id
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;

    if (res.statusCode >= 400) {
      logger.warn('Request failed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userId: req.user?.id
      });
    }
  });

  next();
};

/**
 * Error request logger
 */
export const errorRequestLogger = (err, req, res, next) => {
  logger.error('Request error', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
    body: req.body,
    params: req.params,
    query: req.query,
    ip: req.ip,
    userId: req.user?.id
  });

  next(err);
};

export default {
  requestLogger,
  sensitiveDataLogger,
  errorRequestLogger
};
