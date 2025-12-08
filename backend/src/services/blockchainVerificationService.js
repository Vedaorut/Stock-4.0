/**
 * Blockchain Verification Service
 *
 * Verifies cryptocurrency payments via public blockchain APIs.
 * Supports: Bitcoin (BTC), Litecoin (LTC), Ethereum (ETH), USDT TRC20.
 *
 * API Providers:
 * - BTC: Blockstream Esplora (free, no key required) - https://blockstream.info/api
 * - LTC: BlockCypher (100 req/hour free, 5000 req/hour with key) - optional BLOCKCYPHER_API_KEY
 * - ETH: Etherscan (5 req/sec, free) - requires ETHERSCAN_API_KEY
 * - USDT TRC20: TronGrid (15 QPS, free) - optional TRONGRID_API_KEY
 *
 * Features:
 * - Multi-chain verification with chain-specific min confirmations
 * - 2% amount tolerance for network fees
 * - Retry logic with exponential backoff for API failures
 * - Comprehensive error handling with descriptive messages
 * - Transaction receipt validation (Ethereum)
 * - Smart contract event parsing (USDT TRC20)
 *
 * Env vars:
 * - BLOCKCYPHER_API_KEY: API key for BlockCypher (optional, increases rate limit 100->5000 req/hour)
 * - ETHERSCAN_API_KEY: API key for Etherscan (required for ETH)
 * - TRONGRID_API_KEY: API key for TronGrid (optional)
 */

import axios from 'axios';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { SUPPORTED_CURRENCIES } from '../utils/constants.js';

/**
 * Verification result status types
 * Used to differentiate between error types for proper retry handling
 */
export const VERIFICATION_STATUS = {
  SUCCESS: 'SUCCESS',           // Transaction verified successfully (may be pending or confirmed)
  TX_NOT_FOUND: 'TX_NOT_FOUND', // Transaction doesn't exist on blockchain
  TX_INVALID: 'TX_INVALID',     // Transaction exists but is invalid (wrong address, failed, etc.)
  API_ERROR: 'API_ERROR',       // Network/API issues - caller should retry later
};

// API endpoints configuration
const BLOCKCHAIN_CONFIG = {
  BTC: {
    provider: 'blockstream',
    baseUrl: 'https://blockstream.info/api',
    minConfirmations: SUPPORTED_CURRENCIES.BTC.confirmations,
    decimals: SUPPORTED_CURRENCIES.BTC.decimals,
  },
  LTC: {
    provider: 'blockcypher',
    baseUrl: 'https://api.blockcypher.com/v1/ltc/main',
    minConfirmations: SUPPORTED_CURRENCIES.LTC.confirmations,
    decimals: SUPPORTED_CURRENCIES.LTC.decimals,
  },
  ETH: {
    provider: 'etherscan',
    baseUrl: 'https://api.etherscan.io/v2/api',
    chainId: 1, // Ethereum Mainnet
    minConfirmations: SUPPORTED_CURRENCIES.ETH.confirmations,
    decimals: SUPPORTED_CURRENCIES.ETH.decimals,
  },
  USDT: {
    provider: 'trongrid',
    baseUrl: 'https://api.trongrid.io',
    minConfirmations: SUPPORTED_CURRENCIES.USDT.confirmations,
    decimals: SUPPORTED_CURRENCIES.USDT.decimals,
    // USDT TRC20 contract - configurable via env for flexibility
    contractAddress: process.env.USDT_TRC20_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  },
  USDT_TRC20: {
    provider: 'trongrid',
    baseUrl: 'https://api.trongrid.io',
    minConfirmations: SUPPORTED_CURRENCIES.USDT.confirmations,
    decimals: SUPPORTED_CURRENCIES.USDT.decimals,
    contractAddress: process.env.USDT_TRC20_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  },
};

// Amount tolerance for network fees (2%)
const AMOUNT_TOLERANCE = 0.02;

// API request timeout (10 seconds)
const API_TIMEOUT = 10000;

/**
 * Custom error class for API failures
 * Allows callers to distinguish API errors from other errors
 */
class BlockchainAPIError extends Error {
  constructor(message, statusCode = null) {
    super(message);
    this.name = 'BlockchainAPIError';
    this.statusCode = statusCode;
    this.isAPIError = true;
  }
}

