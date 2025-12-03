/**
 * Crypto Price Service
 *
 * Fetches real-time cryptocurrency prices from CoinGecko API.
 * Features:
 * - Free API (no authentication required)
 * - 5-minute caching (reduces API calls)
 * - Supports BTC, ETH, LTC, USDT (TRC20)
 * - USD → Crypto conversion with proper decimal rounding
 */

import axios from 'axios';
import logger from '../utils/logger.js';
import {
  convertUsdToCrypto as convertUsdToCryptoDecimal,
  roundCryptoAmount as roundCryptoAmountDecimal,
} from '../utils/decimal.js';

// CoinGecko API configuration
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/simple/price';
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const STALE_PRICE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes - warn if cached price is older
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY = 1000; // 1 second

// Mapping: chain → CoinGecko coin ID
const COINGECKO_IDS = {
  BTC: 'bitcoin',
  LTC: 'litecoin',
  ETH: 'ethereum',
  USDT_TRC20: 'tether',
};

// Decimal precision for each cryptocurrency
const CRYPTO_DECIMALS = {
  BTC: 8,
  LTC: 8,
  ETH: 6,
  USDT_TRC20: 2,
};

// Price cache (in-memory) - { chain: { price: number, timestamp: number } }
const priceCache = {};
let lastFetchTime = 0;

/**
 * Check if cached price is stale (>15 minutes old) and log warning
 * @param {string} chain - Chain name
 * @param {object} cached - Cached price object { price, timestamp }
 * @returns {boolean} True if price is stale
 */
function checkAndLogStalePrice(chain, cached) {
  const ageMs = Date.now() - cached.timestamp;
  const isStale = ageMs > STALE_PRICE_THRESHOLD_MS;

  if (isStale) {
    logger.warn('[CryptoPriceService] Returning stale cached price', {
      chain,
      ageMinutes: Math.round(ageMs / 60000),
      price: cached.price,
    });
  }

  return isStale;
}

/**
 * Sleep utility for retry delays
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch prices from CoinGecko with retry logic
 * @param {number} retryCount - Current retry attempt
 * @returns {Promise<object>} API response data
 */
async function fetchPricesWithRetry(retryCount = 0) {
  const coinIds = Object.values(COINGECKO_IDS)
    .filter((value, index, self) => self.indexOf(value) === index)
    .join(',');

  try {
    const response = await axios.get(COINGECKO_API_URL, {
      params: {
        ids: coinIds,
        vs_currencies: 'usd',
      },
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    // Handle rate limiting (429)
    if (error.response?.status === 429) {
      logger.warn('[CryptoPriceService] Rate limited by CoinGecko (429)');

      // Retry with exponential backoff if retries remaining
      if (retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        logger.info(`[CryptoPriceService] Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        return fetchPricesWithRetry(retryCount + 1);
      }

      // No retries left, throw with specific message
      const rateLimitError = new Error('Rate limited by CoinGecko');
      rateLimitError.isRateLimit = true;
      throw rateLimitError;
    }

    throw error;
  }
}

/**
 * Get current cryptocurrency price in USD
 *
 * @param {string} chain - Chain name (BTC, ETH, LTC, USDT_TRC20)
 * @returns {Promise<number>} Price in USD
 * @throws {Error} If API fails or chain is unsupported
 */
export async function getCryptoPrice(chain) {
  try {
    // Check cache validity per chain (use chain's own timestamp, not global)
    const now = Date.now();
    const cached = priceCache[chain];
    if (cached && now - cached.timestamp < PRICE_CACHE_TTL) {
      logger.info(`[CryptoPriceService] Using cached price for ${chain}: $${cached.price}`);
      return cached.price;
    }

    // Validate chain
    if (!COINGECKO_IDS[chain]) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    // Fetch fresh prices from CoinGecko
    logger.info('[CryptoPriceService] Fetching fresh prices from CoinGecko...');

    const data = await fetchPricesWithRetry();

    // Update cache with all fetched prices (include timestamp for each)
    for (const [chainName, coinId] of Object.entries(COINGECKO_IDS)) {
      const price = data[coinId]?.usd;
      if (price) {
        priceCache[chainName] = { price, timestamp: now };
      }
    }

    lastFetchTime = now;

    // Log prices without timestamp for readability
    const pricesForLog = Object.fromEntries(
      Object.entries(priceCache).map(([k, v]) => [k, v.price])
    );
    logger.info('[CryptoPriceService] Prices fetched successfully:', pricesForLog);

    // Return requested chain's price
    const cached = priceCache[chain];
    if (!cached) {
      throw new Error(`Price not available for ${chain}`);
    }

    return cached.price;
  } catch (error) {
    // Special handling for rate limit - use stale cache as fallback
    if (error.isRateLimit && priceCache[chain]) {
      const cached = priceCache[chain];
      checkAndLogStalePrice(chain, cached);
      logger.warn(
        `[CryptoPriceService] Rate limited, using cached price for ${chain}: $${cached.price}`
      );
      return cached.price;
    }

    logger.error('[CryptoPriceService] Failed to fetch crypto price:', {
      chain,
      error: error.message,
      response: error.response?.data,
    });

    // If cache exists, return stale data as fallback
    if (priceCache[chain]) {
      const cached = priceCache[chain];
      checkAndLogStalePrice(chain, cached);
      logger.warn(
        `[CryptoPriceService] API failed, using cached price for ${chain}: $${cached.price}`
      );
      return cached.price;
    }

    throw new Error(`Failed to fetch ${chain} price: ${error.message}`);
  }
}

/**
 * Convert USD amount to cryptocurrency amount
 * Uses Decimal.js for precise calculations (no floating point errors)
 *
 * @param {number} usdAmount - Amount in USD
 * @param {number} cryptoPrice - Current crypto price in USD
 * @returns {string} Amount in crypto (string to preserve precision)
 * @throws {Error} If cryptoPrice is invalid
 */
export function convertUsdToCrypto(usdAmount, cryptoPrice) {
  if (!cryptoPrice || cryptoPrice <= 0) {
    throw new Error('Invalid crypto price');
  }

  // Use Decimal.js for precise conversion
  return convertUsdToCryptoDecimal(usdAmount, cryptoPrice);
}

/**
 * Round crypto amount to appropriate decimal places
 * Uses Decimal.js to avoid precision loss
 *
 * @param {number|string} amount - Crypto amount (unrounded)
 * @param {string} chain - Chain name
 * @returns {string} Rounded crypto amount (string to preserve precision)
 */
export function roundCryptoAmount(amount, chain) {
  const decimals = CRYPTO_DECIMALS[chain] || 8; // Default to 8 decimals
  return roundCryptoAmountDecimal(amount, decimals);
}

/**
 * Get USD → Crypto conversion with proper rounding (convenience method)
 * Returns string amounts to preserve precision
 *
 * @param {number} usdAmount - Amount in USD
 * @param {string} chain - Chain name
 * @returns {Promise<object>} { cryptoAmount (string), usdRate (number) }
 */
export async function convertAndRound(usdAmount, chain) {
  const cryptoPrice = await getCryptoPrice(chain);
  const cryptoAmount = convertUsdToCrypto(usdAmount, cryptoPrice);
  // cryptoAmount is already rounded by convertUsdToCrypto (8 decimals)

  return {
    cryptoAmount, // String to preserve precision
    usdRate: cryptoPrice,
  };
}

export default {
  getCryptoPrice,
  convertUsdToCrypto,
  roundCryptoAmount,
  convertAndRound,
};
