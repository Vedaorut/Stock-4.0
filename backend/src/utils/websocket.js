/**
 * WebSocket utility for broadcasting events to clients
 * FIX P1: Added authentication-aware broadcasting with shop filtering
 */

import logger from './logger.js';

let wssInstance = null;

/**
 * Initialize WebSocket server instance
 * Called from server.js after WebSocket server is created
 */
export function initWebSocket(wss) {
  wssInstance = wss;
}

/**
 * Broadcast event to all authenticated WebSocket clients
 * FIX P1: Only sends to authenticated clients (isAuthenticated = true)
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
export function broadcast(event, data) {
  if (!wssInstance) {
    logger.warn('[WebSocket] Instance not initialized, skipping broadcast');
    return;
  }

  const message = JSON.stringify({
    type: event,
    data,
    timestamp: Date.now(),
  });

  let sentCount = 0;
  wssInstance.clients.forEach((client) => {
    // FIX P1: Only send to authenticated and open clients
    if (client.readyState === 1 && client.isAuthenticated) {
      client.send(message);
      sentCount++;
    }
  });

  if (sentCount > 0) {
    logger.debug('[WebSocket] Broadcasted event', { event, clientCount: sentCount });
  }
}

/**
 * Broadcast event to clients subscribed to a specific shop
 * FIX P1: Proper room-based filtering - only sends to clients who subscribed to this shopId
 *
 * @param {number} shopId - Shop ID to filter by
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
export function broadcastToShop(shopId, event, data) {
  if (!wssInstance) {
    logger.warn('[WebSocket] Instance not initialized, skipping broadcast');
    return;
  }

  const message = JSON.stringify({
    type: event,
    data: { ...data, shopId },
    timestamp: Date.now(),
  });

  let sentCount = 0;
  const targetShopId = parseInt(shopId, 10);

  wssInstance.clients.forEach((client) => {
    // Only send to authenticated clients who subscribed to this shop
    if (
      client.readyState === 1 &&
      client.isAuthenticated &&
      client.subscribedShops?.has(targetShopId)
    ) {
      client.send(message);
      sentCount++;
    }
  });

  if (sentCount > 0) {
    logger.debug('[WebSocket] Broadcasted to shop', { event, shopId, clientCount: sentCount });
  }
}

/**
 * Broadcast event to a specific user by userId
 * Useful for personal notifications (order updates, payment confirmations)
 *
 * @param {number} userId - User ID to send to
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
export function broadcastToUser(userId, event, data) {
  if (!wssInstance) {
    logger.warn('[WebSocket] Instance not initialized, skipping broadcast');
    return;
  }

  const message = JSON.stringify({
    type: event,
    data,
    timestamp: Date.now(),
  });

  let sentCount = 0;

  wssInstance.clients.forEach((client) => {
    if (
      client.readyState === 1 &&
      client.isAuthenticated &&
      client.userId === userId
    ) {
      client.send(message);
      sentCount++;
    }
  });

  if (sentCount > 0) {
    logger.debug('[WebSocket] Broadcasted to user', { event, userId, clientCount: sentCount });
  }
}

/**
 * @deprecated Use broadcastToShop instead
 * Kept for backwards compatibility
 */
export function broadcastToRoom(room, event, data) {
  // Parse room format "shop:123" to extract shopId
  if (room.startsWith('shop:')) {
    const shopId = parseInt(room.split(':')[1], 10);
    broadcastToShop(shopId, event, data);
  } else {
    // Fallback to broadcast with room in data
    broadcast(event, { ...data, room });
  }
}
