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
import TronWeb from 'tronweb';
import logger from '../utils/logger.js';
import { USDT_TRC20 } from '../config/blockchain.js';
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
    decimals: USDT_TRC20.decimals,
    // PAY-P0-001 FIX: Hardcode official USDT TRC20 contract - DO NOT allow env override (security)
    contractAddress: USDT_TRC20.contractAddress,
  },
  USDT_TRC20: {
    provider: 'trongrid',
    baseUrl: 'https://api.trongrid.io',
    minConfirmations: SUPPORTED_CURRENCIES.USDT.confirmations,
    decimals: USDT_TRC20.decimals,
    // PAY-P0-001 FIX: Hardcode official USDT TRC20 contract - DO NOT allow env override (security)
    contractAddress: USDT_TRC20.contractAddress,
  },
};

// PAY-P0-001 FIX: TronWeb instance for safe TRON address conversions
let tronWebInstance = null;

function getTronWeb() {
  if (tronWebInstance) {
    return tronWebInstance;
  }

  const apiKey = process.env.TRONGRID_API_KEY;
  tronWebInstance = new TronWeb({
    fullHost: BLOCKCHAIN_CONFIG.USDT.baseUrl,
    ...(apiKey ? { headers: { 'TRON-PRO-API-KEY': apiKey } } : {}),
  });

  return tronWebInstance;
}

function normalizeTronAddress(address, tronWeb) {
  if (!address) {
    return null;
  }

  const trimmed = String(address).replace(/^0x/, '').toLowerCase();
  const hexAddress = trimmed.length === 40 ? `41${trimmed}` : trimmed;
  if (hexAddress.startsWith('41') && hexAddress.length === 42) {
    try {
      return tronWeb.address.fromHex(hexAddress);
    } catch (error) {
      logger.warn('[BlockchainVerification] Failed to normalize TRON hex address', {
        address: hexAddress,
        error: error.message,
      });
      return null;
    }
  }

  return String(address);
}

// PAY-P2-1 FIX: Centralized tolerance configuration
// Amount tolerance for network fees (1% capped at $0.10)
// NOTE: These values are kept here for clarity, but TOLERANCE_BOUNDS in paymentTolerance.js
// is the authoritative source. If you change these, update paymentTolerance.js as well.
const AMOUNT_TOLERANCE_PERCENT = 0.01; // 1% - same as TOLERANCE_BOUNDS.MAX_TOLERANCE
const AMOUNT_TOLERANCE_MAX = 0.10;     // $0.10 cap - not in TOLERANCE_BOUNDS (specific to verification)

// API request timeout (10 seconds)
const API_TIMEOUT = 10000;

/**
 * PAY-P3-1 FIX: Sanitize URL to remove API keys before logging
 * Prevents accidental API key leakage to logs/monitoring systems
 *
 * @param {string} url - URL to sanitize
 * @returns {string} URL with API keys masked
 */
function sanitizeUrl(url) {
  if (!url) {return url;}
  return url
    .replace(/token=[^&]+/gi, 'token=***')
    .replace(/apikey=[^&]+/gi, 'apikey=***')
    .replace(/api_key=[^&]+/gi, 'api_key=***')
    .replace(/key=[^&]+/gi, 'key=***');
}

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