/**
 * Fetch data from API with retry logic
 *
 * @param {string} url - API endpoint URL
 * @param {object} options - Axios request options
 * @param {number} retries - Number of retry attempts (default: 3)
 * @returns {Promise<object>} API response data
 * @throws {BlockchainAPIError} If all retries fail
 */
async function fetchWithRetry(url, options = {}, retries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios({
        url,
        timeout: API_TIMEOUT,
        ...options,
      });
      return response.data;
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === retries;

      // Log retry attempts
      if (!isLastAttempt) {
        const waitTime = 1000 * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
        logger.warn(`[BlockchainVerification] API request failed (attempt ${attempt}/${retries}), retrying in ${waitTime}ms...`, {
          url,
          error: error.message,
        });
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        // Final attempt failed
        logger.error('[BlockchainVerification] API request failed after all retries', {
          url,
          error: error.message,
          response: error.response?.data,
        });
      }
    }
  }

  // Wrap in BlockchainAPIError for easy identification
  throw new BlockchainAPIError(
    `API request failed: ${lastError.message}`,
    lastError.response?.status
  );
}

/**
 * Main entry point - verify payment on blockchain
 *
 * @param {string} txHash - Transaction hash
 * @param {string} chain - Cryptocurrency chain (BTC, LTC, ETH, USDT)
 * @param {string} expectedAddress - Expected recipient address
 * @param {string|number} expectedAmount - Expected amount in crypto (not in smallest unit)
 * @returns {Promise<object>} Verification result
 *
 * Result format:
 * {
 *   verified: boolean,         // True if payment is valid and confirmed
 *   status: string,            // 'pending' | 'confirmed' | 'failed'
 *   resultStatus: string,      // VERIFICATION_STATUS: SUCCESS | TX_NOT_FOUND | TX_INVALID | API_ERROR
 *   confirmations: number,     // Current number of confirmations
 *   amount: string,            // Actual amount received (as string to preserve precision)
 *   error?: string             // Error message if verification failed
 * }
 *
 * Caller should use resultStatus to determine retry strategy:
 * - API_ERROR: Retry later (network/API issues)
 * - TX_NOT_FOUND: Transaction doesn't exist (may appear later for new txs)
 * - TX_INVALID: Don't retry (permanent failure - wrong address, failed tx, etc.)
 * - SUCCESS: Transaction found and valid (check 'verified' for confirmation status)
 */
export async function verifyPayment(txHash, chain, expectedAddress, expectedAmount) {
  try {
    // Normalize aliases (USDT_TRC20 -> USDT)
    const normalizedChain = chain === 'USDT_TRC20' ? 'USDT' : chain;

    // Validate inputs
    if (!txHash || typeof txHash !== 'string') {
      return {
        verified: false,
        status: 'failed',
        resultStatus: VERIFICATION_STATUS.TX_INVALID,
        confirmations: 0,
        amount: '0',
        error: 'Invalid transaction hash',
      };
    }

    if (!BLOCKCHAIN_CONFIG[normalizedChain]) {
      return {
        verified: false,
        status: 'failed',
        resultStatus: VERIFICATION_STATUS.TX_INVALID,
        confirmations: 0,
        amount: '0',
        error: `Unsupported chain: ${normalizedChain}`,
      };
    }

    logger.info('[BlockchainVerification] Starting verification', {
      txHash,
      chain: normalizedChain,
      expectedAddress,
      expectedAmount,
    });

    // Dispatch to chain-specific verifier
    let result;
    switch (normalizedChain) {
      case 'BTC':
        result = await verifyBitcoinPayment(txHash, expectedAddress, expectedAmount);
        break;
      case 'LTC':
        result = await verifyLitecoinPayment(txHash, expectedAddress, expectedAmount);
        break;
      case 'ETH':
        result = await verifyEthereumPayment(txHash, expectedAddress, expectedAmount);
        break;
      case 'USDT':
        result = await verifyUSDTTRC20Payment(txHash, expectedAddress, expectedAmount);
        break;
      default:
        return {
          verified: false,
          status: 'failed',
          resultStatus: VERIFICATION_STATUS.TX_INVALID,
          confirmations: 0,
          amount: '0',
          error: `No verifier implemented for chain: ${chain}`,
        };
    }

    logger.info('[BlockchainVerification] Verification complete', {
      txHash,
      chain: normalizedChain,
      result,
    });

    return result;
  } catch (error) {
    logger.error('[BlockchainVerification] Verification error', {
      txHash,
      chain,
      error: error.message,
      isAPIError: error.isAPIError || false,
      stack: error.stack,
    });

    // Distinguish API errors from other errors
    const isAPIError = error.isAPIError || error.code === 'ECONNREFUSED' ||
                       error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND';

    return {
      verified: false,
      status: 'failed',
      resultStatus: isAPIError ? VERIFICATION_STATUS.API_ERROR : VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: '0',
      error: `Verification failed: ${error.message}`,
    };
  }
}

