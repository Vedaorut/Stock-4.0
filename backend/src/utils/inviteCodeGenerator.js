/**
 * Invite Code Generator
 *
 * Generates personalized invite codes for shops based on shop name.
 * - Transliterates Russian to Latin
 * - Removes special characters
 * - Adds random suffix for uniqueness
 */

// Russian to Latin transliteration map
const translitMap = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ' ': '_',
};

/**
 * Transliterate Russian text to Latin
 * @param {string} text - Input text (may contain Russian characters)
 * @returns {string} - Transliterated text
 */
function transliterate(text) {
  if (!text) return '';

  let result = '';
  for (const char of text) {
    const lowerChar = char.toLowerCase();
    if (translitMap[lowerChar] !== undefined) {
      // Preserve case for first letter
      const transliterated = translitMap[lowerChar];
      if (char === char.toUpperCase() && char !== char.toLowerCase()) {
        // Capitalize first letter of transliteration
        result += transliterated.charAt(0).toUpperCase() + transliterated.slice(1);
      } else {
        result += transliterated;
      }
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Clean text to only allow alphanumeric, underscore, and hyphen
 * @param {string} text - Input text
 * @returns {string} - Cleaned text
 */
function cleanText(text) {
  if (!text) return '';

  // Remove any character that's not alphanumeric, underscore, or hyphen
  let cleaned = text.replace(/[^a-zA-Z0-9_-]/g, '');

  // Remove consecutive underscores
  cleaned = cleaned.replace(/_+/g, '_');

  // Remove leading/trailing underscores
  cleaned = cleaned.replace(/^_+|_+$/g, '');

  return cleaned;
}

/**
 * Generate a random alphanumeric suffix
 * @param {number} length - Length of suffix (default: 3)
 * @returns {string} - Random suffix like "x7k"
 */
function generateSuffix(length = 3) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < length; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return suffix;
}

/**
 * Generate a unique invite code for a shop
 *
 * @param {string} shopName - The shop name to base the code on
 * @param {string[]} existingCodes - Array of existing invite codes to avoid collisions
 * @returns {string} - Unique invite code (max 30 chars)
 *
 * @example
 * generateInviteCode("My Cool Shop", [])
 * // Returns: "MyCoolShop_x7k"
 *
 * generateInviteCode("Крутые Кроссовки", ["KrutyeKrossovki_a2b"])
 * // Returns: "KrutyeKrossovki_c3d" (different suffix)
 */
export function generateInviteCode(shopName, existingCodes = []) {
  // Step 1: Transliterate Russian to Latin
  let code = transliterate(shopName);

  // Step 2: Clean (only alphanumeric + underscore + hyphen)
  code = cleanText(code);

  // Step 3: Truncate to 25 chars (leaving 5 for suffix "_xxx")
  code = code.substring(0, 25);

  // Step 4: Fallback if empty
  if (!code) {
    code = 'shop';
  }

  // Step 5: Add random suffix and ensure uniqueness
  const existingSet = new Set(existingCodes.map((c) => c?.toLowerCase()));
  let finalCode;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    const suffix = generateSuffix(3);
    finalCode = `${code}_${suffix}`;
    attempts++;

    // Safety: prevent infinite loop
    if (attempts > maxAttempts) {
      // Fallback: use timestamp
      finalCode = `${code}_${Date.now().toString(36).slice(-5)}`;
      break;
    }
  } while (existingSet.has(finalCode.toLowerCase()));

  return finalCode;
}

/**
 * Validate if a string could be an invite code (vs legacy shop_123 format)
 * @param {string} code - The code to check
 * @returns {boolean} - True if it looks like an invite code
 */
export function isInviteCode(code) {
  if (!code) return false;

  // Legacy format: shop_123 (starts with "shop_" followed by digits only)
  const legacyPattern = /^shop_\d+$/;
  if (legacyPattern.test(code)) {
    return false; // This is legacy format, not invite code
  }

  // Valid invite code: alphanumeric with underscore/hyphen, 3-50 chars
  const inviteCodePattern = /^[a-zA-Z0-9_-]{3,50}$/;
  return inviteCodePattern.test(code);
}

/**
 * Parse a deep link payload to extract shop identifier
 * @param {string} payload - The start parameter from deep link
 * @returns {{ type: 'id' | 'invite_code', value: number | string } | null}
 */
export function parseShopPayload(payload) {
  if (!payload) return null;

  // Check for legacy format: shop_123
  const legacyMatch = payload.match(/^shop_(\d+)$/);
  if (legacyMatch) {
    const id = parseInt(legacyMatch[1], 10);
    if (!isNaN(id) && id > 0) {
      return { type: 'id', value: id };
    }
  }

  // Check for invite code format (any other valid string)
  if (isInviteCode(payload)) {
    return { type: 'invite_code', value: payload };
  }

  return null;
}

export default {
  generateInviteCode,
  isInviteCode,
  parseShopPayload,
};
