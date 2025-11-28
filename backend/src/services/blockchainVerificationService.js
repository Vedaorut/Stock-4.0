/**
 * Blockchain Verification Service
 *
 * Verifies cryptocurrency payments via public blockchain APIs.
 * Supports: Bitcoin (BTC), Litecoin (LTC), Ethereum (ETH), USDT TRC20.
 *
 * Features:
 * - Multi-chain verification with chain-specific min confirmations
 * - 2% amount tolerance for network fees
 * - Retry logic with exponential backoff for API failures
 * - Comprehensive error handling with descriptive messages
 * - Double-spend detection (Bitcoin/Litecoin)
 * - Transaction receipt validation (Ethereum)
 * - Smart contract event parsing (USDT TRC20)
 */

import axios from 'axios';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { SUPPORTED_CURRENCIES } from '../utils/constants.js';

// API endpoints configuration
const BLOCKCHAIN_CONFIG = {
  BTC: {
    provider: 'blockcypher',
    baseUrl: 'https://api.blockcypher.com/v1/btc/main',
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
    baseUrl: 'https://api.etherscan.io/api',
    minConfirmations: SUPPORTED_CURRENCIES.ETH.confirmations,
    decimals: SUPPORTED_CURRENCIES.ETH.decimals,
  },
  USDT: {
    provider: 'trongrid',
    baseUrl: 'https://api.trongrid.io',
    minConfirmations: SUPPORTED_CURRENCIES.USDT.confirmations,
    decimals: SUPPORTED_CURRENCIES.USDT.decimals,
    contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT TRC20 contract
  },
  USDT_TRC20: {
    provider: 'trongrid',
    baseUrl: 'https://api.trongrid.io',
    minConfirmations: SUPPORTED_CURRENCIES.USDT.confirmations,
    decimals: SUPPORTED_CURRENCIES.USDT.decimals,
    contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  },
};

// Amount tolerance for network fees (2%)
const AMOUNT_TOLERANCE = 0.02;

// API request timeout (10 seconds)
const API_TIMEOUT = 10000;

/**
 * Fetch data from API with retry logic
 *
 * @param {string} url - API endpoint URL
 * @param {object} options - Axios request options
 * @param {number} retries - Number of retry attempts (default: 3)
 * @returns {Promise<object>} API response data
 * @throws {Error} If all retries fail
 */
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios({
        url,
        timeout: API_TIMEOUT,
        ...options,
      });
      return response.data;
    } catch (error) {
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
        throw error;
      }
    }
  }
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
 *   verified: boolean,        // True if payment is valid and confirmed
 *   status: string,            // 'pending' | 'confirmed' | 'failed'
 *   confirmations: number,     // Current number of confirmations
 *   amount: string,            // Actual amount received (as string to preserve precision)
 *   error?: string             // Error message if verification failed
 * }
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
        confirmations: 0,
        amount: '0',
        error: 'Invalid transaction hash',
      };
    }

    if (!BLOCKCHAIN_CONFIG[normalizedChain]) {
      return {
        verified: false,
        status: 'failed',
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
        throw new Error(`No verifier implemented for chain: ${chain}`);
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
      chain: normalizedChain,
      error: error.message,
      stack: error.stack,
    });

    return {
      verified: false,
      status: 'failed',
      confirmations: 0,
      amount: '0',
      error: `Verification failed: ${error.message}`,
    };
  }
}

/**
 * Verify Bitcoin payment using BlockCypher API
 *
 * @param {string} txHash - Transaction hash
 * @param {string} expectedAddress - Expected recipient address
 * @param {string|number} expectedAmount - Expected amount in BTC
 * @returns {Promise<object>} Verification result
 */