/**
 * Verify Bitcoin payment using Blockstream Esplora API
 * Free, no API key required, generous rate limits
 *
 * @param {string} txHash - Transaction hash
 * @param {string} expectedAddress - Expected recipient address
 * @param {string|number} expectedAmount - Expected amount in BTC
 * @returns {Promise<object>} Verification result
 */
export async function verifyBitcoinPayment(txHash, expectedAddress, expectedAmount) {
  const config = BLOCKCHAIN_CONFIG.BTC;
  const url = `${config.baseUrl}/tx/${txHash}`;

  // Fetch transaction data from Blockstream (may throw BlockchainAPIError)
  const tx = await fetchWithRetry(url);

  if (!tx || !tx.txid) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_NOT_FOUND,
      confirmations: 0,
      amount: '0',
      error: 'Transaction not found',
    };
  }

  // Find output to our address (Blockstream uses scriptpubkey_address)
  const output = tx.vout?.find((o) => o.scriptpubkey_address === expectedAddress);

  if (!output) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: '0',
      error: 'Payment not sent to expected address',
    };
  }

  // Blockstream returns value in satoshi
  const amountBTC = (output.value / Math.pow(10, config.decimals)).toFixed(config.decimals);
  const expectedBTC = parseFloat(expectedAmount);

  // P0 SECURITY: Validate expectedAmount to prevent NaN bypass
  if (isNaN(expectedBTC) || expectedBTC <= 0) {
    logger.error('[BlockchainVerification] Invalid expected amount for BTC', { expectedAmount });
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: amountBTC,
      error: 'Invalid expected amount',
    };
  }

  // Check amount with tolerance
  const minAmount = expectedBTC * (1 - AMOUNT_TOLERANCE);
  if (parseFloat(amountBTC) < minAmount) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: amountBTC,
      error: `Insufficient amount: expected ${expectedBTC} BTC, received ${amountBTC} BTC`,
    };
  }

  // Calculate confirmations from block height
  let confirmations = 0;
  if (tx.status?.confirmed && tx.status?.block_height) {
    // Get current block height (fetched in parallel with tx data would be ideal,
    // but we need tx first to check if it's confirmed)
    const currentHeightUrl = `${config.baseUrl}/blocks/tip/height`;
    const currentHeight = await fetchWithRetry(currentHeightUrl);
    confirmations = currentHeight - tx.status.block_height + 1;
  }

  const verified = confirmations >= config.minConfirmations;

  return {
    verified,
    status: verified ? 'confirmed' : 'pending',
    resultStatus: VERIFICATION_STATUS.SUCCESS,
    confirmations,
    amount: amountBTC,
  };
}

/**
 * Verify Litecoin payment using BlockCypher API
 * Rate limit: 100 req/hour (free tier), 5000 req/hour with API key
 *
 * @param {string} txHash - Transaction hash
 * @param {string} expectedAddress - Expected recipient address
 * @param {string|number} expectedAmount - Expected amount in LTC
 * @returns {Promise<object>} Verification result
 */
