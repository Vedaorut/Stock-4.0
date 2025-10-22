/**
 * Russian to English Transliteration
 * Converts Cyrillic characters to Latin equivalents
 */

// GOST 7.79-2000 transliteration table (ISO 9 system)
const translitMap = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
  'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
  'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
  'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
  'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
  'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '',
  'э': 'e', 'ю': 'yu', 'я': 'ya',
  
  // Uppercase
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D',
  'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh', 'З': 'Z', 'И': 'I',
  'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N',
  'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T',
  'У': 'U', 'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch',
  'Ш': 'Sh', 'Щ': 'Shch', 'Ъ': '', 'Ы': 'Y', 'Ь': '',
  'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
};

/**
 * Check if string contains Cyrillic characters
 * @param {string} text - Text to check
 * @returns {boolean} True if contains Cyrillic
 */
export function hasCyrillic(text) {
  if (!text || typeof text !== 'string') return false;
  return /[а-яА-ЯёЁ]/.test(text);
}

/**
 * Transliterate Russian text to English
 * @param {string} text - Russian text
 * @returns {string} Transliterated English text
 */
export function transliterate(text) {
  if (!text || typeof text !== 'string') return text;
  
  let result = '';
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // If character is in transliteration map, use it
    if (translitMap[char]) {
      result += translitMap[char];
    } else {
      // Keep non-Cyrillic characters as-is (numbers, spaces, symbols)
      result += char;
    }
  }
  
  return result;
}

/**
 * Auto-transliterate product name if contains Cyrillic
 * Capitalizes first letter of each word for better formatting
 * 
 * @param {string} name - Product name (possibly in Russian)
 * @returns {string} English product name
 */
export function autoTransliterateProductName(name) {
  if (!name || typeof name !== 'string') return name;
  
  // If no Cyrillic, return as-is
  if (!hasCyrillic(name)) {
    return name;
  }
  
  // Check if name is FULL Cyrillic (no Latin letters)
  const hasLatin = /[a-zA-Z]/.test(name);
  
  // Transliterate
  let transliterated = transliterate(name);
  
  // Only capitalize if FULL Cyrillic (preserve Latin capitalization for mixed content)
  if (!hasLatin) {
    // Full Cyrillic -> capitalize each word
    transliterated = transliterated
      .split(' ')
      .map(word => {
        if (word.length === 0) return word;
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }
  // else: mixed content (Latin + Cyrillic) -> keep as-is to preserve "iPhone", "MacBook" etc.
  
  return transliterated;
}

/**
 * Get transliteration info for logging/display
 * @param {string} original - Original text
 * @param {string} transliterated - Transliterated text
 * @returns {Object} Info object with changed flag and both texts
 */
export function getTransliterationInfo(original, transliterated) {
  return {
    changed: original !== transliterated,
    original,
    transliterated,
    hasCyrillic: hasCyrillic(original)
  };
}

export default {
  hasCyrillic,
  transliterate,
  autoTransliterateProductName,
  getTransliterationInfo
};