export async function verifyBitcoinPayment(txHash, expectedAddress, expectedAmount) {
  try {
    const config = BLOCKCHAIN_CONFIG.BTC;
    const url = `${config.baseUrl}/txs/${txHash}`;

    // Fetch transaction data from BlockCypher
    const tx = await fetchWithRetry(url);

    // Check for double-spend
    if (tx.double_spend) {
      return {
        verified: false,
        status: 'failed',
        confirmations: 0,
        amount: '0',
        error: 'Transaction flagged as double-spend',
      };
    }

    // Find output to our address
    const output = tx.outputs?.find((o) => o.addresses?.includes(expectedAddress));

    if (!output) {
      return {
        verified: false,
        status: 'failed',
        confirmations: tx.confirmations || 0,
        amount: '0',
        error: 'Payment not sent to expected address',
      };
    }

    // Convert satoshi to BTC
    const amountBTC = (output.value / Math.pow(10, config.decimals)).toFixed(config.decimals);
    const expectedBTC = parseFloat(expectedAmount);

    // Check amount with tolerance
    const minAmount = expectedBTC * (1 - AMOUNT_TOLERANCE);
    if (parseFloat(amountBTC) < minAmount) {
      return {
        verified: false,
        status: 'failed',
        confirmations: tx.confirmations || 0,
        amount: amountBTC,
        error: `Insufficient amount: expected ${expectedBTC} BTC, received ${amountBTC} BTC`,
      };
    }

    // Check confirmations
    const confirmations = tx.confirmations || 0;
    const verified = confirmations >= config.minConfirmations;

    return {
      verified,
      status: verified ? 'confirmed' : 'pending',
      confirmations,
      amount: amountBTC,
    };
  } catch (error) {
    logger.error('[BlockchainVerification] Bitcoin verification failed', {
      txHash,
      error: error.message,
    });
    throw new Error(`Bitcoin verification failed: ${error.message}`);
  }
}

/**
 * Verify Litecoin payment using BlockCypher API
 * (Same logic as Bitcoin, different endpoint)
 *
 * @param {string} txHash - Transaction hash
 * @param {string} expectedAddress - Expected recipient address
 * @param {string|number} expectedAmount - Expected amount in LTC
 * @returns {Promise<object>} Verification result
 */
