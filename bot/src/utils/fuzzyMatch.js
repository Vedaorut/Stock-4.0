/**
 * Fuzzy Matching Utilities
 * Implements Levenshtein distance for better product name matching
 */

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Edit distance
 */
export function levenshteinDistance(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  const m = s1.length;
  const n = s2.length;
  
  // Create 2D array
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  // Initialize first column and row
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  // Fill dp table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }
  
  return dp[m][n];
}

/**
 * Calculate similarity score (0-1) based on Levenshtein distance
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score (1 = identical, 0 = completely different)
 */
export function similarityScore(str1, str2) {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  
  if (maxLength === 0) return 1;
  
  return 1 - (distance / maxLength);
}

/**
 * Find best matching products using fuzzy search
 * @param {string} query - Search query
 * @param {Array} products - Array of products
 * @param {number} threshold - Minimum similarity score (0-1), default 0.5
 * @returns {Array} - Sorted array of matches with scores
 */
export function fuzzySearchProducts(query, products, threshold = 0.5) {
  if (!query || !products || products.length === 0) {
    return [];
  }
  
  const queryLower = query.toLowerCase();
  
  // Calculate scores for each product
  const matches = products.map(product => {
    const nameLower = product.name.toLowerCase();
    
    // Exact match gets score 1
    if (nameLower === queryLower) {
      return { product, score: 1.0, matchType: 'exact' };
    }
    
    // Substring match gets high score
    if (nameLower.includes(queryLower)) {
      return { product, score: 0.9, matchType: 'substring' };
    }
    
    // Query is substring of product name
    if (queryLower.includes(nameLower)) {
      return { product, score: 0.85, matchType: 'partial' };
    }
    
    // Fuzzy match using Levenshtein
    const score = similarityScore(query, product.name);
    return { product, score, matchType: 'fuzzy' };
  });
  
  // Filter by threshold and sort by score
  return matches
    .filter(m => m.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

/**
 * Check if text is likely noise/greeting (not a product command)
 * @param {string} text - User input text
 * @returns {boolean} - True if text is noise
 */
export function isNoiseCommand(text) {
  if (!text || typeof text !== 'string') return true;
  
  const normalized = text.toLowerCase().trim();
  
  // Too short
  if (normalized.length < 2) return true;
  
  // Common noise patterns (Russian and English)
  const noisePatterns = [
    /^(привет|hello|hi|hey|здравствуй|добрый день|доброе утро|добрый вечер)$/i,
    /^(спасибо|thanks|thank you|thx|благодарю)$/i,
    /^(пока|bye|goodbye|до свидания)$/i,
    /^(да|нет|yes|no|ок|ok|okay)$/i,
    /^(как дела|how are you|что нового)$/i,
    /^(ты тут|you there|есть кто|кто здесь)$/i,
    /^(помощь|help|справка|\?)$/i,
    /^(хм+|ммм+|эм+|um+|uh+)$/i,
  ];
  
  return noisePatterns.some(pattern => pattern.test(normalized));
}

/**
 * Extract product names from bulk delete command
 * Examples:
 *   "удали iPhone, Samsung и Xiaomi" -> ["iPhone", "Samsung", "Xiaomi"]
 *   "delete iPhone, Samsung, Xiaomi" -> ["iPhone", "Samsung", "Xiaomi"]
 * @param {string} text - Command text
 * @returns {Array<string>} - Extracted product names
 */
export function extractProductNames(text) {
  if (!text) return [];
  
  // Remove common verbs
  const cleaned = text
    .replace(/^(удали|delete|убери|remove|удалить)\s+/i, '')
    .replace(/\s+(товар|товары|product|products)\s*/gi, ' ')
    .trim();
  
  // Split by common separators
  const names = cleaned
    .split(/[,;\n]|\s+и\s+|\s+and\s+/)
    .map(name => name.trim())
    .filter(name => name.length > 0);
  
  return names;
}

export default {
  levenshteinDistance,
  similarityScore,
  fuzzySearchProducts,
  isNoiseCommand,
  extractProductNames
};
