import { TatumSDK, Network, Bitcoin, Ethereum, Litecoin, Tron } from '@tatumio/tatum';
import { UtxoWalletProvider } from '@tatumio/utxo-wallet-provider';
import crypto from 'crypto';
import logger from '../utils/logger.js';

/**
 * Tatum Service - Unified crypto payment processing
 *
 * Features:
 * - HD wallet address generation (address-per-invoice)
 * - Webhook subscriptions for ADDRESS_EVENT monitoring
 * - Automatic payment verification via blockchain
 * - Support for BTC, ETH, LTC, TRON (USDT TRC-20 and ERC-20)
 */
class TatumService {
  constructor() {
    this.sdks = {
      btc: null,
      eth: null,
      ltc: null,
      tron: null
    };

    this.xpubs = {
      btc: process.env.HD_XPUB_BTC,
      eth: process.env.HD_XPUB_ETH,
      ltc: process.env.HD_XPUB_LTC,
      tron: process.env.HD_XPUB_TRON
    };

    this.confirmationThresholds = {
      BTC: parseInt(process.env.CONFIRMATIONS_BTC || '3'),
      LTC: parseInt(process.env.CONFIRMATIONS_LTC || '3'),
      ETH: parseInt(process.env.CONFIRMATIONS_ETH || '3'),
      TRON: parseInt(process.env.CONFIRMATIONS_TRON || '1')
    };

    this.webhookUrl = process.env.TATUM_WEBHOOK_URL;
    this.webhookHmacSecret = process.env.TATUM_WEBHOOK_HMAC_SECRET;
    this.initialized = false;
  }

  /**
   * Initialize all Tatum SDKs
   */
  async initialize() {
    if (this.initialized) {
      logger.warn('[TatumService] Already initialized');
      return;
    }

    try {
      logger.info('[TatumService] Initializing Tatum SDKs...');

      // Validate environment variables
      this._validateEnv();

      // Initialize Bitcoin SDK
      this.sdks.btc = await TatumSDK.init({
        network: Network.BITCOIN,
        apiKey: process.env.TATUM_API_KEY,
        configureWalletProviders: [UtxoWalletProvider]
      });
      logger.info('[TatumService] Bitcoin SDK initialized');

      // Initialize Ethereum SDK
      this.sdks.eth = await TatumSDK.init({
        network: Network.ETHEREUM,
        apiKey: process.env.TATUM_API_KEY
      });
      logger.info('[TatumService] Ethereum SDK initialized');

      // Initialize Litecoin SDK
      this.sdks.ltc = await TatumSDK.init({
        network: Network.LITECOIN,
        apiKey: process.env.TATUM_API_KEY,
        configureWalletProviders: [UtxoWalletProvider]
      });
      logger.info('[TatumService] Litecoin SDK initialized');

      // Initialize TRON SDK
      this.sdks.tron = await TatumSDK.init({
        network: Network.TRON,
        apiKey: process.env.TATUM_API_KEY
      });
      logger.info('[TatumService] TRON SDK initialized');

      this.initialized = true;
      logger.info('[TatumService] All SDKs initialized successfully');
    } catch (error) {
      logger.error('[TatumService] Initialization failed:', error);
      throw new Error(`Tatum initialization failed: ${error.message}`);
    }
  }

