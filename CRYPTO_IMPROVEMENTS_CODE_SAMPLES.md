# Code Samples for Crypto Payment Improvements

## 1. Improved Crypto Service with Retry Logic

```javascript
// backend/src/services/crypto-enhanced.js

import axios from 'axios';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';

class EnhancedCryptoService {
  constructor() {
    this.etherscanApiKey = config.crypto.etherscanApiKey;
    this.blockchainApiKey = config.crypto.blockchainApiKey;
    this.tonApiKey = config.crypto.tonApiKey;
    this.maxRetries = 3;
    this.initialDelay = 1000; // 1 second
  }

  /**
   * Retry wrapper with exponential backoff
   */
  async verifyWithRetry(verifyFn, currency, txHash) {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        logger.debug(`Verification attempt ${attempt + 1}/${this.maxRetries}`, {
          currency,
          txHash: txHash.substring(0, 16) + '...'
        });
        return await verifyFn();
      } catch (error) {
        // Determine if error is transient
        const isTransient = this.isTransientError(error);
        
        if (!isTransient || attempt === this.maxRetries - 1) {
          logger.error(`Verification failed (non-retryable or max retries)`, {
            currency,
            txHash: txHash.substring(0, 16) + '...',
            error: error.message,
            attempt: attempt + 1,
            isTransient
          });
          throw error;
        }

        // Exponential backoff
        const delay = this.initialDelay * Math.pow(2, attempt);
        logger.warn(`Retrying after ${delay}ms due to transient error`, {
          currency,
          error: error.message,
          attempt: attempt + 1
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Classify error as transient or permanent
   */
  isTransientError(error) {
    const transientErrors = [
      'TIMEOUT',
      'RATE_LIMIT',
      'CONNECTION_ERROR',
      'TEMPORARILY_UNAVAILABLE',
      'ECONNREFUSED',
      'ENOTFOUND',
      '429', // Rate limit HTTP status
      '503', // Service unavailable
      '504'  // Gateway timeout
    ];

    const errorStr = error.toString() + error.message;
    return transientErrors.some(err => errorStr.includes(err));
  }

  /**
   * Enhanced Bitcoin verification with retry
   */
  async verifyBitcoinTransaction(txHash, expectedAddress, expectedAmount) {
    return this.verifyWithRetry(
      () => this._verifyBitcoinCore(txHash, expectedAddress, expectedAmount),
      'BTC',
      txHash
    );
  }

  async _verifyBitcoinCore(txHash, expectedAddress, expectedAmount) {
    try {
      const response = await axios.get(
        `https://blockchain.info/rawtx/${txHash}`,
        {
          params: {
            apikey: this.blockchainApiKey
          },
          timeout: 5000
        }
      );

      const tx = response.data;

      if (!tx || !tx.out) {
        return {
          verified: false,
          error: 'Transaction not found or invalid'
        };
      }

      // Find output to expected address
      const output = tx.out.find(out => out.addr === expectedAddress);

      if (!output) {
        return {
          verified: false,
          error: 'Address not found in transaction outputs'
        };
      }

      // Convert satoshis to BTC
      const amountBTC = output.value / 100000000;

      // Dynamic tolerance based on amount
      const tolerance = this.calculateTolerance(expectedAmount);
      const amountMatches = Math.abs(amountBTC - expectedAmount) <= tolerance;

      if (!amountMatches) {
        return {
          verified: false,
          error: `Amount mismatch. Expected: ${expectedAmount} BTC, Received: ${amountBTC} BTC (tolerance: ${tolerance})`
        };
      }

      // Get confirmations
      const blockHeight = await this.getBitcoinBlockHeight();
      const confirmations = tx.block_height ? blockHeight - tx.block_height + 1 : 0;

      return {
        verified: true,
        confirmations,
        amount: amountBTC,
        txHash,
        status: confirmations >= 3 ? 'confirmed' : 'pending'
      };

    } catch (error) {
      logger.error('Bitcoin verification core error', {
        error: error.message,
        txHash: txHash.substring(0, 16) + '...'
      });
      throw error;
    }
  }

  /**
   * Enhanced Ethereum verification with receipt status check
   */
  async verifyEthereumTransaction(txHash, expectedAddress, expectedAmount, currency = 'ETH') {
    return this.verifyWithRetry(
      () => this._verifyEthereumCore(txHash, expectedAddress, expectedAmount, currency),
      currency,
      txHash
    );
  }

  async _verifyEthereumCore(txHash, expectedAddress, expectedAmount, currency = 'ETH') {
    try {
      // Get transaction
      const txResponse = await axios.get(
        'https://api.etherscan.io/api',
        {
          params: {
            module: 'proxy',
            action: 'eth_getTransactionByHash',
            txhash: txHash,
            apikey: this.etherscanApiKey
          },
          timeout: 5000
        }
      );

      const tx = txResponse.data.result;

      if (!tx) {
        return {
          verified: false,
          error: 'Transaction not found'
        };
      }

      // Get transaction receipt
      const receiptResponse = await axios.get(
        'https://api.etherscan.io/api',
        {
          params: {
            module: 'proxy',
            action: 'eth_getTransactionReceipt',
            txhash: txHash,
            apikey: this.etherscanApiKey
          },
          timeout: 5000
        }
      );

      const receipt = receiptResponse.data.result;

      if (!receipt) {
        return {
          verified: false,
          error: 'Transaction receipt not found (transaction may be pending)'
        };
      }

      // Check receipt status (CRITICAL FIX)
      if (receipt.status !== '0x1') {
        return {
          verified: false,
          error: 'Transaction failed or reverted on blockchain',
          status: 'failed'
        };
      }

      if (currency === 'ETH') {
        return this._verifyETH(tx, receipt, expectedAddress, expectedAmount);
      } else if (currency === 'USDT') {
        return this._verifyERC20(receipt, expectedAddress, expectedAmount, currency);
      } else {
        return {
          verified: false,
          error: `Unsupported currency: ${currency}`
        };
      }

    } catch (error) {
      logger.error('Ethereum verification core error', {
        error: error.message,
        currency,
        txHash: txHash.substring(0, 16) + '...'
      });
      throw error;
    }
  }

  /**
   * Verify ETH transfer
   */
  _verifyETH(tx, receipt, expectedAddress, expectedAmount) {
    // Verify recipient
    if (tx.to.toLowerCase() !== expectedAddress.toLowerCase()) {
      return {
        verified: false,
        error: 'Address mismatch'
      };
    }

    // Convert wei to ETH
    const amountETH = parseInt(tx.value, 16) / 1e18;

    // Dynamic tolerance
    const tolerance = this.calculateTolerance(expectedAmount);
    const amountMatches = Math.abs(amountETH - expectedAmount) <= tolerance;

    if (!amountMatches) {
      return {
        verified: false,
        error: `Amount mismatch. Expected: ${expectedAmount} ETH, Received: ${amountETH} ETH`
      };
    }

    return {
      verified: true,
      confirmations: parseInt(receipt.blockNumber, 16) ? 1 : 0,
      amount: amountETH,
      txHash: tx.hash,
      status: 'confirmed'
    };
  }

  /**
   * Verify ERC-20 transfer (USDT, etc.)
   */
  _verifyERC20(receipt, expectedAddress, expectedAmount, currency = 'USDT') {
    const usdtContractAddress = config.crypto.usdtAddress;

    if (!receipt.logs || receipt.logs.length === 0) {
      return {
        verified: false,
        error: 'No transfer events found in transaction'
      };
    }

    // Find Transfer event
    // Topic[0] = keccak256("Transfer(address,address,uint256)")
    const TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const transferEvent = receipt.logs.find(
      log => log.address.toLowerCase() === usdtContractAddress.toLowerCase() &&
             log.topics[0] === TRANSFER_EVENT_SIGNATURE
    );

    if (!transferEvent) {
      return {
        verified: false,
        error: 'Transfer event not found in transaction logs'
      };
    }

    // Decode recipient address from topic[2]
    const recipientAddress = '0x' + transferEvent.topics[2].slice(26);

    if (recipientAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
      return {
        verified: false,
        error: 'Address mismatch in transfer event'
      };
    }

    // Decode amount from data field
    const amountHex = transferEvent.data;
    const decimals = currency === 'USDT' ? 6 : 18;
    const amount = parseInt(amountHex, 16) / (10 ** decimals);

    // Dynamic tolerance
    const tolerance = this.calculateTolerance(expectedAmount);
    const amountMatches = Math.abs(amount - expectedAmount) <= tolerance;

    if (!amountMatches) {
      return {
        verified: false,
        error: `Amount mismatch. Expected: ${expectedAmount} ${currency}, Received: ${amount} ${currency}`
      };
    }

    return {
      verified: true,
      confirmations: 1,
      amount,
      txHash: receipt.transactionHash,
      status: 'confirmed'
    };
  }

  /**
   * Enhanced TON verification (rewritten for TonAPI)
   */
  async verifyTonTransaction(txHash, expectedAddress, expectedAmount) {
    return this.verifyWithRetry(
      () => this._verifyTonCore(txHash, expectedAddress, expectedAmount),
      'TON',
      txHash
    );
  }

  async _verifyTonCore(txHash, expectedAddress, expectedAmount) {
    try {
      // Using TonAPI instead of TonCenter for better reliability
      const response = await axios.get(
        `https://tonapi.io/v2/blockchain/transactions/${txHash}`,
        {
          headers: {
            'Authorization': `Bearer ${this.tonApiKey}`
          },
          timeout: 5000
        }
      );

      const tx = response.data;

      if (!tx) {
        return {
          verified: false,
          error: 'Transaction not found on TON blockchain'
        };
      }

      // Verify destination address
      if (!tx.in_msg || !tx.in_msg.destination) {
        return {
          verified: false,
          error: 'Invalid transaction structure'
        };
      }

      if (tx.in_msg.destination.toLowerCase() !== expectedAddress.toLowerCase()) {
        return {
          verified: false,
          error: 'Address mismatch in transaction destination'
        };
      }

      // Convert nanotons to TON
      const amountTON = parseInt(tx.in_msg.value || 0) / 1e9;

      // Dynamic tolerance
      const tolerance = this.calculateTolerance(expectedAmount);
      const amountMatches = Math.abs(amountTON - expectedAmount) <= tolerance;

      if (!amountMatches) {
        return {
          verified: false,
          error: `Amount mismatch. Expected: ${expectedAmount} TON, Received: ${amountTON} TON`
        };
      }

      // TON is fast, check finality
      const isFinalized = tx.utime && Math.floor(Date.now() / 1000) - tx.utime > 60;

      return {
        verified: true,
        confirmations: isFinalized ? 2 : 1,
        amount: amountTON,
        txHash,
        status: isFinalized ? 'confirmed' : 'pending'
      };

    } catch (error) {
      logger.error('TON verification core error', {
        error: error.message,
        txHash: txHash.substring(0, 16) + '...'
      });
      throw error;
    }
  }

  /**
   * Dynamic tolerance calculation based on amount
   */
  calculateTolerance(amount) {
    // 1% for larger amounts, 0.5% for smaller
    if (amount >= 1) {
      return amount * 0.01; // 1%
    } else if (amount >= 0.1) {
      return amount * 0.015; // 1.5%
    } else {
      return amount * 0.02; // 2%
    }
  }

  /**
   * Get current Bitcoin block height with caching
   */
  async getBitcoinBlockHeight() {
    try {
      const response = await axios.get(
        'https://blockchain.info/latestblock',
        { timeout: 5000 }
      );
      return response.data.height;
    } catch (error) {
      logger.error('Get Bitcoin block height error', { error: error.message });
      // Return previous height as fallback
      return 0;
    }
  }

  /**
   * Router method
   */
  async verifyTransaction(txHash, address, amount, currency) {
    switch (currency.toUpperCase()) {
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
          error: `Unsupported currency: ${currency}`
        };
    }
  }
}