export async function verifyLitecoinPayment(txHash, expectedAddress, expectedAmount) {
  try {
    const config = BLOCKCHAIN_CONFIG.LTC;
    const url = `${config.baseUrl}/txs/${txHash}`;

    // Fetch transaction data from BlockCypher
    const tx = await fetchWithRetry(url);

    // Check for double-spend
    if (tx.double_spend) {
      return {
        verified: false,
        status: 'failed',
        confirmations: 0,
        amount: '0',
        error: 'Transaction flagged as double-spend',
      };
    }

    // Find output to our address
    const output = tx.outputs?.find((o) => o.addresses?.includes(expectedAddress));

    if (!output) {
      return {
        verified: false,
        status: 'failed',
        confirmations: tx.confirmations || 0,
        amount: '0',
        error: 'Payment not sent to expected address',
      };
    }

    // Convert litoshi to LTC
    const amountLTC = (output.value / Math.pow(10, config.decimals)).toFixed(config.decimals);
    const expectedLTC = parseFloat(expectedAmount);

    // Check amount with tolerance
    const minAmount = expectedLTC * (1 - AMOUNT_TOLERANCE);
    if (parseFloat(amountLTC) < minAmount) {
      return {
        verified: false,
        status: 'failed',
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
      confirmations,
      amount: amountLTC,
    };
  } catch (error) {
    logger.error('[BlockchainVerification] Litecoin verification failed', {
      txHash,
      error: error.message,
    });
    throw new Error(`Litecoin verification failed: ${error.message}`);
  }
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
  try {
    const config = BLOCKCHAIN_CONFIG.ETH;
    const apiKey = process.env.ETHERSCAN_API_KEY;

    if (!apiKey) {
      throw new Error('ETHERSCAN_API_KEY not configured');
    }

    // Get transaction details
    const txUrl = `${config.baseUrl}?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=${apiKey}`;
    const txData = await fetchWithRetry(txUrl);

    if (!txData.result) {
      return {
        verified: false,
        status: 'failed',
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
        confirmations: 0,
        amount: '0',
        error: 'Payment not sent to expected address',
      };
    }

    // Convert wei to ETH
    const valueWei = parseInt(tx.value, 16);
    const amountETH = (valueWei / Math.pow(10, config.decimals)).toFixed(6); // 6 decimals for display
    const expectedETH = parseFloat(expectedAmount);

    // Check amount with tolerance
    const minAmount = expectedETH * (1 - AMOUNT_TOLERANCE);
    if (parseFloat(amountETH) < minAmount) {
      return {
        verified: false,
        status: 'failed',
        confirmations: 0,
        amount: amountETH,
        error: `Insufficient amount: expected ${expectedETH} ETH, received ${amountETH} ETH`,
      };
    }

    // Get transaction receipt for status and confirmations
    const receiptUrl = `${config.baseUrl}?module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}&apikey=${apiKey}`;
    const receiptData = await fetchWithRetry(receiptUrl);

    const receipt = receiptData.result;
    if (!receipt) {
      return {
        verified: false,
        status: 'pending',
        confirmations: 0,
        amount: amountETH,
        error: 'Transaction pending',
      };
    }

    // Check transaction status (0x1 = success, 0x0 = failed)
    if (receipt.status !== '0x1') {
      return {
        verified: false,
        status: 'failed',
        confirmations: 0,
        amount: amountETH,
        error: 'Transaction failed on blockchain',
      };
    }

    // Calculate confirmations
    const blockNumber = parseInt(receipt.blockNumber, 16);
    const currentBlockUrl = `${config.baseUrl}?module=proxy&action=eth_blockNumber&apikey=${apiKey}`;
    const currentBlockData = await fetchWithRetry(currentBlockUrl);
    const currentBlock = parseInt(currentBlockData.result, 16);

    const confirmations = currentBlock - blockNumber;
    const verified = confirmations >= config.minConfirmations;

    return {
      verified,
      status: verified ? 'confirmed' : 'pending',
      confirmations,
      amount: amountETH,
    };
  } catch (error) {
    logger.error('[BlockchainVerification] Ethereum verification failed', {
      txHash,
      error: error.message,
    });
    throw new Error(`Ethereum verification failed: ${error.message}`);
  }
}

/**
 * Verify USDT TRC20 payment using TronGrid API
 *
 * @param {string} txHash - Transaction hash
 * @param {string} expectedAddress - Expected recipient address
 * @param {string|number} expectedAmount - Expected amount in USDT
 * @returns {Promise<object>} Verification result
 */
export async function verifyUSDTTRC20Payment(txHash, expectedAddress, expectedAmount) {
  try {
    const config = BLOCKCHAIN_CONFIG.USDT;
    const apiKey = process.env.TRONGRID_API_KEY;

    // Get transaction info
    const url = `${config.baseUrl}/wallet/gettransactioninfobyid`;
    const txInfo = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'TRON-PRO-API-KEY': apiKey }),
      },
      data: { value: txHash },
    });

    if (!txInfo || Object.keys(txInfo).length === 0) {
      return {
        verified: false,
        status: 'failed',
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

    // Check amount with tolerance
    const minAmount = expectedUSDT * (1 - AMOUNT_TOLERANCE);
    if (parseFloat(amountUSDT) < minAmount) {
      return {
        verified: false,
        status: 'failed',
        confirmations: txInfo.confirmations || 0,
        amount: amountUSDT,
        error: `Insufficient amount: expected ${expectedUSDT} USDT, received ${amountUSDT} USDT`,
      };
    }

    // Calculate confirmations
    const confirmations = txInfo.blockNumber
      ? await getTronConfirmations(txInfo.blockNumber)
      : 0;

    const verified = confirmations >= config.minConfirmations;

    return {
      verified,
      status: verified ? 'confirmed' : 'pending',
      confirmations,
      amount: amountUSDT,
    };
  } catch (error) {
    logger.error('[BlockchainVerification] USDT TRC20 verification failed', {
      txHash,
      error: error.message,
    });
    throw new Error(`USDT TRC20 verification failed: ${error.message}`);
  }
}

/**
 * Get current confirmations for TRON transaction
 *
 * @param {number} blockNumber - Transaction block number
 * @returns {Promise<number>} Number of confirmations
 */
async function getTronConfirmations(blockNumber) {
  try {
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
  } catch (error) {
    logger.error('[BlockchainVerification] Failed to get TRON confirmations', {
      blockNumber,
      error: error.message,
    });
    return 0;
  }
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
  verifyPayment,
  verifyBitcoinPayment,
  verifyLitecoinPayment,
  verifyEthereumPayment,
  verifyUSDTTRC20Payment,
};
