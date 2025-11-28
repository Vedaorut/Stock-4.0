/**
 * Intent Detection for ProductAI
 * Fast-path detection for stock updates and single product discounts
 */

import {
  STOCK_KEYWORDS,
  STOCK_ACTION_KEYWORDS,
  STOCK_INVALID_TARGET_KEYWORDS,
  STOCK_UPDATE_PATTERNS,
} from '../constants.js';
import { cleanProductCandidate } from '../utils/index.js';
import { fuzzySearchProducts } from '../../../utils/fuzzyMatch.js';

/**
 * Detect stock update intent from user command
 * Fast-path for commands like "iPhone 50 штук", "остаток VPN 100"
 *
 * @param {string} command - User command text
 * @returns {Object|null} { productName, quantity } or null if not detected
 */
export function detectStockUpdateIntent(command) {
  if (!command) {
    return null;
  }

  const normalized = command.toLowerCase();
  const hasStockKeyword = STOCK_KEYWORDS.some((keyword) => normalized.includes(keyword));
  const hasActionKeyword = STOCK_ACTION_KEYWORDS.some((keyword) => normalized.includes(keyword));

  if (!hasStockKeyword && !hasActionKeyword) {
    return null;
  }

  for (const pattern of STOCK_UPDATE_PATTERNS) {
    const match = pattern.exec(command);
    if (!match) {
      continue;
    }

    const rawQuantity = match.groups?.quantity;
    const rawProduct = match.groups?.product || '';

    const quantity = parseInt(rawQuantity, 10);
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000) {
      continue;
    }

    const productCandidate = cleanProductCandidate(rawProduct);
    if (!productCandidate) {
      continue;
    }

    const candidateLower = productCandidate.toLowerCase();

    if (STOCK_INVALID_TARGET_KEYWORDS.some((keyword) => candidateLower.includes(keyword))) {
      continue;
    }

    if (
      candidateLower.includes(' и ') ||
      candidateLower.includes(' and ') ||
      productCandidate.includes(',')
    ) {
      continue; // Multiple products mentioned - defer to AI
    }

    if (!/[a-zа-яё]/i.test(productCandidate)) {
      continue;
    }

    const candidateTokens = candidateLower.split(/\s+/).filter(Boolean);
    const hasMeaningfulToken = candidateTokens.some(
      (token) => !STOCK_KEYWORDS.includes(token) && !STOCK_ACTION_KEYWORDS.includes(token)
    );

    if (!hasMeaningfulToken) {
      continue;
    }

    return {
      productName: productCandidate,
      quantity,
    };
  }

  return null;
}

/**
 * Detect single product discount intent from user command
 * Fast-path for commands like "скидка 20% на iPhone", "VPN -15%"
 *
 * @param {string} command - User command text
 * @param {Array} products - Available products array
 * @param {Object} ctx - Telegraf context (for session context)
 * @returns {Object|null} { product, percentage, duration } or { error } or null
 */
export function detectSingleProductDiscountIntent(command, products, ctx) {
  if (!command) {
    return null;
  }

  const normalized = command.toLowerCase();
  if (!/(скид|discount|%)/.test(normalized)) {
    return null;
  }

  const percentMatch = command.match(/(-?\d+(?:[.,]\d+)?)\s*%/);
  if (!percentMatch) {
    return null;
  }

  const percentage = parseFloat(percentMatch[1].replace(',', '.'));
  if (!Number.isFinite(percentage)) {
    return null;
  }

  if (percentage <= 0) {
    return {
      error: {
        message: 'Скидка должна быть больше 0%. Укажи корректное значение.',
      },
    };
  }

  if (percentage > 100) {
    return {
      error: {
        message: 'Скидка не может быть больше 100%. Сколько поставить?',
        value: percentage,
      },
    };
  }

  // Bug #1 fix: Check for multiple products
  const hasMultipleProducts = /\s(и|,|а также|плюс)\s/.test(normalized);
  if (hasMultipleProducts) {
    return null; // Let AI handle multiple products
  }

  // Bug #3 fix: Check for multiple discount percentages
  const percentages = command.match(/\d+%/g);
  if (percentages && percentages.length > 1) {
    return null; // Let AI handle different discounts per product
  }

  const mentionsAll = /(всем|на все|весь|по всем|по каталогу|all|every|each|каталог)/.test(
    normalized
  );
  if (mentionsAll) {
    return null;
  }

  const chooseFromContext = () => {
    const lastName = ctx?.session?.aiContext?.lastProductName;
    if (!lastName) {
      return null;
    }
    const matches = fuzzySearchProducts(lastName, products, 0.4);
    if (matches.length === 1) {
      return matches[0].product;
    }
    return null;
  };

  const chooseByExplicitMention = () => {
    const cleanedCommand = normalized.replace(/[^a-zа-я0-9\s]/gi, ' ');
    for (const product of products) {
      if (!product.name) {
        continue;
      }
      const productName = product.name.toLowerCase();
      if (cleanedCommand.includes(productName)) {
        return product;
      }
    }
    return null;
  };

  // Bug #2 fix: Removed fallback to single product
  // Previously: if only 1 product exists, apply discount regardless of name
  // Now: only apply discount if product is explicitly mentioned or in context
  const product = chooseFromContext() || chooseByExplicitMention();

  if (!product) {
    return null;
  }

  const durationMatch = command.match(
    /\d+\s*(?:час(?:ов|а)?|минут(?:ы|у)?|дн(?:ей|я|ь)?|недел(?:я|и|ь)?|hours?|hrs?|h|days?|d|weeks?|w)/i
  );
  const duration = durationMatch ? durationMatch[0] : null;

  return {
    product,
    percentage,
    duration,
  };
}