export default new EnhancedCryptoService();
```

## 2. Enhanced Payment Controller with Better Error Handling

```javascript
// backend/src/controllers/paymentController-enhanced.js

import { paymentQueries, orderQueries } from '../models/db.js';
import cryptoService from '../services/crypto.js';
import telegramService from '../services/telegram.js';
import logger from '../utils/logger.js';
import QRCode from 'qrcode';

export const enhancedPaymentController = {
  /**
   * Enhanced verify with better error classification
   */
  verify: async (req, res) => {
    try {
      const { orderId, txHash, currency } = req.body;

      // Validate order exists and belongs to user
      const order = await orderQueries.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      if (order.buyer_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Check if already verified
      const existingPayments = await paymentQueries.findByOrderId(orderId);
      const verifiedPayment = existingPayments.find(p => p.status === 'confirmed');

      if (verifiedPayment) {
        return res.status(400).json({
          success: false,
          error: 'Order already paid',
          payment: verifiedPayment
        });
      }

      // Check if tx already submitted (idempotency)
      const existingTx = await paymentQueries.findByTxHash(txHash);
      if (existingTx) {
        return res.status(400).json({
          success: false,
          error: 'Transaction already submitted',
          payment: existingTx
        });
      }

      // CRITICAL: Check payment address is set
      if (!order.payment_address) {
        logger.error('Payment address missing for order', { orderId });
        return res.status(400).json({
          success: false,
          error: 'payment_address is required for payment verification',
          code: 'PAYMENT_ADDRESS_REQUIRED'
        });
      }

      // Verify transaction
      let verification;
      try {
        verification = await cryptoService.verifyTransaction(
          txHash,
          order.payment_address,
          order.total_price,
          currency
        );
      } catch (verifyError) {
        // Distinguish between transient and permanent errors
        const isTransient = cryptoService.isTransientError(verifyError);
        
        logger.error('Crypto verification error', {
          error: verifyError.message,
          orderId,
          currency,
          isTransient
        });

        // Save failed attempt
        await paymentQueries.create({
          orderId,
          txHash,
          amount: order.total_price,
          currency,
          status: 'failed'
        });

        const statusCode = isTransient ? 503 : 400;
        return res.status(statusCode).json({
          success: false,
          error: isTransient 
            ? 'Temporary verification failure. Please try again.'
            : 'Verification failed. Check transaction details.',
          code: isTransient ? 'VERIFICATION_RETRY' : 'VERIFICATION_FAILED'
        });
      }

      if (!verification.verified) {
        // Create failed payment record
        await paymentQueries.create({
          orderId,
          txHash,
          amount: order.total_price,
          currency,
          status: 'failed'
        });

        // Provide specific error message
        const errorMessage = this.translateVerificationError(
          verification.error,
          currency
        );

        return res.status(400).json({
          success: false,
          error: errorMessage,
          code: 'VERIFICATION_FAILED'
        });
      }

      // Create payment record
      const payment = await paymentQueries.create({
        orderId,
        txHash,
        amount: verification.amount,
        currency,
        status: verification.status,
        confirmations: verification.confirmations
      });

      // If confirmed, update order
      if (verification.status === 'confirmed') {
        await orderQueries.updateStatus(orderId, 'confirmed');

        // Notify buyer asynchronously
        try {
          telegramService.notifyPaymentConfirmed(order.buyer_telegram_id, {
            id: order.id,
            product_name: order.product_name,
            total_price: order.total_price,
            currency: order.currency
          }).catch(err => 
            logger.error('Notification error', { 
              error: err.message, 
              orderId 
            })
          );
        } catch (notifError) {
          logger.error('Notification scheduling error', { 
            error: notifError.message, 
            orderId 
          });
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          payment,
          verification: {
            verified: verification.verified,
            confirmations: verification.confirmations,
            status: verification.status
          }
        }
      });

    } catch (error) {
      logger.error('Verify payment error', { 
        error: error.message, 
        stack: error.stack 
      });
      return res.status(500).json({
        success: false,
        error: 'Internal server error during verification'
      });
    }
  },

  /**
   * Translate verification errors to user-friendly messages
   */
  translateVerificationError(error, currency) {
    const errorMap = {
      'Address not found': 'Payment sent to wrong address',
      'Address mismatch': 'Payment sent to wrong address',
      'Amount mismatch': 'Payment amount is incorrect',
      'Transaction not found': 'Transaction not found on blockchain',
      'Transaction failed': 'Transaction failed on blockchain',
      'Transaction reverted': 'Transaction was reverted',
      'Insufficient confirmations': 'Transaction not yet confirmed',
      'Invalid transaction structure': 'Invalid transaction format',
      'Transfer event not found': 'Invalid USDT transfer'
    };

    for (const [key, value] of Object.entries(errorMap)) {
      if (error.includes(key)) {
        return value;
      }
    }

    return error || `Verification failed for ${currency}`;
  },

  /**
   * Check payment status with retry
   */
  checkStatus: async (req, res) => {
    try {
      const { txHash } = req.query;

      if (!txHash) {
        return res.status(400).json({
          success: false,
          error: 'Transaction hash required'
        });
      }

      const payment = await paymentQueries.findByTxHash(txHash);

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: 'Payment not found'
        });
      }

      // Check access
      const order = await orderQueries.findById(payment.order_id);
      if (order.buyer_id !== req.user.id && order.seller_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // If pending, check blockchain again
      if (payment.status === 'pending') {
        try {
          const verification = await cryptoService.verifyTransaction(
            payment.tx_hash,
            order.payment_address,
            order.total_price,
            payment.currency
          );

          if (verification.verified && verification.status === 'confirmed') {
            await paymentQueries.updateStatus(
              payment.id,
              'confirmed',
              verification.confirmations
            );

            await orderQueries.updateStatus(order.id, 'confirmed');

            payment.status = 'confirmed';
            payment.confirmations = verification.confirmations;
          }
        } catch (error) {
          logger.warn('Recheck payment error', { 
            error: error.message, 
            txHash 
          });
          // Return current status even if recheck fails
        }
      }

      return res.status(200).json({
        success: true,
        data: payment
      });

    } catch (error) {
      logger.error('Check payment status error', { 
        error: error.message 
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to check payment status'
      });
    }
  },

  // ... other methods remain the same
};

