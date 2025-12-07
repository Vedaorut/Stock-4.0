/**
 * ProductAI Cleaners
 * Functions for cleaning and sanitizing text data
 */

/**
 * Clean DeepSeek special tokens from text
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
export function cleanDeepSeekTokens(text) {
  if (!text || typeof text !== 'string') return text;

  return text
    .replace(/<｜tool calls begin｜>/g, '')
    .replace(/<｜tool calls end｜>/g, '')
    .replace(/<｜tool sep｜>/g, '')
    .replace(/<｜tool result begin｜>/g, '')
    .replace(/<｜tool result end｜>/g, '')
    .replace(/<｜end of sentence｜>/g, '')
    // Strip Markdown code blocks if AI wraps the entire response or parts of it
    .replace(/```(json|markdown|text)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
}

/**
 * Detect if text contains JSON patterns (technical data)
 * Used to prevent showing raw JSON to users
 * @param {string} text - Text to check
 * @returns {boolean} True if JSON patterns detected
 */
export function detectJSONInMessage(text) {
  if (!text || typeof text !== 'string') return false;

  const jsonPatterns = [
    /\{[\s\S]*"success"[\s\S]*:/i, // {"success": true}
    /\{[\s\S]*"error"[\s\S]*:/i, // {"error": ...}
    /\{[\s\S]*"data"[\s\S]*:/i, // {"data": ...}
    /\{[\s\S]*"product_id"[\s\S]*:/i, // {"product_id": 123}
    /\{[\s\S]*"message"[\s\S]*:/i, // {"message": "..."}
    /^\s*\{[\s\S]*\}\s*$/, // Entire response is JSON object
    /^\s*\[[\s\S]*\]\s*$/, // Entire response is JSON array
  ];

  return jsonPatterns.some((pattern) => pattern.test(text));
}

/**
 * Clean product candidate name from noise words
 * Removes common words in Russian and English that are not part of product names
 * @param {string} raw - Raw product name candidate
 * @returns {string} Cleaned product name
 */
export function cleanProductCandidate(raw) {
  if (!raw || typeof raw !== 'string') {
    return '';
  }

  // Noise words to filter out (Russian + English):
  // для/по/на = for/by/on (prepositions)
  // шт/штук/ед/единиц = pcs/pieces/units (quantity units)
  // товара/товар = product/item
  // количество = quantity
  // наличие/остаток = stock/availability
  return raw
    .replace(/["'«»]/g, '')
    .replace(
      /\b(для|по|на|шт|штук|pcs|pieces|ед|единиц|товара|товар|количество|quantity|qty|qnty|stock|наличие|остаток)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
}