export async function verifyLitecoinPayment(txHash, expectedAddress, expectedAmount) {
  const config = BLOCKCHAIN_CONFIG.LTC;
  const apiKey = process.env.BLOCKCYPHER_API_KEY;
  const url = apiKey
    ? `${config.baseUrl}/txs/${txHash}?token=${apiKey}`
    : `${config.baseUrl}/txs/${txHash}`;

  // Fetch transaction data from BlockCypher (may throw BlockchainAPIError)
  const tx = await fetchWithRetry(url);

  if (!tx || !tx.hash) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_NOT_FOUND,
      confirmations: 0,
      amount: '0',
      error: 'Transaction not found',
    };
  }

  // Check for double-spend
  if (tx.double_spend) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: '0',
      error: 'Transaction flagged as double-spend',
    };
  }

  // Find output to our address (BlockCypher uses addresses array)
  const output = tx.outputs?.find((o) => o.addresses?.includes(expectedAddress));

  if (!output) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: tx.confirmations || 0,
      amount: '0',
      error: 'Payment not sent to expected address',
    };
  }

  // BlockCypher returns value in litoshi (smallest unit)
  const amountLTC = (output.value / Math.pow(10, config.decimals)).toFixed(config.decimals);
  const expectedLTC = parseFloat(expectedAmount);

  // P0 SECURITY: Validate expectedAmount to prevent NaN bypass
  if (isNaN(expectedLTC) || expectedLTC <= 0) {
    logger.error('[BlockchainVerification] Invalid expected amount for LTC', { expectedAmount });
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: tx.confirmations || 0,
      amount: amountLTC,
      error: 'Invalid expected amount',
    };
  }

  // Check amount with tolerance
  const minAmount = expectedLTC * (1 - AMOUNT_TOLERANCE);
  if (parseFloat(amountLTC) < minAmount) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: tx.confirmations || 0,
      amount: amountLTC,
      error: `Insufficient amount: expected ${expectedLTC} LTC, received ${amountLTC} LTC`,
    };
  }

  // Check confirmations
  const confirmations = tx.confirmations || 0;
  const verified = confirmations >= config.minConfirmations;

  return {
    verified,
    status: verified ? 'confirmed' : 'pending',
    resultStatus: VERIFICATION_STATUS.SUCCESS,
    confirmations,
    amount: amountLTC,
  };
}

/**
 * Verify Ethereum payment using Etherscan API
 *
 * @param {string} txHash - Transaction hash
 * @param {string} expectedAddress - Expected recipient address
 * @param {string|number} expectedAmount - Expected amount in ETH
 * @returns {Promise<object>} Verification result
 */
export async function verifyEthereumPayment(txHash, expectedAddress, expectedAmount) {
  const config = BLOCKCHAIN_CONFIG.ETH;
  const apiKey = process.env.ETHERSCAN_API_KEY;

  if (!apiKey) {
    // Configuration error - not an API error, but not retryable
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: '0',
      error: 'ETHERSCAN_API_KEY not configured',
    };
  }

  // Get transaction details (may throw BlockchainAPIError)
  // V2 API requires chainid parameter
  const txUrl = `${config.baseUrl}?chainid=${config.chainId}&module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=${apiKey}`;
  const txData = await fetchWithRetry(txUrl);

  if (!txData.result) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_NOT_FOUND,
      confirmations: 0,
      amount: '0',
      error: 'Transaction not found',
    };
  }

  const tx = txData.result;

  // Verify recipient address
  if (tx.to?.toLowerCase() !== expectedAddress.toLowerCase()) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: '0',
      error: 'Payment not sent to expected address',
    };
  }

  // Convert wei to ETH
  const valueWei = parseInt(tx.value, 16);
  const amountETH = (valueWei / Math.pow(10, config.decimals)).toFixed(6); // 6 decimals for display
  const expectedETH = parseFloat(expectedAmount);

  // P0 SECURITY: Validate expectedAmount to prevent NaN bypass
  if (isNaN(expectedETH) || expectedETH <= 0) {
    logger.error('[BlockchainVerification] Invalid expected amount for ETH', { expectedAmount });
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: amountETH,
      error: 'Invalid expected amount',
    };
  }

  // Check amount with tolerance
  const minAmount = expectedETH * (1 - AMOUNT_TOLERANCE);
  if (parseFloat(amountETH) < minAmount) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: amountETH,
      error: `Insufficient amount: expected ${expectedETH} ETH, received ${amountETH} ETH`,
    };
  }

  // Parallel fetch: receipt + currentBlock (optimized from sequential calls)
  // V2 API requires chainid parameter
  const receiptUrl = `${config.baseUrl}?chainid=${config.chainId}&module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}&apikey=${apiKey}`;
  const currentBlockUrl = `${config.baseUrl}?chainid=${config.chainId}&module=proxy&action=eth_blockNumber&apikey=${apiKey}`;

  const [receiptData, currentBlockData] = await Promise.all([
    fetchWithRetry(receiptUrl),
    fetchWithRetry(currentBlockUrl),
  ]);

  const receipt = receiptData.result;
  if (!receipt) {
    return {
      verified: false,
      status: 'pending',
      resultStatus: VERIFICATION_STATUS.SUCCESS,
      confirmations: 0,
      amount: amountETH,
      error: 'Transaction pending confirmation',
    };
  }

  // Check transaction status (0x1 = success, 0x0 = failed)
  if (receipt.status !== '0x1') {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: amountETH,
      error: 'Transaction failed on blockchain',
    };
  }

  // Calculate confirmations
  const blockNumber = parseInt(receipt.blockNumber, 16);
  const currentBlock = parseInt(currentBlockData.result, 16);

  // BUG-PAY-003 FIX: Off-by-one error - include the block itself in confirmations
  const confirmations = currentBlock - blockNumber + 1;
  const verified = confirmations >= config.minConfirmations;

  return {
    verified,
    status: verified ? 'confirmed' : 'pending',
    resultStatus: VERIFICATION_STATUS.SUCCESS,
    confirmations,
    amount: amountETH,
  };
}