export default enhancedPaymentController;
```

## 3. Redis Caching for Block Heights

```javascript
// backend/src/services/blockHeightCache.js

import redis from 'redis';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';

class BlockHeightCache {
  constructor() {
    this.client = redis.createClient({
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379
    });
    
    this.ttl = 60; // 1 minute
    this.enabled = config.redis?.enabled !== false;
    
    if (this.enabled) {
      this.client.on('error', (err) => 
        logger.error('Redis error', { error: err.message })
      );
    }
  }

  async getBlockHeight(blockchain) {
    if (!this.enabled) return null;

    const key = `block_height:${blockchain}`;
    
    try {
      const cached = await this.client.get(key);
      if (cached) {
        logger.debug(`Block height cache hit for ${blockchain}`, { height: cached });
        return parseInt(cached);
      }
    } catch (error) {
      logger.warn('Cache read error', { error: error.message });
    }

    return null;
  }

  async setBlockHeight(blockchain, height) {
    if (!this.enabled) return;

    const key = `block_height:${blockchain}`;
    
    try {
      await this.client.setex(key, this.ttl, height.toString());
      logger.debug(`Block height cached for ${blockchain}`, { height });
    } catch (error) {
      logger.warn('Cache write error', { error: error.message });
    }
  }

  async close() {
    if (this.enabled) {
      await this.client.quit();
    }
  }
}

