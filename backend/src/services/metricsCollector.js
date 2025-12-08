/**
 * P0 Metrics Collector
 * In-memory metrics with rolling windows for production monitoring
 */

class RollingBuffer {
  constructor(windowMs = 5 * 60 * 1000) {
    this.windowMs = windowMs;
    this.events = [];
  }

  add(value = 1) {
    this.events.push({ time: Date.now(), value });
    this.cleanup();
  }

  cleanup() {
    const cutoff = Date.now() - this.windowMs;
    this.events = this.events.filter(e => e.time > cutoff);
  }

  count() {
    this.cleanup();
    return this.events.length;
  }

  sum() {
    this.cleanup();
    return this.events.reduce((acc, e) => acc + e.value, 0);
  }

  rate(perMs = 60000) {
    this.cleanup();
    if (this.events.length === 0) {return 0;}
    const windowMs = Math.min(this.windowMs, Date.now() - this.events[0]?.time || this.windowMs);
    return (this.count() / windowMs) * perMs;
  }
}

class LatencyHistogram {
  constructor(maxSamples = 1000) {
    this.maxSamples = maxSamples;
    this.samples = [];
  }

  record(latencyMs) {
    this.samples.push(latencyMs);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  percentile(p) {
    if (this.samples.length === 0) {return 0;}
    const sorted = [...this.samples].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  getStats() {
    return {
      p50: Math.round(this.percentile(50)),
      p95: Math.round(this.percentile(95)),
      p99: Math.round(this.percentile(99))
    };
  }
}

class MetricsCollector {
  constructor() {
    this.errors5xx = new RollingBuffer(5 * 60 * 1000);
    this.errors4xx = new RollingBuffer(5 * 60 * 1000);
    this.workerErrors = new RollingBuffer(5 * 60 * 1000);
    this.webhookFailures = new RollingBuffer(5 * 60 * 1000);
    this.needsReviewOrders = new RollingBuffer(60 * 60 * 1000);
    this.requests = new RollingBuffer(5 * 60 * 1000);
    this.latency = new LatencyHistogram(1000);
    this.activeConnections = 0;
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  record5xx() { this.errors5xx.add(); }
  record4xx() { this.errors4xx.add(); }
  recordWorkerError() { this.workerErrors.add(); }
  recordWebhookFailure() { this.webhookFailures.add(); }
  recordNeedsReview() { this.needsReviewOrders.add(); }
  recordRequest(latencyMs) { this.requests.add(); this.latency.record(latencyMs); }
  connectionStart() { this.activeConnections++; }
  connectionEnd() { this.activeConnections = Math.max(0, this.activeConnections - 1); }

  getMetrics() {
    return {
      errors: {
        count5xxLast5m: this.errors5xx.count(),
        count4xxLast5m: this.errors4xx.count(),
        rate5xxPerMin: Math.round(this.errors5xx.rate() * 100) / 100,
        workerErrorsLast5m: this.workerErrors.count(),
        webhookFailuresLast5m: this.webhookFailures.count()
      },
      orders: {
        needsReviewLast1h: this.needsReviewOrders.count(),
        needsReviewRatePerHour: Math.round(this.needsReviewOrders.rate(3600000) * 100) / 100
      },
      traffic: {
        requestsLast5m: this.requests.count(),
        rps: Math.round(this.requests.rate(1000) * 100) / 100,
        activeConnections: this.activeConnections
      },
      latency: this.latency.getStats()
    };
  }

  getGoldenSignals(dbPool = null) {
    const metrics = this.getMetrics();
    const memUsage = process.memoryUsage();
    return {
      latency: metrics.latency,
      traffic: { rps: metrics.traffic.rps, activeConnections: metrics.traffic.activeConnections },
      errors: {
        rate5xx: metrics.errors.rate5xxPerMin > 0
          ? Math.round((metrics.errors.count5xxLast5m / Math.max(1, metrics.traffic.requestsLast5m)) * 100) / 100 : 0,
        count5xxLast5m: metrics.errors.count5xxLast5m
      },
      saturation: {
        memoryUsage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100) / 100,
        dbPoolUsage: dbPool ? Math.round((dbPool.totalCount - dbPool.idleCount) / dbPool.totalCount * 100) / 100 : null,
        dbPool: dbPool ? { total: dbPool.totalCount, idle: dbPool.idleCount, waiting: dbPool.waitingCount } : null
      }
    };
  }

  checkThresholds() {
    const alerts = [];
    const m = this.getMetrics();
    if (m.errors.rate5xxPerMin > 10) {alerts.push({ type: '5xx_spike', severity: 'critical', message: `5xx rate: ${m.errors.rate5xxPerMin}/min` });}
    if (m.orders.needsReviewRatePerHour > 5) {alerts.push({ type: 'needs_review_growth', severity: 'warning', message: `needs_review: ${m.orders.needsReviewRatePerHour}/hour` });}
    if (m.errors.workerErrorsLast5m > 5) {alerts.push({ type: 'worker_errors', severity: 'warning', message: `Worker errors: ${m.errors.workerErrorsLast5m}` });}
    if (m.errors.webhookFailuresLast5m > 3) {alerts.push({ type: 'webhook_failures', severity: 'warning', message: `Webhook failures: ${m.errors.webhookFailuresLast5m}` });}
    if (m.latency.p99 > 3000) {alerts.push({ type: 'high_latency', severity: 'warning', message: `P99: ${m.latency.p99}ms` });}
    return alerts;
  }

  cleanup() {
    this.errors5xx.cleanup();
    this.errors4xx.cleanup();
    this.workerErrors.cleanup();
    this.webhookFailures.cleanup();
    this.needsReviewOrders.cleanup();
    this.requests.cleanup();
  }

  shutdown() { if (this.cleanupInterval) {clearInterval(this.cleanupInterval);} }
}

const metricsCollector = new MetricsCollector();
export default metricsCollector;
export { MetricsCollector, RollingBuffer, LatencyHistogram };
