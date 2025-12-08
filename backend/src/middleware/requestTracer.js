/**
 * Request Tracer Middleware - Adds unique requestId to every request
 */

import { randomUUID } from 'crypto';
import metricsCollector from '../services/metricsCollector.js';

function generateRequestId() {
  return randomUUID();
}

export function requestTracerMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || generateRequestId();
  req.requestId = requestId;
  req.startTime = Date.now();
  res.setHeader('X-Request-Id', requestId);
  metricsCollector.connectionStart();

  res.on('finish', () => {
    const latencyMs = Date.now() - req.startTime;
    metricsCollector.connectionEnd();
    metricsCollector.recordRequest(latencyMs);
    if (res.statusCode >= 500) {metricsCollector.record5xx();}
    else if (res.statusCode >= 400) {metricsCollector.record4xx();}
  });

  next();
}

export function errorRequestIdMiddleware(err, req, res, next) {
  if (req.requestId && !res.headersSent) {res.setHeader('X-Request-Id', req.requestId);}
  next(err);
}

export function getRequestId(req) {
  return req?.requestId || 'no-request-context';
}

export default requestTracerMiddleware;
