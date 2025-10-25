import axios from 'axios';
import logger from '../utils/logger.js';

/**
 * BlockCypher Service - BTC and LTC blockchain API integration
 *
 * Features:
 * - Webhook subscriptions for transaction monitoring
 * - Transaction verification
 * - Confirmation tracking
 * - Rate limiting (3 req/sec, 100 req/hour free tier)
 *
 * Supported chains:
 * - Bitcoin (btc/main)
 * - Litecoin (litecoin/main)
 */

const BLOCKCYPHER_API = 'https://api.blockcypher.com/v1';
const BLOCKCYPHER_TOKEN = process.env.BLOCKCYPHER_API_KEY;

// Rate limiting: track requests per second
let requestTimestamps = [];
const MAX_REQUESTS_PER_SECOND = 3;
const REQUEST_WINDOW_MS = 1000;

/**
 * Rate limiter - ensures we don't exceed 3 req/sec
 * @returns {Promise<void>}
 */
async function rateLimitWait() {
  const now = Date.now();

  // Clean old timestamps outside the window
  requestTimestamps = requestTimestamps.filter(
    timestamp => now - timestamp < REQUEST_WINDOW_MS
  );

  // If we've hit the limit, wait
  if (requestTimestamps.length >= MAX_REQUESTS_PER_SECOND) {
    const oldestRequest = requestTimestamps[0];
    const waitTime = REQUEST_WINDOW_MS - (now - oldestRequest);

    if (waitTime > 0) {
      logger.debug(`[BlockCypher] Rate limit: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // Record this request
  requestTimestamps.push(Date.now());
}

/**
 * Retry helper with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} baseDelay - Base delay in ms
 * @returns {Promise} Result of function
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;

      // Don't retry on 4xx errors (client errors)
      if (error.response && error.response.status >= 400 && error.response.status < 500) {
        throw error;
      }

      if (isLastAttempt) {
        logger.error(`[BlockCypher] All ${maxRetries} retry attempts failed:`, {
          error: error.message
        });
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      logger.warn(`[BlockCypher] Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Get chain identifier for BlockCypher API
 * @param {string} chain - BTC or LTC
 * @returns {string} BlockCypher chain identifier
 */
function getChainIdentifier(chain) {
  const chainUpper = chain.toUpperCase();

  switch (chainUpper) {
    case 'BTC':
    case 'BITCOIN':
      return 'btc/main';

    case 'LTC':
    case 'LITECOIN':
      return 'litecoin/main';

    default:
      throw new Error(`Unsupported chain: ${chain}. BlockCypher supports BTC and LTC only.`);
  }
}

/**
 * Register webhook for transaction monitoring
 *
 * @param {string} chain - BTC or LTC
 * @param {string} address - Address to monitor
 * @param {string} callbackUrl - Webhook callback URL
 * @param {number} confirmations - Number of confirmations to wait (default: 3)
 * @returns {Promise<string>} Webhook ID
 */
export async function registerWebhook(chain, address, callbackUrl, confirmations = 3) {
  try {
    await rateLimitWait();

    const chainId = getChainIdentifier(chain);
    const url = `${BLOCKCYPHER_API}/${chainId}/hooks`;

    logger.info(`[BlockCypher] Registering webhook for ${chain} address: ${address}`);

    const response = await retryWithBackoff(async () => {
      return await axios.post(
        url,
        {
          event: 'tx-confirmation',
          address: address,
          confirmations: confirmations,
          url: callbackUrl
        },
        {
          params: BLOCKCYPHER_TOKEN ? { token: BLOCKCYPHER_TOKEN } : {},
          timeout: 10000
        }
      );
    });

    const webhookId = response.data.id;

    logger.info(`[BlockCypher] Webhook registered: ${webhookId}`);

    return webhookId;
  } catch (error) {
    logger.error('[BlockCypher] Failed to register webhook:', {
      error: error.message,
      response: error.response?.data,
      chain,
      address
    });
    throw new Error(`Failed to register webhook: ${error.message}`);
  }
}

/**
 * Unregister webhook
 *
 * @param {string} webhookId - Webhook ID to delete
 * @param {string} chain - BTC or LTC (for chain identifier)
 * @returns {Promise<void>}
 */
export async function unregisterWebhook(webhookId, chain = 'BTC') {
  try {
    await rateLimitWait();

    const chainId = getChainIdentifier(chain);
    const url = `${BLOCKCYPHER_API}/${chainId}/hooks/${webhookId}`;

    logger.info(`[BlockCypher] Unregistering webhook: ${webhookId}`);

    await retryWithBackoff(async () => {
      return await axios.delete(url, {
        params: BLOCKCYPHER_TOKEN ? { token: BLOCKCYPHER_TOKEN } : {},
        timeout: 10000
      });
    });

    logger.info(`[BlockCypher] Webhook unregistered: ${webhookId}`);
  } catch (error) {
    // If webhook doesn't exist (404), consider it a success
    if (error.response && error.response.status === 404) {
      logger.warn(`[BlockCypher] Webhook not found: ${webhookId} (already deleted)`);
      return;
    }

    logger.error('[BlockCypher] Failed to unregister webhook:', {
      error: error.message,
      webhookId
    });
    throw new Error(`Failed to unregister webhook: ${error.message}`);
  }
}

/**
 * Get transaction details
 *
 * @param {string} chain - BTC or LTC
 * @param {string} txHash - Transaction hash
 * @returns {Promise<object>} Transaction details
 */
export async function getTransaction(chain, txHash) {
  try {
    await rateLimitWait();

    const chainId = getChainIdentifier(chain);
    const url = `${BLOCKCYPHER_API}/${chainId}/txs/${txHash}`;

    logger.info(`[BlockCypher] Fetching transaction: ${txHash}`);

    const response = await retryWithBackoff(async () => {
      return await axios.get(url, {
        params: BLOCKCYPHER_TOKEN ? { token: BLOCKCYPHER_TOKEN } : {},
        timeout: 10000
      });
    });

    const tx = response.data;

    logger.debug(`[BlockCypher] Transaction fetched:`, {
      txHash,
      confirmations: tx.confirmations,
      blockHeight: tx.block_height
    });

    return {
      txHash: tx.hash,
      blockHeight: tx.block_height,
      confirmations: tx.confirmations || 0,
      inputs: tx.inputs,
      outputs: tx.outputs,
      total: tx.total,
      fees: tx.fees,
      received: tx.received,
      confirmed: tx.confirmed,
      doubleSpend: tx.double_spend || false
    };
  } catch (error) {
    logger.error('[BlockCypher] Failed to get transaction:', {
      error: error.message,
      response: error.response?.data,
      txHash
    });
    throw new Error(`Failed to get transaction: ${error.message}`);
  }
}

/**
 * Verify payment transaction
 *
 * @param {string} chain - BTC or LTC
 * @param {string} txHash - Transaction hash
 * @param {string} expectedAddress - Expected receiving address
 * @param {number} expectedAmount - Expected amount (in BTC or LTC)
 * @returns {Promise<object>} { verified: boolean, confirmations: number, amount: number }
 */
export async function verifyPayment(chain, txHash, expectedAddress, expectedAmount) {
  try {
    // Get transaction details
    const tx = await getTransaction(chain, txHash);

    // Check for double-spend
    if (tx.doubleSpend) {
      logger.warn(`[BlockCypher] Double-spend detected for tx: ${txHash}`);
      return {
        verified: false,
        error: 'Double-spend detected',
        confirmations: 0
      };
    }

    // Find output to expected address
    const output = tx.outputs.find(out =>
      out.addresses && out.addresses.includes(expectedAddress)
    );

    if (!output) {
      logger.warn(`[BlockCypher] Address not found in outputs: ${expectedAddress}`);
      return {
        verified: false,
        error: 'Address not found in transaction outputs',
        confirmations: tx.confirmations
      };
    }

    // Convert satoshis to BTC/LTC (1 BTC/LTC = 100,000,000 satoshis)
    const actualAmount = output.value / 100000000;

    // Check amount with 1% tolerance
    const tolerance = expectedAmount * 0.01;
    const amountMatches = Math.abs(actualAmount - expectedAmount) <= tolerance;

    if (!amountMatches) {
      logger.warn(`[BlockCypher] Amount mismatch:`, {
        expected: expectedAmount,
        actual: actualAmount,
        txHash
      });
      return {
        verified: false,
        error: `Amount mismatch. Expected: ${expectedAmount}, Received: ${actualAmount}`,
        confirmations: tx.confirmations,
        amount: actualAmount
      };
    }

    // Payment verified
    logger.info(`[BlockCypher] Payment verified:`, {
      txHash,
      address: expectedAddress,
      amount: actualAmount,
      confirmations: tx.confirmations
    });

    return {
      verified: true,
      confirmations: tx.confirmations,
      amount: actualAmount,
      blockHeight: tx.blockHeight,
      status: tx.confirmations >= 3 ? 'confirmed' : 'pending'
    };
  } catch (error) {
    logger.error('[BlockCypher] Payment verification failed:', {
      error: error.message,
      txHash,
      expectedAddress
    });
    return {
      verified: false,
      error: error.message,
      confirmations: 0
    };
  }
}

/**
 * Parse webhook payload from BlockCypher
 *
 * @param {object} payload - Webhook payload
 * @returns {object} Normalized payment data
 */
export function parseWebhookPayload(payload) {
  try {
    // BlockCypher tx-confirmation webhook structure:
    // {
    //   hash: string,
    //   confirmations: number,
    //   outputs: [{ addresses: string[], value: number }],
    //   block_height: number,
    //   ...
    // }

    const {
      hash,
      confirmations,
      outputs,
      block_height,
      total,
      fees
    } = payload;

    logger.info(`[BlockCypher] Webhook received:`, {
      txHash: hash,
      confirmations,
      blockHeight: block_height
    });

    return {
      txHash: hash,
      confirmations: confirmations || 0,
      blockHeight: block_height,
      outputs: outputs || [],
      total: total ? total / 100000000 : 0, // Convert to BTC/LTC
      fees: fees ? fees / 100000000 : 0,
      raw: payload
    };
  } catch (error) {
    logger.error('[BlockCypher] Failed to parse webhook payload:', {
      error: error.message
    });
    throw new Error(`Failed to parse webhook: ${error.message}`);
  }
}

/**
 * Get current block height
 *
 * @param {string} chain - BTC or LTC
 * @returns {Promise<number>} Current block height
 */
export async function getBlockHeight(chain) {
  try {
    await rateLimitWait();

    const chainId = getChainIdentifier(chain);
    const url = `${BLOCKCYPHER_API}/${chainId}`;

    const response = await retryWithBackoff(async () => {
      return await axios.get(url, {
        params: BLOCKCYPHER_TOKEN ? { token: BLOCKCYPHER_TOKEN } : {},
        timeout: 10000
      });
    });

    return response.data.height;
  } catch (error) {
    logger.error('[BlockCypher] Failed to get block height:', {
      error: error.message,
      chain
    });
    throw new Error(`Failed to get block height: ${error.message}`);
  }
}

export default {
  registerWebhook,
  unregisterWebhook,
  getTransaction,
  verifyPayment,
  parseWebhookPayload,
  getBlockHeight
};
