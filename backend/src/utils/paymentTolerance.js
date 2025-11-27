import logger from './logger.js';

/**
 * Payment Tolerance Utility
 *
 * Manages payment tolerance validation with bounds checking:
 * - MAX_TOLERANCE = 1.0 (1.0%) - prevents excessive tolerance
 * - MIN_TOLERANCE = 0.0001 (0.01%) - prevents too-tight tolerance
 * - DEFAULT_TOLERANCE = 0.005 (0.5%) - industry standard
 *
 * Features:
 * - Automatic clamping of values to bounds
 * - Logging when values are out of bounds
 * - Amount matching with tolerance
 */

// Tolerance bounds (as decimal, not percentage)
export const TOLERANCE_BOUNDS = {
  MIN_TOLERANCE: 0.0001, // 0.01% minimum
  MAX_TOLERANCE: 1.0, // 1.0% maximum  
  DEFAULT_TOLERANCE: 0.01, // 1% to accommodate network fees (previously 0.5%)
};

/**
 * Clamp tolerance value to valid bounds
 *
 * @param {number} value - Tolerance value (e.g., 0.005 for 0.5%)
 * @param {string} context - Context for logging (e.g., 'BTC', 'ETH')
 * @returns {number} - Clamped tolerance value
 */
export function clampTolerance(value, context = 'Payment') {
  if (value === undefined || value === null) {
    return TOLERANCE_BOUNDS.DEFAULT_TOLERANCE;
  }

  const { MIN_TOLERANCE, MAX_TOLERANCE, DEFAULT_TOLERANCE: _DEFAULT_TOLERANCE } = TOLERANCE_BOUNDS;

  // If already in bounds, return as-is
  if (value >= MIN_TOLERANCE && value <= MAX_TOLERANCE) {
    return value;
  }

  // If too low
  if (value < MIN_TOLERANCE) {
    logger.warn(`[PaymentTolerance] Tolerance too low for ${context}`, {
      provided: value,
      minimum: MIN_TOLERANCE,
      clamped: MIN_TOLERANCE,
      percentage: `${(MIN_TOLERANCE * 100).toFixed(4)}%`,
    });
    return MIN_TOLERANCE;
  }

  // If too high
  if (value > MAX_TOLERANCE) {
    logger.warn(`[PaymentTolerance] Tolerance too high for ${context}`, {
      provided: value,
      maximum: MAX_TOLERANCE,
      clamped: MAX_TOLERANCE,
      percentage: `${(MAX_TOLERANCE * 100).toFixed(4)}%`,
    });
    return MAX_TOLERANCE;
  }

  return value;
}

/**
 * Validate tolerance value
 *
 * @param {number} value - Tolerance value to validate
 * @returns {object} - { valid: boolean, error?: string, clamped?: number }
 */
export function validateTolerance(value) {
  const { MIN_TOLERANCE, MAX_TOLERANCE } = TOLERANCE_BOUNDS;

  if (value === undefined || value === null) {
    return {
      valid: true,
      clamped: TOLERANCE_BOUNDS.DEFAULT_TOLERANCE,
      message: 'Using default tolerance',
    };
  }

  if (typeof value !== 'number' || isNaN(value)) {
    return {
      valid: false,
      error: 'Tolerance must be a number',
    };
  }

  if (value < 0) {
    return {
      valid: false,
      error: `Tolerance cannot be negative: ${value}`,
    };
  }

  if (value < MIN_TOLERANCE) {
    return {
      valid: false,
      error: `Tolerance too low: ${value} (minimum: ${MIN_TOLERANCE})`,
    };
  }

  if (value > MAX_TOLERANCE) {
    return {
      valid: false,
      error: `Tolerance too high: ${value} (maximum: ${MAX_TOLERANCE})`,
    };
  }

  return {
    valid: true,
  };
}

/**
 * Check if amounts match within tolerance
 *
 * IMPORTANT: For crypto payments:
 * - Overpayment (actual > expected) is ALWAYS accepted
 * - Underpayment within tolerance is accepted
 * - Underpayment outside tolerance is rejected
 *
 * @param {number} actual - Actual amount received
 * @param {number} expected - Expected amount
 * @param {number} tolerance - Tolerance value (default: 0.5%)
 * @param {string} context - Context for logging (e.g., 'BTC', 'ETH', 'USDT')
 * @returns {boolean} - True if amounts match within tolerance
 */
export function amountsMatchWithTolerance(
  actual,
  expected,
  tolerance = TOLERANCE_BOUNDS.DEFAULT_TOLERANCE,
  context = 'Payment'
) {
  // Clamp tolerance to valid bounds
  const clampedTolerance = clampTolerance(tolerance, context);

  // CRITICAL: Always accept overpayment in crypto (actual >= expected)
  if (actual >= expected) {
    return true;
  }

  // For underpayment: check if within tolerance
  const toleranceAmount = expected * clampedTolerance;
  const shortfall = expected - actual; // How much less than expected

  // Use epsilon for floating point comparison to avoid precision issues
  const epsilon = 1e-10;
  const matches = shortfall <= toleranceAmount + epsilon;

  if (!matches) {
    logger.warn(`[PaymentTolerance] Amount mismatch in ${context}`, {
      expected,
      actual,
      shortfall: shortfall.toFixed(8),
      tolerance: clampedTolerance,
      toleranceAmount: toleranceAmount.toFixed(8),
      percentage: `${(clampedTolerance * 100).toFixed(4)}%`,
      exceedsToleranceBy: (shortfall - toleranceAmount).toFixed(8),
    });
  }

  return matches;
}

/**
 * Get tolerance percentage as string
 *
 * @param {number} tolerance - Tolerance value (decimal form)
 * @returns {string} - Percentage string (e.g., "0.5%")
 */
export function toleranceToPercentage(tolerance) {
  return `${(tolerance * 100).toFixed(4)}%`;
}

/**
 * Get tolerance info for logging
 *
 * @param {number} tolerance - Tolerance value
 * @returns {object} - Info object for logging
 */
export function getToleranceInfo(tolerance) {
  const clamped = clampTolerance(tolerance);
  const { MIN_TOLERANCE, MAX_TOLERANCE } = TOLERANCE_BOUNDS;

  return {
    provided: tolerance,
    clamped,
    percentage: toleranceToPercentage(clamped),
    isDefault: tolerance === TOLERANCE_BOUNDS.DEFAULT_TOLERANCE,
    isClamped: clamped !== tolerance,
    bounds: {
      min: toleranceToPercentage(MIN_TOLERANCE),
      max: toleranceToPercentage(MAX_TOLERANCE),
    },
  };
}

export default {
  TOLERANCE_BOUNDS,
  clampTolerance,
  validateTolerance,
  amountsMatchWithTolerance,
  toleranceToPercentage,
  getToleranceInfo,
};