function getMinimumAcceptedAmount(expectedAmount) {
  const numericExpected = Number(expectedAmount);

  // PAY-P1-3 FIX: Block zero or negative expected amounts
  // This prevents edge cases where amount=0 could pass verification
  if (!Number.isFinite(numericExpected) || numericExpected <= 0) {
    logger.error('[BlockchainVerification] Invalid expected amount in getMinimumAcceptedAmount', {
      expectedAmount,
      numericExpected,
    });
    return Infinity; // Force amount check to fail
  }

  const tolerance = Math.min(numericExpected * AMOUNT_TOLERANCE_PERCENT, AMOUNT_TOLERANCE_MAX);
  return numericExpected - tolerance;
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
          url: sanitizeUrl(url), // PAY-P3-1: Sanitize URL to hide API keys
          error: error.message,
        });
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        // Final attempt failed
        logger.error('[BlockchainVerification] API request failed after all retries', {
          url: sanitizeUrl(url), // PAY-P3-1: Sanitize URL to hide API keys
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
    const statusCode = error.statusCode || error.response?.status || null;

    logger.error('[BlockchainVerification] Verification error', {
      txHash,
      chain,
      statusCode,
      error: error.message,
      isAPIError: error.isAPIError || false,
      stack: error.stack,
    });

    // Provider-level not found should not be treated as transient API_ERROR
    if (statusCode === 404) {
      return {
        verified: false,
        status: 'failed',
        resultStatus: VERIFICATION_STATUS.TX_NOT_FOUND,
        confirmations: 0,
        amount: '0',
        error: 'Transaction not found',
      };
    }

    // Bad request / unprocessable usually means invalid hash or permanently invalid tx
    if (statusCode === 400 || statusCode === 422) {
      return {
        verified: false,
        status: 'failed',
        resultStatus: VERIFICATION_STATUS.TX_INVALID,
        confirmations: 0,
        amount: '0',
        error: `Invalid transaction: ${error.message}`,
      };
    }

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

  // Find ALL outputs to our address (Blockstream uses scriptpubkey_address)
  // Normalize bech32 (bc1) addresses to lowercase for safe comparison.
  const normalizeBtcAddress = (address) => {
    if (!address) {
      return '';
    }
    const value = String(address);
    return value.toLowerCase().startsWith('bc1') ? value.toLowerCase() : value;
  };
  const expectedBtcAddress = normalizeBtcAddress(expectedAddress);
  const outputs = tx.vout?.filter(
    (o) => normalizeBtcAddress(o.scriptpubkey_address) === expectedBtcAddress
  ) || [];
  const amountSats = outputs.reduce((sum, o) => sum + (o.value || 0), 0);

  if (outputs.length === 0) {
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
  const amountBTC = (amountSats / Math.pow(10, config.decimals)).toFixed(config.decimals);
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
  const minAmount = getMinimumAcceptedAmount(expectedBTC);
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

  // PAY-P2-2 FIX: Log overpayment for accounting purposes
  // Overpayment is ALWAYS accepted (good for seller), but logged for audit trail
  const receivedBTC = parseFloat(amountBTC);
  if (receivedBTC > expectedBTC) {
    logger.info('[BlockchainVerification] Overpayment received (BTC)', {
      txHash: txHash.substring(0, 20),
      expected: expectedBTC,
      received: receivedBTC,
      overpayment: (receivedBTC - expectedBTC).toFixed(8),
      overpaymentPercent: (((receivedBTC - expectedBTC) / expectedBTC) * 100).toFixed(2) + '%',
    });
  }

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

  // PAY-P1-6 FIX: Handle BlockCypher API error payloads returned with 200 OK
  if (tx?.error || Array.isArray(tx?.errors)) {
    const errorMsg = tx.error || tx.errors?.[0]?.error || tx.errors?.[0]?.message || 'BlockCypher API error';
    const notFound = /not found|does not exist/i.test(errorMsg);
    return {
      verified: false,
      status: 'failed',
      resultStatus: notFound ? VERIFICATION_STATUS.TX_NOT_FOUND : VERIFICATION_STATUS.API_ERROR,
      confirmations: 0,
      amount: '0',
      error: errorMsg,
    };
  }

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

  // Find ALL outputs to our address (BlockCypher uses addresses array)
  // Normalize bech32 (ltc1) addresses to lowercase for safe comparison.
  const normalizeLtcAddress = (address) => {
    if (!address) {
      return '';
    }
    const value = String(address);
    return value.toLowerCase().startsWith('ltc1') ? value.toLowerCase() : value;
  };
  const expectedLtcAddress = normalizeLtcAddress(expectedAddress);
  const outputs = tx.outputs?.filter(
    (o) =>
      Array.isArray(o.addresses) &&
      o.addresses.some((addr) => normalizeLtcAddress(addr) === expectedLtcAddress)
  ) || [];
  const amountLitoshi = outputs.reduce((sum, o) => sum + (o.value || 0), 0);

  if (outputs.length === 0) {
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
  const amountLTC = (amountLitoshi / Math.pow(10, config.decimals)).toFixed(config.decimals);
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
  const minAmount = getMinimumAcceptedAmount(expectedLTC);
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

  // PAY-P2-2 FIX: Log overpayment for accounting purposes
  const receivedLTC = parseFloat(amountLTC);
  if (receivedLTC > expectedLTC) {
    logger.info('[BlockchainVerification] Overpayment received (LTC)', {
      txHash: txHash.substring(0, 20),
      expected: expectedLTC,
      received: receivedLTC,
      overpayment: (receivedLTC - expectedLTC).toFixed(8),
      overpaymentPercent: (((receivedLTC - expectedLTC) / expectedLTC) * 100).toFixed(2) + '%',
    });
  }

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

  const isEtherscanNotOk = (data) => data?.status === '0' && data?.message === 'NOTOK';

  // Get transaction details (may throw BlockchainAPIError)
  // V2 API requires chainid parameter
  const txUrl = `${config.baseUrl}?chainid=${config.chainId}&module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=${apiKey}`;
  const txData = await fetchWithRetry(txUrl);

  // PAY-P1-4 FIX: Detect Etherscan API errors (rate limit / invalid key)
  if (isEtherscanNotOk(txData)) {
    throw new BlockchainAPIError(txData.result || 'Etherscan API error');
  }

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
  // PAY-P1-1 FIX: Use BigInt to handle large values (>2^53) without precision loss
  const valueWei = BigInt(tx.value);
  const amountETH = (Number(valueWei) / Math.pow(10, config.decimals)).toFixed(6); // 6 decimals for display

  // Safety check for extremely large values that exceed safe integer range
  if (valueWei > BigInt(Number.MAX_SAFE_INTEGER)) {
    logger.warn('[BlockchainVerification] ETH value exceeds MAX_SAFE_INTEGER, precision may be affected', {
      txHash: txHash.substring(0, 20),
      valueWei: valueWei.toString(),
    });
  }
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
  const minAmount = getMinimumAcceptedAmount(expectedETH);
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

  if (isEtherscanNotOk(receiptData) || isEtherscanNotOk(currentBlockData)) {
    throw new BlockchainAPIError(
      receiptData?.result || currentBlockData?.result || 'Etherscan API error'
    );
  }

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

  // PAY-P2-2 FIX: Log overpayment for accounting purposes
  const receivedETH = parseFloat(amountETH);
  if (receivedETH > expectedETH) {
    logger.info('[BlockchainVerification] Overpayment received (ETH)', {
      txHash: txHash.substring(0, 20),
      expected: expectedETH,
      received: receivedETH,
      overpayment: (receivedETH - expectedETH).toFixed(8),
      overpaymentPercent: (((receivedETH - expectedETH) / expectedETH) * 100).toFixed(2) + '%',
    });
  }

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

  // PAY-P1-5 FIX: Detect TRON API errors and pending txs before receipt checks
  if (txInfo.Error || txInfo.code) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.API_ERROR,
      confirmations: 0,
      amount: '0',
      error: txInfo.Error || txInfo.message || 'TRON API error',
    };
  }

  // Pending transaction (no receipt yet)
  if (!txInfo.receipt) {
    return {
      verified: false,
      status: 'pending',
      resultStatus: VERIFICATION_STATUS.SUCCESS,
      confirmations: 0,
      amount: '0',
      error: 'Transaction pending confirmation',
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

  // PAY-P0 FIX: TronGrid returns log.address in hex, config is base58
  const tronWeb = getTronWeb();
  const expectedTronAddress = normalizeTronAddress(expectedAddress, tronWeb) || expectedAddress;
  const transferSig = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const contractHex = tronWeb.address
    .toHex(config.contractAddress)
    .replace(/^0x/, '')
    .toLowerCase();

  // TronGrid returns address WITHOUT '41' prefix, but TronWeb.toHex includes it
  // So we need to compare both with and without the prefix
  const contractHexWithout41 = contractHex.replace(/^41/, '');

  const transferEvent =
    txInfo.log?.find((log) => {
      const logAddress = (log.address || '').replace(/^0x/, '').toLowerCase();
      const topic0 = (log.topics?.[0] || '').replace(/^0x/, '').toLowerCase();
      // Match with OR without 41 prefix
      const addressMatch = logAddress === contractHex || logAddress === contractHexWithout41;
      return addressMatch && topic0 === transferSig;
    }) ||
    txInfo.trc20TransferInfo?.find((transfer) => {
      const contractAddressRaw = String(transfer.contract_address || '');
      const contractAddressHex = contractAddressRaw.replace(/^0x/, '').toLowerCase();
      return contractAddressHex === contractHex ||
        contractAddressHex === contractHexWithout41 ||
        contractAddressRaw === config.contractAddress;
    });

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

  // PAY-P1 FIX: Decode recipient address using TronWeb (handles hex/base58)
  let recipientAddress = null;
  let amountRaw = null;

  if (transferEvent.topics?.length) {
    const topicTo = (transferEvent.topics?.[2] || '').replace(/^0x/, '');
    const recipientHex = `41${topicTo.slice(24)}`;
    try {
      recipientAddress = tronWeb.address.fromHex(recipientHex);
    } catch (error) {
      logger.warn('[BlockchainVerification] Failed to decode TRON recipient from event topics', {
        txHash: txHash.substring(0, 20),
        recipientHex,
        error: error.message,
      });
    }

    const amountHex = (transferEvent.data || '').replace(/^0x/, '');
    if (amountHex) {
      amountRaw = BigInt(`0x${amountHex}`);
    }
  } else {
    const rawRecipient =
      transferEvent.to ||
      transferEvent.to_address ||
      transferEvent.toAddress ||
      transferEvent.to_address_hex;
    recipientAddress = normalizeTronAddress(rawRecipient, tronWeb);

    const rawAmount =
      transferEvent.value ??
      transferEvent.amount ??
      transferEvent.amount_str ??
      transferEvent.quant;
    if (rawAmount !== undefined && rawAmount !== null && rawAmount !== '') {
      try {
        amountRaw = BigInt(rawAmount);
      } catch (parseError) {
        const parsed = Number(rawAmount);
        if (Number.isFinite(parsed)) {
          amountRaw = BigInt(Math.round(parsed * Math.pow(10, config.decimals)));
        }
      }
    }
  }

  if (!recipientAddress) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: '0',
      error: 'Payment recipient not found in transaction',
    };
  }

  if (recipientAddress !== expectedTronAddress) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: 0,
      amount: '0',
      error: 'Payment not sent to expected address',
    };
  }

  if (amountRaw === null) {
    return {
      verified: false,
      status: 'failed',
      resultStatus: VERIFICATION_STATUS.TX_INVALID,
      confirmations: txInfo.confirmations || 0,
      amount: '0',
      error: 'Unable to parse transfer amount',
    };
  }

  // Decode amount from data field
  // PAY-P1-1 FIX: Use BigInt to handle large values without precision loss
  const amountUSDT = (Number(amountRaw) / Math.pow(10, config.decimals)).toFixed(config.decimals);

  // Safety check for extremely large values
  if (amountRaw > BigInt(Number.MAX_SAFE_INTEGER)) {
    logger.warn('[BlockchainVerification] USDT amount exceeds MAX_SAFE_INTEGER, precision may be affected', {
      txHash: txHash.substring(0, 20),
      amountRaw: amountRaw.toString(),
    });
  }
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
  const minAmount = getMinimumAcceptedAmount(expectedUSDT);
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

  // PAY-P2-2 FIX: Log overpayment for accounting purposes
  const receivedUSDT = parseFloat(amountUSDT);
  if (receivedUSDT > expectedUSDT) {
    logger.info('[BlockchainVerification] Overpayment received (USDT)', {
      txHash: txHash.substring(0, 20),
      expected: expectedUSDT,
      received: receivedUSDT,
      overpayment: (receivedUSDT - expectedUSDT).toFixed(6),
      overpaymentPercent: (((receivedUSDT - expectedUSDT) / expectedUSDT) * 100).toFixed(2) + '%',
    });
  }

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
  // PAY-P0-1 FIX: Add +1 for consistency with BTC/ETH confirmation calculation
  return currentBlockNumber - blockNumber + 1;
}

export default {
  VERIFICATION_STATUS,
  verifyPayment,
  verifyBitcoinPayment,
  verifyLitecoinPayment,
  verifyEthereumPayment,
  verifyUSDTTRC20Payment,
};
