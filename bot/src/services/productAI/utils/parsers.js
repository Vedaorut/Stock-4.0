/**
 * ProductAI Parsers
 * Functions for parsing duration strings and other user input
 */

/**
 * Parse duration string to milliseconds
 * Supports: "6 часов", "3 дня", "12h", "24 hours", "1 week", etc.
 * @param {string} text - Duration string
 * @returns {number|null} Duration in milliseconds or null if invalid
 */
export function parseDurationToMs(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const normalized = text.toLowerCase().trim();

  // Patterns: "6 часов", "3 дня", "12h", "24 hours", etc.
  const patterns = [
    // Russian hours
    { regex: /(\d+)\s*(?:часов|часа|час)/i, multiplier: 60 * 60 * 1000 },
    // Russian days
    { regex: /(\d+)\s*(?:дней|дня|день)/i, multiplier: 24 * 60 * 60 * 1000 },
    // Russian weeks
    { regex: /(\d+)\s*(?:недель|недели|неделя)/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
    // English hours
    { regex: /(\d+)\s*(?:hours?|hrs?|h)/i, multiplier: 60 * 60 * 1000 },
    // English days
    { regex: /(\d+)\s*(?:days?|d)/i, multiplier: 24 * 60 * 60 * 1000 },
    // English weeks
    { regex: /(\d+)\s*(?:weeks?|w)/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
  ];

  for (const pattern of patterns) {
    const match = pattern.regex.exec(normalized);
    if (match) {
      const value = parseInt(match[1], 10);
      if (Number.isFinite(value) && value > 0) {
        return value * pattern.multiplier;
      }
    }
  }

  return null;
}