  /**
   * Validate required environment variables
   */
  _validateEnv() {
    const required = [
      'TATUM_API_KEY',
      'HD_XPUB_BTC',
      'HD_XPUB_ETH',
      'HD_XPUB_LTC',
      'HD_XPUB_TRON',
      'TATUM_WEBHOOK_URL',
      'TATUM_WEBHOOK_HMAC_SECRET'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Generate unique payment address from HD wallet
   *
   * @param {string} chain - BTC, ETH, LTC, or TRON
   * @param {number} index - Address index (incrementing per invoice)
   * @returns {Promise<string>} Generated address
   */
  async generateAddress(chain, index) {
    if (!this.initialized) {
      throw new Error('TatumService not initialized');
    }

    const chainLower = chain.toLowerCase();
    const sdk = this.sdks[chainLower];
    const xpub = this.xpubs[chainLower];

    if (!sdk || !xpub) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    try {
      logger.info(`[TatumService] Generating ${chain} address at index ${index}`);

      const address = await sdk.address.generateAddressFromXPub(xpub, index);

      logger.info(`[TatumService] Generated ${chain} address: ${address}`);
      return address;
    } catch (error) {
      logger.error(`[TatumService] Failed to generate ${chain} address:`, error);
      throw new Error(`Failed to generate ${chain} address: ${error.message}`);
    }
  }

  /**
   * Create webhook subscription for address monitoring
   *
   * @param {string} chain - BTC, ETH, LTC, or TRON
   * @param {string} address - Address to monitor
   * @param {object} metadata - Additional metadata (invoiceId, orderId, etc.)
   * @returns {Promise<object>} Subscription object { id, address, chain }
   */
  async createAddressSubscription(chain, address, metadata = {}) {
    if (!this.initialized) {
      throw new Error('TatumService not initialized');
    }

    const chainLower = chain.toLowerCase();
    const sdk = this.sdks[chainLower];

    if (!sdk) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    try {
      logger.info(`[TatumService] Creating subscription for ${chain} address: ${address}`);

      const subscription = await sdk.notification.subscribe.addressEvent({
        address,
        url: this.webhookUrl,
        // Store metadata in subscription (will be returned in webhook payload)
        // Note: Tatum may not support custom metadata, use database instead
      });

      logger.info(`[TatumService] Subscription created: ${subscription.id}`);

      return {
        id: subscription.id,
        address,
        chain: chain.toUpperCase(),
        metadata
      };
    } catch (error) {
      logger.error(`[TatumService] Failed to create subscription for ${address}:`, error);
      throw new Error(`Failed to create subscription: ${error.message}`);
    }
  }

  /**
   * Cancel webhook subscription
   *
   * @param {string} subscriptionId - Subscription ID to cancel
   * @returns {Promise<void>}
   */
  async cancelSubscription(subscriptionId) {
    if (!this.initialized) {
      throw new Error('TatumService not initialized');
    }

    try {
      logger.info(`[TatumService] Canceling subscription: ${subscriptionId}`);

      // Note: Tatum SDK may have different method names
      // Check actual SDK documentation for correct method
      // This is a placeholder - adjust based on actual Tatum SDK API

      // Attempt to cancel via each SDK (we don't know which chain it belongs to)
      for (const [chain, sdk] of Object.entries(this.sdks)) {
        try {
          await sdk.notification.unsubscribe(subscriptionId);
          logger.info(`[TatumService] Subscription ${subscriptionId} canceled`);
          return;
        } catch (error) {
          // Try next SDK
          continue;
        }
      }

      logger.warn(`[TatumService] Could not cancel subscription ${subscriptionId}`);
    } catch (error) {
      logger.error(`[TatumService] Failed to cancel subscription:`, error);
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  /**
   * Parse incoming webhook payload from Tatum
   *
   * @param {object} payload - Webhook payload from Tatum
   * @returns {object} Normalized payment data
   */
  parseWebhookPayload(payload) {
    try {
      // Expected Tatum ADDRESS_EVENT payload structure:
      // {
      //   address: string,
      //   txId: string,
      //   blockNumber: number,
      //   asset: string,  // "BTC", "ETH", or token contract address
      //   amount: string,
      //   counterAddress: string,
      //   type: 'native' | 'erc20' | 'trc20',
      //   chain: string,
      //   subscriptionType: 'ADDRESS_EVENT'
      // }

      const {
        address,
        txId,
        blockNumber,
        asset,
        amount,
        counterAddress,
        type,
        chain
      } = payload;

      // Determine currency from asset and type
      let currency = this._determineCurrency(asset, type, chain);

      // Parse amount (Tatum returns as string)
      const parsedAmount = parseFloat(amount);

      logger.info(`[TatumService] Webhook: ${currency} payment of ${parsedAmount} to ${address}`);

      return {
        txHash: txId,
        address,
        amount: parsedAmount,
        currency,
        senderAddress: counterAddress,
        blockNumber,
        type,
        chain,
        raw: payload
      };
    } catch (error) {
      logger.error('[TatumService] Failed to parse webhook payload:', error);
      throw new Error(`Failed to parse webhook: ${error.message}`);
    }
  }

  /**
   * Determine currency from asset, type, and chain
   *
   * @param {string} asset - Asset identifier
   * @param {string} type - Transaction type
   * @param {string} chain - Blockchain
   * @returns {string} Currency code (BTC, ETH, LTC, USDT, etc.)
   */
  _determineCurrency(asset, type, chain) {
    // Native currencies
    if (type === 'native') {
      if (chain.includes('bitcoin')) return 'BTC';
      if (chain.includes('ethereum')) return 'ETH';
      if (chain.includes('litecoin')) return 'LTC';
      if (chain.includes('tron')) return 'TRON';
    }

    // USDT token addresses
    const USDT_CONTRACTS = {
      // Ethereum mainnet USDT (ERC-20)
      '0xdac17f958d2ee523a2206206994597c13d831ec7': 'USDT',
      // TRON mainnet USDT (TRC-20)
      'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t': 'USDT'
    };

    const normalizedAsset = asset.toLowerCase();

    // Check if it's USDT
    for (const [contract, currency] of Object.entries(USDT_CONTRACTS)) {
      if (normalizedAsset === contract.toLowerCase()) {
        return currency;
      }
    }

    // Default: return asset as-is
    return asset.toUpperCase();
  }

  /**
   * Verify webhook HMAC signature
   *
   * @param {object} payload - Webhook payload
   * @param {string} signature - HMAC signature from x-payload-hash header
   * @returns {boolean} True if signature is valid
   */
  verifyWebhookSignature(payload, signature) {
    if (!this.webhookHmacSecret) {
      logger.warn('[TatumService] HMAC secret not configured, skipping verification');
      return true; // Allow in dev mode
    }

    try {
      const payloadString = JSON.stringify(payload);
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookHmacSecret)
        .update(payloadString)
        .digest('hex');

      const isValid = signature === expectedSignature;

      if (!isValid) {
        logger.warn('[TatumService] Webhook signature mismatch');
      }

      return isValid;
    } catch (error) {
      logger.error('[TatumService] Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Get transaction confirmations
   *
   * @param {string} chain - BTC, ETH, LTC, or TRON
   * @param {string} txHash - Transaction hash
   * @returns {Promise<number>} Number of confirmations
   */
  async getConfirmations(chain, txHash) {
    if (!this.initialized) {
      throw new Error('TatumService not initialized');
    }

    const chainLower = chain.toLowerCase();
    const sdk = this.sdks[chainLower];

    if (!sdk) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    try {
      // Get current block height
      const currentBlock = await this._getCurrentBlockHeight(sdk, chainLower);

      // Get transaction block height
      const txBlock = await this._getTransactionBlockHeight(sdk, chainLower, txHash);

      if (!txBlock) {
        // Transaction in mempool (not yet confirmed)
        return 0;
      }

      const confirmations = currentBlock - txBlock + 1;

      logger.info(`[TatumService] ${chain} tx ${txHash}: ${confirmations} confirmations`);

      return confirmations;
    } catch (error) {
      logger.error(`[TatumService] Failed to get confirmations for ${txHash}:`, error);
      throw new Error(`Failed to get confirmations: ${error.message}`);
    }
  }

  /**
   * Get current block height for chain
   */
  async _getCurrentBlockHeight(sdk, chain) {
    // Different chains have different RPC methods
    switch (chain) {
      case 'btc':
      case 'ltc':
        return await sdk.rpc.getBlockCount();

      case 'eth':
        const ethBlock = await sdk.rpc.blockNumber();
        return parseInt(ethBlock, 16);

      case 'tron':
        const tronBlock = await sdk.rpc.getNowBlock();
        return tronBlock.block_header.raw_data.number;

      default:
        throw new Error(`Unknown chain: ${chain}`);
    }
  }

  /**
   * Get transaction block height
   */
  async _getTransactionBlockHeight(sdk, chain, txHash) {
    switch (chain) {
      case 'btc':
      case 'ltc':
        const utxoTx = await sdk.rpc.getRawTransaction(txHash, true);
        return utxoTx.blockhash ? await sdk.rpc.getBlock(utxoTx.blockhash).then(b => b.height) : null;

      case 'eth':
        const ethTx = await sdk.rpc.getTransactionReceipt(txHash);
        return ethTx ? parseInt(ethTx.blockNumber, 16) : null;

      case 'tron':
        const tronTx = await sdk.rpc.getTransactionById(txHash);
        return tronTx?.blockNumber || null;

      default:
        throw new Error(`Unknown chain: ${chain}`);
    }
  }

  /**
   * Check if payment is confirmed (reached threshold)
   *
   * @param {string} chain - BTC, ETH, LTC, or TRON
   * @param {number} confirmations - Current confirmation count
   * @returns {boolean} True if confirmed
   */
  isPaymentConfirmed(chain, confirmations) {
    const threshold = this.confirmationThresholds[chain.toUpperCase()];

    if (!threshold) {
      logger.warn(`[TatumService] No threshold configured for ${chain}, using 1`);
      return confirmations >= 1;
    }

    return confirmations >= threshold;
  }

  /**
   * Cleanup - destroy all SDK instances
   */
  async destroy() {
    logger.info('[TatumService] Shutting down...');

    for (const [chain, sdk] of Object.entries(this.sdks)) {
      if (sdk) {
        try {
          await sdk.destroy();
          logger.info(`[TatumService] ${chain.toUpperCase()} SDK destroyed`);
        } catch (error) {
          logger.error(`[TatumService] Error destroying ${chain} SDK:`, error);
        }
      }
    }

    this.initialized = false;
    logger.info('[TatumService] Shutdown complete');
  }
}

// Singleton instance
const tatumService = new TatumService();

export default tatumService;
