import axios from 'axios';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Crypto payment verification service
 */
class CryptoService {
  constructor() {
    this.etherscanApiKey = config.crypto.etherscanApiKey;
    this.blockchainApiKey = config.crypto.blockchainApiKey;
    this.trongridApiKey = config.crypto.trongridApiKey;
  }

  /**
   * Retry helper with exponential backoff
   * @param {Function} fn - Async function to retry
   * @param {number} maxRetries - Maximum retry attempts (default: 3)
   * @param {number} baseDelay - Base delay in ms (default: 1000)
   * @returns {Promise} Result of function
   */
  async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const isLastAttempt = attempt === maxRetries - 1;
        
        if (isLastAttempt) {
          logger.error(`[Retry] All ${maxRetries} attempts failed:`, error.message);
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt);
        logger.warn(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Verify Bitcoin transaction
   * @param {string} txHash - Transaction hash
   * @param {string} expectedAddress - Expected receiving address
   * @param {number} expectedAmount - Expected amount in BTC
   * @returns {object} - Verification result
   */
  async verifyBitcoinTransaction(txHash, expectedAddress, expectedAmount) {
    try {
      // Use retry logic for blockchain API calls
      const response = await this.retryWithBackoff(async () => {
        return await axios.get(
          `https://blockchain.info/rawtx/${txHash}`,
          {
            params: {
              apikey: this.blockchainApiKey
            },
            timeout: 10000
          }
        );
      });

      const tx = response.data;

      // Check if transaction exists
      if (!tx) {
        return {
          verified: false,
          error: 'Transaction not found'
        };
      }

      // Find output to expected address
      const output = tx.out.find(out =>
        out.addr === expectedAddress
      );

      if (!output) {
        return {
          verified: false,
          error: 'Address not found in transaction outputs'
        };
      }

      // Convert satoshis to BTC
      const amountBTC = output.value / 100000000;

      // Check amount (allow 1% tolerance for fees)
      const tolerance = expectedAmount * 0.01;
      const amountMatches = Math.abs(amountBTC - expectedAmount) <= tolerance;

      if (!amountMatches) {
        return {
          verified: false,
          error: `Amount mismatch. Expected: ${expectedAmount} BTC, Received: ${amountBTC} BTC`
        };
      }

      // Get confirmations (consider confirmed at 3+ confirmations)
      const confirmations = tx.block_height ?
        await this.getBitcoinBlockHeight() - tx.block_height + 1 : 0;

      return {
        verified: true,
        confirmations,
        amount: amountBTC,
        txHash,
        status: confirmations >= 3 ? 'confirmed' : 'pending'
      };

    } catch (error) {
      logger.error('Bitcoin verification error:', { error: error.message, stack: error.stack });
      return {
        verified: false,
        error: error.message
      };
    }
  }

  /**
   * Verify Ethereum transaction (ETH only)
   * @param {string} txHash - Transaction hash
   * @param {string} expectedAddress - Expected receiving address
   * @param {number} expectedAmount - Expected amount in ETH
   * @returns {object} - Verification result
   */
  async verifyEthereumTransaction(txHash, expectedAddress, expectedAmount) {
    try {
      // Get transaction receipt
      const response = await axios.get(
        'https://api.etherscan.io/api',
        {
          params: {
            module: 'proxy',
            action: 'eth_getTransactionByHash',
            txhash: txHash,
            apikey: this.etherscanApiKey
          }
        }
      );

      const tx = response.data.result;

      if (!tx) {
        return {
          verified: false,
          error: 'Transaction not found'
        };
      }

      // Get transaction receipt for status
      // Get transaction receipt with retry
      const receiptResponse = await this.retryWithBackoff(async () => {
        return await axios.get(
          'https://api.etherscan.io/api',
          {
            params: {
              module: 'proxy',
              action: 'eth_getTransactionReceipt',
              txhash: txHash,
              apikey: this.etherscanApiKey
            },
            timeout: 10000
          }
        );
      });

      const receipt = receiptResponse.data.result;
      
      // Check if transaction was reverted
      if (!receipt || receipt.status === '0x0') {
        return {
          verified: false,
          error: 'Transaction failed or reverted'
        };
      }

      // Verify ETH transaction
      if (tx.to.toLowerCase() !== expectedAddress.toLowerCase()) {
        return {
          verified: false,
          error: 'Address mismatch'
        };
      }

      // Convert wei to ETH
      const amountETH = parseInt(tx.value, 16) / 1e18;

      // Check amount (allow 1% tolerance)
      const tolerance = expectedAmount * 0.01;
      const amountMatches = Math.abs(amountETH - expectedAmount) <= tolerance;

      if (!amountMatches) {
        return {
          verified: false,
          error: `Amount mismatch. Expected: ${expectedAmount} ETH, Received: ${amountETH} ETH`
        };
      }

      // Ensure transaction is successful
      if (receipt.status !== '0x1') {
        return {
          verified: false,
          error: 'Transaction was reverted or failed'
        };
      }
      
      return {
        verified: true,
        confirmations: receipt.confirmations || 0,
        amount: amountETH,
        txHash,
        status: 'confirmed'
      };

    } catch (error) {
      logger.error('Ethereum verification error:', { error: error.message, stack: error.stack });
      return {
        verified: false,
        error: error.message
      };
    }
  }



  /**
   * Get current Bitcoin block height
   */
  async getBitcoinBlockHeight() {
    try {
      const response = await axios.get('https://blockchain.info/latestblock');
      return response.data.height;
    } catch (error) {
      logger.error('Get block height error:', { error: error.message, stack: error.stack });
      return 0;
    }
  }

  /**
   * Verify USDT TRC-20 transaction on Tron network
   * @param {string} txHash - Transaction hash
   * @param {string} expectedAddress - Expected receiving address (TR...)
   * @param {number} expectedAmount - Expected amount in USDT
   * @returns {object} - Verification result
   */
  async verifyUSDTTRC20Transaction(txHash, expectedAddress, expectedAmount) {
    try {
      // TronGrid API endpoint
      const response = await this.retryWithBackoff(async () => {
        return await axios.post(
          'https://api.trongrid.io/wallet/gettransactionbyid',
          { value: txHash },
          {
            headers: {
              'TRON-PRO-API-KEY': this.trongridApiKey || ''
            },
            timeout: 10000
          }
        );
      });

      const tx = response.data;

      // Check if transaction exists
      if (!tx || !tx.ret || tx.ret.length === 0) {
        return {
          verified: false,
          error: 'Transaction not found'
        };
      }

      // Check if transaction was successful
      if (tx.ret[0].contractRet !== 'SUCCESS') {
        return {
          verified: false,
          error: 'Transaction failed'
        };
      }

      // USDT TRC-20 contract address on Tron
      const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

      // Find TRC-20 transfer in contract data
      const contract = tx.raw_data?.contract?.[0];
      if (!contract || contract.type !== 'TriggerSmartContract') {
        return {
          verified: false,
          error: 'Not a smart contract transaction'
        };
      }

      const contractAddress = this.tronAddressFromHex(contract.parameter.value.contract_address);
      if (contractAddress !== USDT_CONTRACT) {
        return {
          verified: false,
          error: 'Not a USDT TRC-20 transaction'
        };
      }

      // Decode transfer method call (first 8 characters = method signature 'a9059cbb' = transfer)
      const data = contract.parameter.value.data;
      if (!data || !data.startsWith('a9059cbb')) {
        return {
          verified: false,
          error: 'Not a transfer transaction'
        };
      }

      // Decode recipient address (next 64 characters, last 40 are address)
      const recipientHex = data.substring(8, 72).substring(24);
      const recipientAddress = this.tronAddressFromHex(recipientHex);

      if (recipientAddress !== expectedAddress) {
        return {
          verified: false,
          error: 'Address mismatch'
        };
      }

      // Decode amount (next 64 characters) - USDT has 6 decimals
      const amountHex = data.substring(72, 136);
      const amountUSDT = parseInt(amountHex, 16) / 1e6;

      // Check amount (allow 1% tolerance)
      const tolerance = expectedAmount * 0.01;
      const amountMatches = Math.abs(amountUSDT - expectedAmount) <= tolerance;

      if (!amountMatches) {
        return {
          verified: false,
          error: `Amount mismatch. Expected: ${expectedAmount} USDT, Received: ${amountUSDT} USDT`
        };
      }

      // Get confirmations (Tron finality is ~19 blocks)
      const info = await this.retryWithBackoff(async () => {
        return await axios.post(
          'https://api.trongrid.io/wallet/gettransactioninfobyid',
          { value: txHash },
          {
            headers: {
              'TRON-PRO-API-KEY': this.trongridApiKey || ''
            },
            timeout: 10000
          }
        );
      });

      const blockNumber = info.data?.blockNumber || 0;
      const confirmations = blockNumber > 0 ? 20 : 0; // Simplified: assume confirmed if in block

      return {
        verified: true,
        confirmations,
        amount: amountUSDT,
        txHash,
        status: confirmations >= 19 ? 'confirmed' : 'pending'
      };

    } catch (error) {
      logger.error('USDT TRC-20 verification error:', { error: error.message, stack: error.stack });
      return {
        verified: false,
        error: error.message
      };
    }
  }

  /**
   * Convert Tron hex address to base58 address
   * Simplified version - in production use tronweb library
   */
  tronAddressFromHex(hex) {
    // This is a simplified placeholder
    // In production, use: tronWeb.address.fromHex('41' + hex)
    // For now, return hex as-is for basic validation
    return hex;
  }

  /**
   * Verify Litecoin transaction
   * @param {string} txHash - Transaction hash
   * @param {string} expectedAddress - Expected receiving address
   * @param {number} expectedAmount - Expected amount in LTC
   * @returns {object} - Verification result
   */
  async verifyLitecoinTransaction(txHash, expectedAddress, expectedAmount) {
    try {
      // Use Blockchair API for Litecoin
      const response = await this.retryWithBackoff(async () => {
        return await axios.get(
          `https://api.blockchair.com/litecoin/dashboards/transaction/${txHash}`,
          { timeout: 10000 }
        );
      });

      const txData = response.data?.data?.[txHash];

      if (!txData || !txData.transaction) {
        return {
          verified: false,
          error: 'Transaction not found'
        };
      }

      const tx = txData.transaction;
      const outputs = txData.outputs || [];

      // Find output to expected address
      const output = outputs.find(out => out.recipient === expectedAddress);

      if (!output) {
        return {
          verified: false,
          error: 'Address not found in transaction outputs'
        };
      }

      // Convert litoshi to LTC (1 LTC = 100,000,000 litoshi)
      const amountLTC = output.value / 100000000;

      // Check amount (allow 1% tolerance for fees)
      const tolerance = expectedAmount * 0.01;
      const amountMatches = Math.abs(amountLTC - expectedAmount) <= tolerance;

      if (!amountMatches) {
        return {
          verified: false,
          error: `Amount mismatch. Expected: ${expectedAmount} LTC, Received: ${amountLTC} LTC`
        };
      }

      // Get confirmations (Litecoin considers 6+ confirmations as confirmed)
      const confirmations = tx.block_id ? 
        (txData.context?.state || 0) : 0;

      return {
        verified: true,
        confirmations,
        amount: amountLTC,
        txHash,
        status: confirmations >= 6 ? 'confirmed' : 'pending'
      };

    } catch (error) {
      logger.error('Litecoin verification error:', { error: error.message, stack: error.stack });
      return {
        verified: false,
        error: error.message
      };
    }
  }

  /**
   * Verify transaction based on currency
   * @param {string} txHash - Transaction hash
   * @param {string} address - Expected receiving address
   * @param {number} amount - Expected amount
   * @param {string} currency - Currency (BTC, ETH, USDT, LTC)
   * @returns {object} - Verification result
   */
  async verifyTransaction(txHash, address, amount, currency) {
    const supportedCurrencies = ['BTC', 'ETH', 'USDT', 'LTC'];
    
    if (!supportedCurrencies.includes(currency)) {
      return {
        verified: false,
        error: `Unsupported currency. Supported: ${supportedCurrencies.join(', ')}`
      };
    }
    
    switch (currency) {
      case 'BTC':
        return this.verifyBitcoinTransaction(txHash, address, amount);
      case 'ETH':
        return this.verifyEthereumTransaction(txHash, address, amount);
      case 'USDT':
        return this.verifyUSDTTRC20Transaction(txHash, address, amount);
      case 'LTC':
        return this.verifyLitecoinTransaction(txHash, address, amount);
      default:
        return {
          verified: false,
          error: 'Unsupported currency'
        };
    }
  }
}

export default new CryptoService();
