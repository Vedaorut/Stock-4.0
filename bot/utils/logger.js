/**
 * Simple Logger Utility
 *
 * Structured logging for bot operations
 */

const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

class Logger {
  constructor() {
    this.level = process.env.LOG_LEVEL || 'INFO';
  }

  /**
   * Format log message
   */
  _format(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
    return `[${timestamp}] ${level}: ${message} ${metaStr}`.trim();
  }

  /**
   * Log error
   */
  error(message, meta = {}) {
    console.error(this._format(LOG_LEVELS.ERROR, message, meta));
  }

  /**
   * Log warning
   */
  warn(message, meta = {}) {
    console.warn(this._format(LOG_LEVELS.WARN, message, meta));
  }

  /**
   * Log info
   */
  info(message, meta = {}) {
    console.log(this._format(LOG_LEVELS.INFO, message, meta));
  }

  /**
   * Log debug
   */
  debug(message, meta = {}) {
    if (this.level === 'DEBUG') {
      console.log(this._format(LOG_LEVELS.DEBUG, message, meta));
    }
  }

  /**
   * Log API request
   */
  apiRequest(method, url, userId = null) {
    this.info(`API ${method} ${url}`, { userId });
  }

  /**
   * Log API response
   */
  apiResponse(method, url, status, userId = null) {
    this.info(`API ${method} ${url} - ${status}`, { userId });
  }

  /**
   * Log user action
   */
  userAction(action, userId, meta = {}) {
    this.info(`User action: ${action}`, { userId, ...meta });
  }
}

export default new Logger();