/**
 * Verify USDT TRC20 payment using TronGrid API
 *
 * @param {string} txHash - Transaction hash
 * @param {string} expectedAddress - Expected recipient address
 * @param {string|number} expectedAmount - Expected amount in USDT
 * @returns {Promise<object>} Verification result
 *
 * Retry strategy:
 * - API_ERROR (network/timeout): Caller should retry
 * - TX_NOT_FOUND: May appear later for new txs, can retry
 * - TX_INVALID: Transaction exists but validation failed, don't retry
 */
export async function verifyUSDTTRC20Payment(txHash, expectedAddress, expectedAmount) {
  const config = BLOCKCHAIN_CONFIG.USDT;
  const apiKey = process.env.TRONGRID_API_KEY;

  // Get transaction info (may throw BlockchainAPIError on network issues)
  let txInfo;
  try {
    const url = `${config.baseUrl}/wallet/gettransactioninfobyid`;
    txInfo = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'TRON-PRO-API-KEY': apiKey }),
      },
      data: { value: txHash },
    });
  } catch (error) {
    // Network/API error - caller should retry
    if (error.isAPIError) {
      logger.error('[BlockchainVerification] TRON API error fetching transaction', {
        txHash,
        error: error.message,
      });
      return {
        verified: false,
        status: 'failed',
        resultStatus: VERIFICATION_STATUS.API_ERROR,
        confirmations: 0,
        amount: '0',
        error: `TRON API error: ${error.message}`,
      };
    }
    throw error; // Re-throw non-API errors
  }

  if (!txInfo || Object.keys(txInfo).length === 0) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_NOT_FOUND,
      confirmations: 0,
      amount: '0',
      error: 'Transaction not found',
    };
  }

  // Check transaction receipt (0 = failed, 1 = success)
  if (txInfo.receipt?.result !== 'SUCCESS') {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: '0',
      error: 'Transaction failed on blockchain',
    };
  }

  // Parse Transfer event from logs
  const transferEvent = txInfo.log?.find(
    (log) =>
      log.address === config.contractAddress &&
      log.topics &&
      log.topics[0] === 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' // Transfer event signature
  );

  if (!transferEvent) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: '0',
      error: 'Not a USDT transfer transaction',
    };
  }

  // Decode recipient address from topics[2] (topics[1] is sender)
  const recipientHex = '41' + transferEvent.topics[2].substring(24); // Add TRON prefix, remove padding
  const recipientAddress = hexToBase58(recipientHex);

  if (recipientAddress !== expectedAddress) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: '0',
      error: 'Payment not sent to expected address',
    };
  }

  // Decode amount from data field
  const amountHex = transferEvent.data;
  const amountRaw = parseInt(amountHex, 16);
  const amountUSDT = (amountRaw / Math.pow(10, config.decimals)).toFixed(config.decimals);
  const expectedUSDT = parseFloat(expectedAmount);

  // P0 SECURITY: Validate expectedAmount to prevent NaN bypass
  if (isNaN(expectedUSDT) || expectedUSDT <= 0) {
    logger.error('[BlockchainVerification] Invalid expected amount for USDT', { expectedAmount });
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: txInfo.confirmations || 0,
      amount: amountUSDT,
      error: 'Invalid expected amount',
    };
  }

  // Check amount with tolerance
  const minAmount = expectedUSDT * (1 - AMOUNT_TOLERANCE);
  if (parseFloat(amountUSDT) < minAmount) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: txInfo.confirmations || 0,
      amount: amountUSDT,
      error: `Insufficient amount: expected ${expectedUSDT} USDT, received ${amountUSDT} USDT`,
    };
  }

  // Calculate confirmations (may throw BlockchainAPIError on network issues)
  let confirmations = 0;
  try {
    confirmations = txInfo.blockNumber
      ? await getTronConfirmations(txInfo.blockNumber)
      : 0;
  } catch (error) {
    // If we can't get confirmations due to API error, still return SUCCESS
    // with 0 confirmations - caller will retry and eventually get them
    // The important part is that amount and recipient were verified
    if (error.isAPIError) {
      logger.warn('[BlockchainVerification] TRON API error getting confirmations (will retry), using 0', {
        txHash,
        blockNumber: txInfo.blockNumber,
        error: error.message,
      });
    } else {
      logger.error('[BlockchainVerification] Unexpected error getting TRON confirmations', {
        txHash,
        blockNumber: txInfo.blockNumber,
        error: error.message,
      });
    }
  }

  const verified = confirmations >= config.minConfirmations;

  return {
    verified,
    status: verified ? 'confirmed' : 'pending',
    resultStatus: VERIFICATION_STATUS.SUCCESS,
    confirmations,
    amount: amountUSDT,
  };
}

