import { ValidationError } from '../../../utils/errors.js';
import { CHAIN_MAP, VALID_TIERS } from '../constants.js';
import { extractTxHashFromUrl } from '../../order/validators/payloadValidators.js';

const TEST_CHAIN_ADDRESSES = {
  BTC: 'bcrt1qtestaddress000000000000000000000',
  LTC: 'ltc1qtestaddress000000000000000000000',
  ETH: '0x1111111111111111111111111111111111111111',
  USDT_TRC20: 'T111111111111111111111111111111111',
};

export function validateChainSelection(chain) {
  const normalized = (chain || '').toUpperCase();

  if (!normalized || !CHAIN_MAP[normalized]) {
    throw new ValidationError('Invalid chain');
  }

  const config = CHAIN_MAP[normalized];
  const envAddress = process.env[config.envVar];
  const address =
    envAddress || (process.env.NODE_ENV === 'test' ? TEST_CHAIN_ADDRESSES[normalized] : null);

  if (!address) {
    const envVar = config.envVar || `TEST_${normalized}_ADDRESS`;
    throw new ValidationError(
      `Payment address for ${normalized} is not configured. Set ${envVar} env variable.`
    );
  }

  return { ...config, chain: normalized, address };
}

export function ensurePaymentProof({ txHash, paymentLink, txLink, transactionUrl } = {}) {
  const rawProof = txHash || paymentLink || txLink || transactionUrl;

  if (!rawProof) {
    throw new ValidationError('txHash or payment link is required');
  }

  // Extract hash from URL if provided (supports Etherscan, TronScan, Blockchair, etc.)
  const extractedHash = extractTxHashFromUrl(rawProof);

  return {
    proof: extractedHash,
    txHash: extractedHash,
    paymentLink: paymentLink || txLink || transactionUrl || null,
  };
}

export function validatePendingSubscriptionInput(body = {}) {
  const { tier, shopId: rawShopId } = body;

  if (!tier || !VALID_TIERS.includes(tier)) {
    throw new ValidationError('Invalid tier. Use "pro" or "max"');
  }

  const shopId =
    rawShopId === undefined || rawShopId === null ? null : Number.parseInt(rawShopId, 10);

  if (rawShopId !== undefined && (!Number.isInteger(shopId) || shopId <= 0)) {
    throw new ValidationError('Invalid shopId');
  }

  return { tier, shopId };
}
