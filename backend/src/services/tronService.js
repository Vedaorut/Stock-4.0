import axios from 'axios';
import TronWeb from 'tronweb';
import logger from '../utils/logger.js';

/**
 * Tron Service - TRON blockchain API integration
 *
 * Features:
 * - TRC-20 token transaction verification
 * - USDT TRC-20 support
 * - Transaction polling
 * - Base58 address handling
 *
 * Note: TronGrid does not support webhooks - use polling
 */

const TRONGRID_API = 'https://api.trongrid.io';
const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY;
const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// Initialize TronWeb for address conversions
const tronWeb = new TronWeb({
  fullHost: TRONGRID_API,
  headers: TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': TRONGRID_API_KEY } : {}
});

// Rate limiting: TronGrid allows higher limits, but be conservative
let requestTimestamps = [];
const MAX_REQUESTS_PER_SECOND = 10;
const REQUEST_WINDOW_MS = 1000;

// Simple cache for transactions (60 second TTL)
const cache = new Map();
const CACHE_TTL_MS = 60000;

/**
 * Rate limiter
 * @returns {Promise<void>}
 */
async function rateLimitWait() {
  const now = Date.now();

  requestTimestamps = requestTimestamps.filter(
    timestamp => now - timestamp < REQUEST_WINDOW_MS
  );

  if (requestTimestamps.length >= MAX_REQUESTS_PER_SECOND) {
    const oldestRequest = requestTimestamps[0];
    const waitTime = REQUEST_WINDOW_MS - (now - oldestRequest);

    if (waitTime > 0) {
      logger.debug(`[TronService] Rate limit: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  requestTimestamps.push(Date.now());
}

/**
 * Get from cache if not expired
 */
function getFromCache(key) {
  const cached = cache.get(key);
  if (!cached) return null;

  const { value, timestamp } = cached;
  const age = Date.now() - timestamp;

  if (age > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return value;
}

/**
 * Set cache entry
 */
function setCache(key, value) {
  cache.set(key, {
    value,
    timestamp: Date.now()
  });
}

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;

      if (error.response && error.response.status >= 400 && error.response.status < 500) {
        throw error;
      }

      if (isLastAttempt) {
        logger.error(`[TronService] All ${maxRetries} retry attempts failed:`, {
          error: error.message
        });
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      logger.warn(`[TronService] Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Get TRC-20 token transfers for address
 *
 * @param {string} address - Tron address (TR...)
 * @param {string} contractAddress - Token contract address (default: USDT TRC-20)
 * @param {number} limit - Maximum number of transfers to return (max 200)
 * @param {boolean} onlyConfirmed - Only return confirmed transactions
 * @returns {Promise<Array>} Array of TRC-20 transfers
 */
export async function getTrc20Transfers(
  address,
  contractAddress = USDT_TRC20_CONTRACT,
  limit = 50,
  onlyConfirmed = true
) {
  try {
    // Check cache
    const cacheKey = `trc20:${address}:${contractAddress}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
      logger.debug(`[TronService] Cache hit for TRC-20 transfers: ${address}`);
      return cached;
    }

    await rateLimitWait();

    logger.info(`[TronService] Fetching TRC-20 transfers for: ${address}`);

    const response = await retryWithBackoff(async () => {
      return await axios.get(
        `${TRONGRID_API}/v1/accounts/${address}/transactions/trc20`,
        {
          params: {
            only_confirmed: onlyConfirmed,
            contract_address: contractAddress,
            limit: Math.min(limit, 200) // TronGrid max is 200
          },
          headers: TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': TRONGRID_API_KEY } : {},
          timeout: 10000
        }
      );
    });

    if (!response.data || !response.data.data) {
      logger.warn(`[TronService] No TRC-20 transfers found for: ${address}`);
      return [];
    }

    const transfers = response.data.data.map(tx => ({
      transactionId: tx.transaction_id,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      tokenInfo: tx.token_info,
      blockTimestamp: tx.block_timestamp,
      type: tx.type
    }));

    // Cache the result
    setCache(cacheKey, transfers);

    logger.debug(`[TronService] Found ${transfers.length} TRC-20 transfers`);

    return transfers;
  } catch (error) {
    logger.error('[TronService] Failed to get TRC-20 transfers:', {
      error: error.message,
      response: error.response?.data,
      address
    });
    throw new Error(`Failed to get TRC-20 transfers: ${error.message}`);
  }
}

/**
 * Get transaction by ID
 *
 * @param {string} txId - Transaction ID (hash)
 * @returns {Promise<object>} Transaction details
 */
export async function getTransaction(txId) {
  try {
    // Check cache
    const cacheKey = `tx:${txId}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
      logger.debug(`[TronService] Cache hit for transaction: ${txId}`);
      return cached;
    }

    await rateLimitWait();

    logger.info(`[TronService] Fetching transaction: ${txId}`);

    const response = await retryWithBackoff(async () => {
      return await axios.post(
        `${TRONGRID_API}/wallet/gettransactionbyid`,
        { value: txId },
        {
          headers: TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': TRONGRID_API_KEY } : {},
          timeout: 10000
        }
      );
    });

    const tx = response.data;

    if (!tx || !tx.txID) {
      logger.warn(`[TronService] Transaction not found: ${txId}`);
      return null;
    }

    const txData = {
      txID: tx.txID,
      rawData: tx.raw_data,
      ret: tx.ret,
      signature: tx.signature
    };

    // Cache the result
    setCache(cacheKey, txData);

    return txData;
  } catch (error) {
    logger.error('[TronService] Failed to get transaction:', {
      error: error.message,
      txId
    });
    throw new Error(`Failed to get transaction: ${error.message}`);
  }
}

/**
 * Get transaction info (includes block number and result)
 *
 * @param {string} txId - Transaction ID (hash)
 * @returns {Promise<object>} Transaction info
 */
export async function getTransactionInfo(txId) {
  try {
    // Check cache
    const cacheKey = `txinfo:${txId}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
      logger.debug(`[TronService] Cache hit for transaction info: ${txId}`);
      return cached;
    }

    await rateLimitWait();

    logger.info(`[TronService] Fetching transaction info: ${txId}`);

    const response = await retryWithBackoff(async () => {
      return await axios.post(
        `${TRONGRID_API}/wallet/gettransactioninfobyid`,
        { value: txId },
        {
          headers: TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': TRONGRID_API_KEY } : {},
          timeout: 10000
        }
      );
    });

    const info = response.data;

    if (!info || Object.keys(info).length === 0) {
      logger.warn(`[TronService] Transaction info not found: ${txId}`);
      return null;
    }

    const infoData = {
      id: info.id,
      blockNumber: info.blockNumber,
      blockTimeStamp: info.blockTimeStamp,
      receipt: info.receipt,
      log: info.log
    };

    // Cache the result
    setCache(cacheKey, infoData);

    return infoData;
  } catch (error) {
    logger.error('[TronService] Failed to get transaction info:', {
      error: error.message,
      txId
    });
    throw new Error(`Failed to get transaction info: ${error.message}`);
  }
}

/**
 * Get current block number
 *
 * @returns {Promise<number>} Current block number
 */
export async function getCurrentBlockNumber() {
  try {
    await rateLimitWait();

    const response = await retryWithBackoff(async () => {
      return await axios.post(
        `${TRONGRID_API}/wallet/getnowblock`,
        {},
        {
          headers: TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': TRONGRID_API_KEY } : {},
          timeout: 10000
        }
      );
    });

    return response.data.block_header.raw_data.number;
  } catch (error) {
    logger.error('[TronService] Failed to get current block number:', {
      error: error.message
    });
    throw new Error(`Failed to get current block number: ${error.message}`);
  }
}

/**
 * Verify USDT TRC-20 payment
 *
 * @param {string} txId - Transaction ID
 * @param {string} expectedAddress - Expected receiving address
 * @param {number} expectedAmount - Expected amount in USDT
 * @returns {Promise<object>} { verified: boolean, confirmations: number, amount: number }
 */
export async function verifyPayment(txId, expectedAddress, expectedAmount) {
  try {
    // Get transaction details
    const tx = await getTransaction(txId);

    if (!tx) {
      return {
        verified: false,
        error: 'Transaction not found',
        confirmations: 0
      };
    }

    // Check if transaction was successful
    if (!tx.ret || tx.ret.length === 0 || tx.ret[0].contractRet !== 'SUCCESS') {
      return {
        verified: false,
        error: 'Transaction failed',
        confirmations: 0
      };
    }

    // Get transaction info for block number
    const info = await getTransactionInfo(txId);

    if (!info || !info.blockNumber) {
      return {
        verified: false,
        error: 'Transaction not yet confirmed',
        confirmations: 0
      };
    }

    // Extract contract data
    const contract = tx.rawData?.contract?.[0];

    if (!contract || contract.type !== 'TriggerSmartContract') {
      return {
        verified: false,
        error: 'Not a smart contract transaction',
        confirmations: 0
      };
    }

    // Verify it's USDT TRC-20 contract
    const contractAddress = tronWeb.address.fromHex(contract.parameter.value.contract_address);

    if (contractAddress !== USDT_TRC20_CONTRACT) {
      return {
        verified: false,
        error: 'Not a USDT TRC-20 transaction',
        confirmations: 0
      };
    }

    // Decode transfer method call
    // Method signature: a9059cbb = transfer(address,uint256)
    const data = contract.parameter.value.data;

    if (!data || !data.startsWith('a9059cbb')) {
      return {
        verified: false,
        error: 'Not a transfer transaction',
        confirmations: 0
      };
    }

    // Decode recipient address (next 64 characters, last 40 are address)
    const recipientHex = '41' + data.substring(8, 72).substring(24); // Add 41 prefix for Tron
    const recipientAddress = tronWeb.address.fromHex(recipientHex);

    if (recipientAddress !== expectedAddress) {
      logger.warn(`[TronService] Address mismatch:`, {
        expected: expectedAddress,
        actual: recipientAddress,
        txId
      });
      return {
        verified: false,
        error: 'Address mismatch',
        confirmations: 0
      };
    }

    // Decode amount (next 64 characters) - USDT has 6 decimals
    const amountHex = data.substring(72, 136);
    const actualAmount = parseInt(amountHex, 16) / 1e6;

    // Check amount with 1% tolerance
    const tolerance = expectedAmount * 0.01;
    const amountMatches = Math.abs(actualAmount - expectedAmount) <= tolerance;

    if (!amountMatches) {
      logger.warn(`[TronService] Amount mismatch:`, {
        expected: expectedAmount,
        actual: actualAmount,
        txId
      });
      return {
        verified: false,
        error: `Amount mismatch. Expected: ${expectedAmount} USDT, Received: ${actualAmount} USDT`,
        confirmations: 0,
        amount: actualAmount
      };
    }

    // Calculate confirmations
    const currentBlock = await getCurrentBlockNumber();
    const confirmations = currentBlock - info.blockNumber + 1;

    logger.info(`[TronService] USDT TRC-20 payment verified:`, {
      txId,
      address: expectedAddress,
      amount: actualAmount,
      confirmations
    });

    return {
      verified: true,
      confirmations,
      amount: actualAmount,
      blockNumber: info.blockNumber,
      status: confirmations >= 1 ? 'confirmed' : 'pending' // Tron needs only 1 confirmation
    };
  } catch (error) {
    logger.error('[TronService] Payment verification failed:', {
      error: error.message,
      txId
    });
    return {
      verified: false,
      error: error.message,
      confirmations: 0
    };
  }
}

/**
 * Convert hex address to base58 address
 *
 * @param {string} hexAddress - Hex address (with or without 41 prefix)
 * @returns {string} Base58 address
 */
export function hexToBase58(hexAddress) {
  try {
    // Add 41 prefix if not present
    const hex = hexAddress.startsWith('41') ? hexAddress : '41' + hexAddress;
    return tronWeb.address.fromHex(hex);
  } catch (error) {
    logger.error('[TronService] Failed to convert hex to base58:', {
      error: error.message,
      hexAddress
    });
    throw new Error(`Failed to convert hex to base58: ${error.message}`);
  }
}

/**
 * Convert base58 address to hex address
 *
 * @param {string} base58Address - Base58 address (TR...)
 * @returns {string} Hex address (without 41 prefix)
 */
export function base58ToHex(base58Address) {
  try {
    const hex = tronWeb.address.toHex(base58Address);
    // Remove 41 prefix
    return hex.startsWith('41') ? hex.substring(2) : hex;
  } catch (error) {
    logger.error('[TronService] Failed to convert base58 to hex:', {
      error: error.message,
      base58Address
    });
    throw new Error(`Failed to convert base58 to hex: ${error.message}`);
  }
}

export default {
  getTrc20Transfers,
  getTransaction,
  getTransactionInfo,
  getCurrentBlockNumber,
  verifyPayment,
  hexToBase58,
  base58ToHex
};
