import axios from 'axios';
import logger from '../utils/logger.js';

/**
 * Etherscan Service - Ethereum blockchain API integration
 *
 * Features:
 * - Transaction verification (ETH and ERC-20 tokens)
 * - USDT ERC-20 support
 * - Transfer event parsing
 * - Rate limiting (5 calls/sec)
 * - Simple caching (60 sec TTL)
 *
 * Note: Etherscan does not support webhooks - use polling
 */

const ETHERSCAN_API = 'https://api.etherscan.io/api';
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY;
const USDT_CONTRACT = '0xdac17f958d2ee523a2206206994597c13d831ec7';

// Rate limiting: 5 calls per second
let requestTimestamps = [];
const MAX_REQUESTS_PER_SECOND = 5;
const REQUEST_WINDOW_MS = 1000;

// Simple cache for transactions (60 second TTL)
const cache = new Map();
const CACHE_TTL_MS = 60000;

/**
 * Rate limiter - ensures we don't exceed 5 calls/sec
 * @returns {Promise<void>}
 */
async function rateLimitWait() {
  const now = Date.now();

  // Clean old timestamps
  requestTimestamps = requestTimestamps.filter(
    timestamp => now - timestamp < REQUEST_WINDOW_MS
  );

  // If we've hit the limit, wait
  if (requestTimestamps.length >= MAX_REQUESTS_PER_SECOND) {
    const oldestRequest = requestTimestamps[0];
    const waitTime = REQUEST_WINDOW_MS - (now - oldestRequest);

    if (waitTime > 0) {
      logger.debug(`[Etherscan] Rate limit: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  requestTimestamps.push(Date.now());
}

/**
 * Get from cache if not expired
 * @param {string} key - Cache key
 * @returns {any|null} Cached value or null
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
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 */
function setCache(key, value) {
  cache.set(key, {
    value,
    timestamp: Date.now()
  });
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

      // Don't retry on 4xx errors
      if (error.response && error.response.status >= 400 && error.response.status < 500) {
        throw error;
      }

      if (isLastAttempt) {
        logger.error(`[Etherscan] All ${maxRetries} retry attempts failed:`, {
          error: error.message
        });
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      logger.warn(`[Etherscan] Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Get ERC-20 token transfers for address
 *
 * @param {string} address - Ethereum address
 * @param {string} contractAddress - Token contract address (default: USDT)
 * @param {number} startBlock - Start block (optional)
 * @param {number} endBlock - End block (optional)
 * @returns {Promise<Array>} Array of token transfers
 */
export async function getTokenTransfers(address, contractAddress = USDT_CONTRACT, startBlock = 0, endBlock = 99999999) {
  try {
    // Check cache first
    const cacheKey = `tokentx:${address}:${contractAddress}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
      logger.debug(`[Etherscan] Cache hit for token transfers: ${address}`);
      return cached;
    }

    await rateLimitWait();

    logger.info(`[Etherscan] Fetching token transfers for: ${address}`);

    const response = await retryWithBackoff(async () => {
      return await axios.get(ETHERSCAN_API, {
        params: {
          module: 'account',
          action: 'tokentx',
          address: address,
          contractaddress: contractAddress,
          startblock: startBlock,
          endblock: endBlock,
          sort: 'desc',
          apikey: ETHERSCAN_KEY || ''
        },
        timeout: 10000
      });
    });

    if (response.data.status !== '1') {
      logger.warn(`[Etherscan] API error:`, {
        message: response.data.message,
        result: response.data.result
      });
      return [];
    }

    const transfers = response.data.result.map(tx => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      tokenSymbol: tx.tokenSymbol,
      tokenDecimal: parseInt(tx.tokenDecimal),
      timestamp: parseInt(tx.timeStamp),
      blockNumber: parseInt(tx.blockNumber),
      confirmations: parseInt(tx.confirmations)
    }));

    // Cache the result
    setCache(cacheKey, transfers);

    logger.debug(`[Etherscan] Found ${transfers.length} token transfers`);

    return transfers;
  } catch (error) {
    logger.error('[Etherscan] Failed to get token transfers:', {
      error: error.message,
      address
    });
    throw new Error(`Failed to get token transfers: ${error.message}`);
  }
}

/**
 * Get transaction by hash
 *
 * @param {string} txHash - Transaction hash
 * @returns {Promise<object>} Transaction details
 */
export async function getTransaction(txHash) {
  try {
    // Check cache
    const cacheKey = `tx:${txHash}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
      logger.debug(`[Etherscan] Cache hit for transaction: ${txHash}`);
      return cached;
    }

    await rateLimitWait();

    logger.info(`[Etherscan] Fetching transaction: ${txHash}`);

    const response = await retryWithBackoff(async () => {
      return await axios.get(ETHERSCAN_API, {
        params: {
          module: 'proxy',
          action: 'eth_getTransactionByHash',
          txhash: txHash,
          apikey: ETHERSCAN_KEY || ''
        },
        timeout: 10000
      });
    });

    const tx = response.data.result;

    if (!tx) {
      logger.warn(`[Etherscan] Transaction not found: ${txHash}`);
      return null;
    }

    const txData = {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      blockNumber: tx.blockNumber ? parseInt(tx.blockNumber, 16) : null,
      gas: parseInt(tx.gas, 16),
      gasPrice: parseInt(tx.gasPrice, 16),
      input: tx.input,
      nonce: parseInt(tx.nonce, 16)
    };

    // Cache the result
    setCache(cacheKey, txData);

    return txData;
  } catch (error) {
    logger.error('[Etherscan] Failed to get transaction:', {
      error: error.message,
      txHash
    });
    throw new Error(`Failed to get transaction: ${error.message}`);
  }
}

/**
 * Get transaction receipt
 *
 * @param {string} txHash - Transaction hash
 * @returns {Promise<object>} Transaction receipt
 */
export async function getTransactionReceipt(txHash) {
  try {
    // Check cache
    const cacheKey = `receipt:${txHash}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
      logger.debug(`[Etherscan] Cache hit for receipt: ${txHash}`);
      return cached;
    }

    await rateLimitWait();

    logger.info(`[Etherscan] Fetching transaction receipt: ${txHash}`);

    const response = await retryWithBackoff(async () => {
      return await axios.get(ETHERSCAN_API, {
        params: {
          module: 'proxy',
          action: 'eth_getTransactionReceipt',
          txhash: txHash,
          apikey: ETHERSCAN_KEY || ''
        },
        timeout: 10000
      });
    });

    const receipt = response.data.result;

    if (!receipt) {
      logger.warn(`[Etherscan] Receipt not found: ${txHash}`);
      return null;
    }

    const receiptData = {
      transactionHash: receipt.transactionHash,
      blockNumber: parseInt(receipt.blockNumber, 16),
      status: receipt.status, // '0x1' = success, '0x0' = failed
      from: receipt.from,
      to: receipt.to,
      gasUsed: parseInt(receipt.gasUsed, 16),
      logs: receipt.logs
    };

    // Cache the result
    setCache(cacheKey, receiptData);

    return receiptData;
  } catch (error) {
    logger.error('[Etherscan] Failed to get transaction receipt:', {
      error: error.message,
      txHash
    });
    throw new Error(`Failed to get transaction receipt: ${error.message}`);
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
      return await axios.get(ETHERSCAN_API, {
        params: {
          module: 'proxy',
          action: 'eth_blockNumber',
          apikey: ETHERSCAN_KEY || ''
        },
        timeout: 10000
      });
    });

    return parseInt(response.data.result, 16);
  } catch (error) {
    logger.error('[Etherscan] Failed to get current block number:', {
      error: error.message
    });
    throw new Error(`Failed to get current block number: ${error.message}`);
  }
}

/**
 * Verify ETH payment
 *
 * @param {string} txHash - Transaction hash
 * @param {string} expectedAddress - Expected receiving address
 * @param {number} expectedAmount - Expected amount in ETH
 * @returns {Promise<object>} { verified: boolean, confirmations: number, amount: number }
 */
export async function verifyEthPayment(txHash, expectedAddress, expectedAmount) {
  try {
    // Get transaction receipt
    const receipt = await getTransactionReceipt(txHash);

    if (!receipt) {
      return {
        verified: false,
        error: 'Transaction not found',
        confirmations: 0
      };
    }

    // Check if transaction was successful
    if (receipt.status !== '0x1') {
      return {
        verified: false,
        error: 'Transaction failed or reverted',
        confirmations: 0
      };
    }

    // Get transaction details
    const tx = await getTransaction(txHash);

    if (!tx) {
      return {
        verified: false,
        error: 'Transaction details not found',
        confirmations: 0
      };
    }

    // Verify recipient address
    if (tx.to.toLowerCase() !== expectedAddress.toLowerCase()) {
      logger.warn(`[Etherscan] Address mismatch:`, {
        expected: expectedAddress,
        actual: tx.to,
        txHash
      });
      return {
        verified: false,
        error: 'Address mismatch',
        confirmations: 0
      };
    }

    // Convert wei to ETH
    const actualAmount = parseInt(tx.value, 16) / 1e18;

    // Check amount with 1% tolerance
    const tolerance = expectedAmount * 0.01;
    const amountMatches = Math.abs(actualAmount - expectedAmount) <= tolerance;

    if (!amountMatches) {
      logger.warn(`[Etherscan] Amount mismatch:`, {
        expected: expectedAmount,
        actual: actualAmount,
        txHash
      });
      return {
        verified: false,
        error: `Amount mismatch. Expected: ${expectedAmount} ETH, Received: ${actualAmount} ETH`,
        confirmations: 0,
        amount: actualAmount
      };
    }

    // Calculate confirmations
    const currentBlock = await getCurrentBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber + 1;

    logger.info(`[Etherscan] ETH payment verified:`, {
      txHash,
      address: expectedAddress,
      amount: actualAmount,
      confirmations
    });

    return {
      verified: true,
      confirmations,
      amount: actualAmount,
      blockNumber: receipt.blockNumber,
      status: confirmations >= 3 ? 'confirmed' : 'pending'
    };
  } catch (error) {
    logger.error('[Etherscan] ETH payment verification failed:', {
      error: error.message,
      txHash
    });
    return {
      verified: false,
      error: error.message,
      confirmations: 0
    };
  }
}

/**
 * Verify USDT ERC-20 payment
 *
 * @param {string} txHash - Transaction hash
 * @param {string} expectedAddress - Expected receiving address
 * @param {number} expectedAmount - Expected amount in USDT
 * @returns {Promise<object>} { verified: boolean, confirmations: number, amount: number }
 */
export async function verifyUsdtPayment(txHash, expectedAddress, expectedAmount) {
  try {
    // Get transaction receipt
    const receipt = await getTransactionReceipt(txHash);

    if (!receipt) {
      return {
        verified: false,
        error: 'Transaction not found',
        confirmations: 0
      };
    }

    // Check if transaction was successful
    if (receipt.status !== '0x1') {
      return {
        verified: false,
        error: 'Transaction failed or reverted',
        confirmations: 0
      };
    }

    // Find Transfer event in logs
    // Transfer(address indexed from, address indexed to, uint256 value)
    // Topic0: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

    const transferLog = receipt.logs.find(log =>
      log.topics[0] === transferTopic &&
      log.address.toLowerCase() === USDT_CONTRACT.toLowerCase()
    );

    if (!transferLog) {
      return {
        verified: false,
        error: 'USDT Transfer event not found in transaction',
        confirmations: 0
      };
    }

    // Decode Transfer event
    // topics[1] = from address (indexed)
    // topics[2] = to address (indexed)
    // data = amount (not indexed)
    const toAddress = '0x' + transferLog.topics[2].slice(26); // Remove padding

    if (toAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
      logger.warn(`[Etherscan] USDT address mismatch:`, {
        expected: expectedAddress,
        actual: toAddress,
        txHash
      });
      return {
        verified: false,
        error: 'Address mismatch',
        confirmations: 0
      };
    }

    // Decode amount (USDT has 6 decimals)
    const actualAmount = parseInt(transferLog.data, 16) / 1e6;

    // Check amount with 1% tolerance
    const tolerance = expectedAmount * 0.01;
    const amountMatches = Math.abs(actualAmount - expectedAmount) <= tolerance;

    if (!amountMatches) {
      logger.warn(`[Etherscan] USDT amount mismatch:`, {
        expected: expectedAmount,
        actual: actualAmount,
        txHash
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
    const confirmations = currentBlock - receipt.blockNumber + 1;

    logger.info(`[Etherscan] USDT payment verified:`, {
      txHash,
      address: expectedAddress,
      amount: actualAmount,
      confirmations
    });

    return {
      verified: true,
      confirmations,
      amount: actualAmount,
      blockNumber: receipt.blockNumber,
      status: confirmations >= 3 ? 'confirmed' : 'pending'
    };
  } catch (error) {
    logger.error('[Etherscan] USDT payment verification failed:', {
      error: error.message,
      txHash
    });
    return {
      verified: false,
      error: error.message,
      confirmations: 0
    };
  }
}

/**
 * Verify payment (auto-detect ETH or USDT)
 *
 * @param {string} txHash - Transaction hash
 * @param {string} expectedAddress - Expected receiving address
 * @param {number} expectedAmount - Expected amount
 * @param {string} currency - ETH or USDT
 * @returns {Promise<object>} { verified: boolean, confirmations: number, amount: number }
 */
export async function verifyPayment(txHash, expectedAddress, expectedAmount, currency = 'ETH') {
  const currencyUpper = currency.toUpperCase();

  if (currencyUpper === 'ETH') {
    return verifyEthPayment(txHash, expectedAddress, expectedAmount);
  } else if (currencyUpper === 'USDT') {
    return verifyUsdtPayment(txHash, expectedAddress, expectedAmount);
  } else {
    throw new Error(`Unsupported currency: ${currency}. Etherscan supports ETH and USDT (ERC-20) only.`);
  }
}

export default {
  getTokenTransfers,
  getTransaction,
  getTransactionReceipt,
  getCurrentBlockNumber,
  verifyEthPayment,
  verifyUsdtPayment,
  verifyPayment
};
