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
    this.tonApiKey = config.crypto.tonApiKey;
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
      const response = await axios.get(
        `https://blockchain.info/rawtx/${txHash}`,
        {
          params: {
            apikey: this.blockchainApiKey
          }
        }
      );

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
   * Verify Ethereum transaction (ETH or USDT on Ethereum)
   * @param {string} txHash - Transaction hash
   * @param {string} expectedAddress - Expected receiving address
   * @param {number} expectedAmount - Expected amount
   * @param {string} currency - ETH or USDT
   * @returns {object} - Verification result
   */
  async verifyEthereumTransaction(txHash, expectedAddress, expectedAmount, currency = 'ETH') {
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
      const receiptResponse = await axios.get(
        'https://api.etherscan.io/api',
        {
          params: {
            module: 'proxy',
            action: 'eth_getTransactionReceipt',
            txhash: txHash,
            apikey: this.etherscanApiKey
          }
        }
      );

      const receipt = receiptResponse.data.result;

      if (currency === 'ETH') {
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

        return {
          verified: true,
          confirmations: receipt.confirmations || 0,
          amount: amountETH,
          txHash,
          status: receipt.status === '0x1' ? 'confirmed' : 'failed'
        };

      } else if (currency === 'USDT') {
        // Verify USDT (ERC-20) transaction
        // USDT contract address on Ethereum
        const usdtContract = '0xdac17f958d2ee523a2206206994597c13d831ec7';

        if (tx.to.toLowerCase() !== usdtContract.toLowerCase()) {
          return {
            verified: false,
            error: 'Not a USDT transaction'
          };
        }

        // Decode transfer event from logs
        const transferEvent = receipt.logs.find(log =>
          log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        );

        if (!transferEvent) {
          return {
            verified: false,
            error: 'Transfer event not found'
          };
        }

        // Decode recipient address from log
        const recipientAddress = '0x' + transferEvent.topics[2].slice(26);

        if (recipientAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
          return {
            verified: false,
            error: 'Address mismatch'
          };
        }

        // Decode amount (USDT has 6 decimals)
        const amountUSDT = parseInt(transferEvent.data, 16) / 1e6;

        // Check amount
        const tolerance = expectedAmount * 0.01;
        const amountMatches = Math.abs(amountUSDT - expectedAmount) <= tolerance;

        if (!amountMatches) {
          return {
            verified: false,
            error: `Amount mismatch. Expected: ${expectedAmount} USDT, Received: ${amountUSDT} USDT`
          };
        }

        return {
          verified: true,
          confirmations: receipt.confirmations || 0,
          amount: amountUSDT,
          txHash,
          status: receipt.status === '0x1' ? 'confirmed' : 'failed'
        };
      }

    } catch (error) {
      logger.error('Ethereum verification error:', { error: error.message, stack: error.stack });
      return {
        verified: false,
        error: error.message
      };
    }
  }

  /**
   * Verify TON transaction
   * @param {string} txHash - Transaction hash
   * @param {string} expectedAddress - Expected receiving address
   * @param {number} expectedAmount - Expected amount in TON
   * @returns {object} - Verification result
   */
  async verifyTonTransaction(txHash, expectedAddress, expectedAmount) {
    try {
      // TON verification using TON API
      // This is a placeholder - implement with actual TON API
      const response = await axios.get(
        `https://toncenter.com/api/v2/getTransactions`,
        {
          params: {
            address: expectedAddress,
            limit: 100,
            api_key: this.tonApiKey
          }
        }
      );

      const transactions = response.data.result;

      // Find transaction by hash
      const tx = transactions.find(t => t.transaction_id?.hash === txHash);

      if (!tx) {
        return {
          verified: false,
          error: 'Transaction not found'
        };
      }

      // Verify amount
      const amountTON = parseInt(tx.in_msg?.value || 0) / 1e9;

      const tolerance = expectedAmount * 0.01;
      const amountMatches = Math.abs(amountTON - expectedAmount) <= tolerance;

      if (!amountMatches) {
        return {
          verified: false,
          error: `Amount mismatch. Expected: ${expectedAmount} TON, Received: ${amountTON} TON`
        };
      }

      return {
        verified: true,
        confirmations: 1, // TON is fast, consider 1 block as confirmed
        amount: amountTON,
        txHash,
        status: 'confirmed'
      };

    } catch (error) {
      logger.error('TON verification error:', { error: error.message, stack: error.stack });
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
   * Verify transaction based on currency
   * @param {string} txHash - Transaction hash
   * @param {string} address - Expected receiving address
   * @param {number} amount - Expected amount
   * @param {string} currency - Currency (BTC, ETH, USDT, TON)
   * @returns {object} - Verification result
   */
  async verifyTransaction(txHash, address, amount, currency) {
    switch (currency) {
      case 'BTC':
        return this.verifyBitcoinTransaction(txHash, address, amount);
      case 'ETH':
        return this.verifyEthereumTransaction(txHash, address, amount, 'ETH');
      case 'USDT':
        return this.verifyEthereumTransaction(txHash, address, amount, 'USDT');
      case 'TON':
        return this.verifyTonTransaction(txHash, address, amount);
      default:
        return {
          verified: false,
          error: 'Unsupported currency'
        };
    }
  }
}

export default new CryptoService();
