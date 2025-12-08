/**
 * Alert Service - Rate-limited alerting with fallback to ERROR logs
 */

import logger from '../utils/logger.js';

class AlertService {
  constructor() {
    this.lastAlerts = new Map();
    this.rateLimitMs = 10 * 60 * 1000;
    this.alertHistory = [];
    this.maxHistory = 100;
  }

  isRateLimited(type) {
    const lastTime = this.lastAlerts.get(type);
    if (!lastTime) {return false;}
    return Date.now() - lastTime < this.rateLimitMs;
  }

  recordAlert(severity, type, message, context = {}) {
    const alert = { severity, type, message, context, timestamp: new Date().toISOString() };
    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > this.maxHistory) {this.alertHistory.pop();}
    this.lastAlerts.set(type, Date.now());
    return alert;
  }

  sendAlert(severity, type, message, context = {}) {
    if (this.isRateLimited(type)) {
      logger.debug("[ALERT-RATE-LIMITED] " + type + ": " + message);
      return null;
    }
    const alert = this.recordAlert(severity, type, message, context);
    const logMessage = "[ALERT][" + severity.toUpperCase() + "][" + type + "] " + message;
    if (severity === 'critical' || severity === 'error') {
      logger.error(logMessage, { alert: true, type, ...context });
    } else if (severity === 'warning') {
      logger.warn(logMessage, { alert: true, type, ...context });
    } else {
      logger.info(logMessage, { alert: true, type, ...context });
    }
    return alert;
  }

  critical(type, message, context = {}) { return this.sendAlert('critical', type, message, context); }
  error(type, message, context = {}) { return this.sendAlert('error', type, message, context); }
  warning(type, message, context = {}) { return this.sendAlert('warning', type, message, context); }
  info(type, message, context = {}) { return this.sendAlert('info', type, message, context); }

  getStatus() {
    const now = Date.now();
    const rateLimits = {};
    for (const [type, lastTime] of this.lastAlerts) {
      const remainingMs = Math.max(0, this.rateLimitMs - (now - lastTime));
      rateLimits[type] = { lastAlert: new Date(lastTime).toISOString(), cooldownRemainingSec: Math.ceil(remainingMs / 1000), isLimited: remainingMs > 0 };
    }
    return { rateLimits, recentAlerts: this.alertHistory.slice(0, 10), totalAlerts: this.alertHistory.length };
  }

  getRateLimitStatus() {
    return this.getStatus().rateLimits;
  }

  async checkAndAlert(metricsCollector) {
    const alerts = metricsCollector.checkThresholds();
    for (const alert of alerts) {
      this.sendAlert(alert.severity, alert.type, alert.message, { value: alert.value });
    }
    return alerts;
  }

  clearRateLimits() { this.lastAlerts.clear(); }
}

const alertService = new AlertService();
export default alertService;
export { AlertService };
