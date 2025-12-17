import logger from './logger.js';

/**
 * Order State Machine Definition
 * Digital goods - no shipping, instant delivery
 *
 * DB constraint: pending, confirmed, shipped, delivered, cancelled
 *
 * Flow:
 * - pending: Awaiting payment
 * - confirmed: Payment confirmed (buyer sees seller contact)
 * - delivered: Goods delivered / order completed
 * - cancelled: Order cancelled
 */
const ORDER_STATE_MACHINE = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['delivered', 'cancelled'],
  delivered: [],  // Terminal state
  cancelled: [],  // Terminal state
};

/**
 * Validate status transition from currentStatus to newStatus
 * @param {string} currentStatus - Current order status
 * @param {string} newStatus - Desired new status
 * @returns {Object} { valid: boolean, idempotent?: boolean, error?: string }
 */
export const validateStatusTransition = (currentStatus, newStatus) => {
  // Same status - idempotent operation
  if (currentStatus === newStatus) {
    return {
      valid: true,
      idempotent: true,
    };
  }

  // Check if current status exists in state machine
  const allowedTransitions = ORDER_STATE_MACHINE[currentStatus];
  if (!allowedTransitions) {
    logger.warn(`Invalid order status in database: ${currentStatus}`);
    return {
      valid: false,
      error: `Unknown current status: ${currentStatus}`,
    };
  }

  // Check if new status is in allowed transitions
  if (!allowedTransitions.includes(newStatus)) {
    logger.warn(`Invalid state transition attempted: ${currentStatus} → ${newStatus}`);
    return {
      valid: false,
      error: `Cannot transition from ${currentStatus} to ${newStatus}`,
    };
  }

  // Valid state transition
  return {
    valid: true,
    idempotent: false,
  };
};

/**
 * Get all valid transitions for a status
 * Useful for frontend to show allowed next actions
 * @param {string} status - Current order status
 * @returns {string[]} Array of allowed next statuses
 */
export const getValidTransitions = (status) => {
  return ORDER_STATE_MACHINE[status] || [];
};

/**
 * Check if status is terminal (no further transitions possible)
 * @param {string} status - Order status
 * @returns {boolean} True if terminal
 */
export const isTerminalStatus = (status) => {
  const transitions = ORDER_STATE_MACHINE[status];
  return Array.isArray(transitions) && transitions.length === 0;
};

export { ORDER_STATE_MACHINE };