/**
 * Get current confirmations for TRON transaction
 *
 * @param {number} blockNumber - Transaction block number
 * @returns {Promise<number>} Number of confirmations
 * @throws {BlockchainAPIError} If TronGrid API fails - caller should retry
 */
async function getTronConfirmations(blockNumber) {
  const config = BLOCKCHAIN_CONFIG.USDT;
  const apiKey = process.env.TRONGRID_API_KEY;

  const url = `${config.baseUrl}/wallet/getnowblock`;
  const currentBlock = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey && { 'TRON-PRO-API-KEY': apiKey }),
    },
  });

  const currentBlockNumber = currentBlock.block_header?.raw_data?.number || 0;
  return currentBlockNumber - blockNumber;
}

/**
 * Convert TRON hex address to Base58 format
 * Simplified version for address conversion
 *
 * @param {string} hexAddress - Hex address (with 41 prefix)
 * @returns {string} Base58 address
 */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(buffer) {
  let x = BigInt('0x' + buffer.toString('hex'));
  let output = '';
  while (x > 0) {
    const mod = x % 58n;
    output = BASE58_ALPHABET[Number(mod)] + output;
    x = x / 58n;
  }

  // Preserve leading zeros
  for (const byte of buffer.values()) {
    if (byte === 0) {
      output = '1' + output;
    } else {
      break;
    }
  }
  return output;
}

function hexToBase58(hexAddress) {
  // Convert TRON hex (41 + address) to Base58Check
  const payload = Buffer.from(hexAddress, 'hex');
  const hash0 = crypto.createHash('sha256').update(payload).digest();
  const hash1 = crypto.createHash('sha256').update(hash0).digest();
  const checksum = hash1.slice(0, 4);
  const full = Buffer.concat([payload, checksum]);
  return encodeBase58(full);
}

export default {
  VERIFICATION_STATUS,
  verifyPayment,
  verifyBitcoinPayment,
  verifyLitecoinPayment,
  verifyEthereumPayment,
  verifyUSDTTRC20Payment,
};