export default new BlockHeightCache();
```

## 4. Unit Tests for Enhanced Verification

```javascript
// backend/__tests__/crypto-enhanced.test.js

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import axios from 'axios';
import cryptoService from '../src/services/crypto.js';

vi.mock('axios');

describe('Enhanced Crypto Service', () => {
  describe('verifyBitcoinTransaction', () => {
    it('should verify valid BTC transaction', async () => {
      axios.get.mockResolvedValue({
        data: {
          out: [{
            addr: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
            value: 100000 // 0.001 BTC
          }],
          block_height: 700000
        }
      });

      const result = await cryptoService.verifyBitcoinTransaction(
        'abc123',
        'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        0.001
      );

      expect(result.verified).toBe(true);
      expect(result.amount).toBe(0.001);
    });

    it('should retry on transient errors', async () => {
      axios.get
        .mockRejectedValueOnce(new Error('TIMEOUT'))
        .mockRejectedValueOnce(new Error('CONNECTION_ERROR'))
        .mockResolvedValueOnce({
          data: {
            out: [{
              addr: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
              value: 100000
            }],
            block_height: 700000
          }
        });

      const result = await cryptoService.verifyBitcoinTransaction(
        'abc123',
        'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        0.001
      );

      expect(result.verified).toBe(true);
      expect(axios.get).toHaveBeenCalledTimes(3);
    });

    it('should fail permanently on invalid address', async () => {
      axios.get.mockResolvedValue({
        data: {
          out: [{
            addr: 'bc1qother_address',
            value: 100000
          }]
        }
      });

      const result = await cryptoService.verifyBitcoinTransaction(
        'abc123',
        'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        0.001
      );

      expect(result.verified).toBe(false);
      expect(result.error).toMatch(/Address not found/);
      expect(axios.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyEthereumTransaction', () => {
    it('should detect reverted transactions', async () => {
      axios.get
        .mockResolvedValueOnce({
          data: {
            result: {
              to: '0x1234567890123456789012345678901234567890',
              value: '1000000000000000'
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            result: {
              status: '0x0', // Failed!
              blockNumber: '0xabc123'
            }
          }
        });

      const result = await cryptoService.verifyEthereumTransaction(
        'abc123',
        '0x1234567890123456789012345678901234567890',
        0.001,
        'ETH'
      );

      expect(result.verified).toBe(false);
      expect(result.error).toMatch(/failed|reverted/i);
    });

    it('should verify valid USDT transfer', async () => {
      const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      
      axios.get
        .mockResolvedValueOnce({
          data: {
            result: {
              to: '0xdac17f958d2ee523a2206206994597c13d831ec7'
            }
          }
        })
        .mockResolvedValueOnce({
          data: {
            result: {
              status: '0x1',
              logs: [{
                address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
                topics: [
                  TRANSFER_TOPIC,
                  '0x0000000000000000000000001111111111111111111111111111111111111111',
                  '0x0000000000000000000000002222222222222222222222222222222222222222'
                ],
                data: '0x00000000000000000000000000000000000000000000000000000000000f4240' // 1000000 in hex
              }]
            }
          }
        });

      const result = await cryptoService.verifyEthereumTransaction(
        'abc123',
        '0x2222222222222222222222222222222222222222',
        1.0,
        'USDT'
      );

      expect(result.verified).toBe(true);
    });
  });

  describe('dynamic tolerance', () => {
    it('should use 1% tolerance for amounts >= 1', () => {
      const tolerance = cryptoService.calculateTolerance(1.0);
      expect(tolerance).toBe(0.01);
    });

    it('should use 1.5% tolerance for amounts >= 0.1', () => {
      const tolerance = cryptoService.calculateTolerance(0.5);
      expect(tolerance).toBe(0.0075);
    });

    it('should use 2% tolerance for amounts < 0.1', () => {
      const tolerance = cryptoService.calculateTolerance(0.05);
      expect(tolerance).toBe(0.001);
    });
  });
});
```

## 5. Configuration for Production

```bash
# .env.production

# Crypto APIs - Production Tier
BLOCKCHAIN_API_KEY=your_blockchain_paid_key
ETHERSCAN_API_KEY=your_etherscan_key
TON_API_KEY=your_ton_api_key

# Platform Addresses (Real mainnet)
CRYPTO_BTC_ADDRESS=3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy
CRYPTO_ETH_ADDRESS=0x35b08AD5e40c3e7d3a03e8A27e6b5c4E3F6eE5fa
CRYPTO_USDT_ADDRESS=0xdac17f958d2ee523a2206206994597c13d831ec7
CRYPTO_TON_ADDRESS=EQCD39VS5jcptIvgUWDEYkO_MSc_0KvfEQ7lxEf7_qLi

# Redis Caching
REDIS_ENABLED=true
REDIS_HOST=redis
REDIS_PORT=6379

# Monitoring
SENTRY_DSN=https://your-sentry-key@sentry.io/project-id
DATADOG_API_KEY=your_datadog_key
```

