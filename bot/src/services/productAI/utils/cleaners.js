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
    // DeepSeek special tokens (both space and ▁ variants)
    .replace(/<｜tool[ ▁]calls[ ▁]begin｜>/g, '')
    .replace(/<｜tool[ ▁]calls[ ▁]end｜>/g, '')
    .replace(/<｜tool[ ▁]sep｜>/g, '')
    .replace(/<｜tool[ ▁]result[ ▁]begin｜>/g, '')
    .replace(/<｜tool[ ▁]result[ ▁]end｜>/g, '')
    .replace(/<｜end[ ▁]of[ ▁]sentence｜>/g, '')
    // DSML tags (DeepSeek Markup Language) - CRITICAL FIX
    .replace(/<｜DSML｜[^>]*>/g, '')
    .replace(/<｜DSML｜>/g, '')
    .replace(/<\/｜DSML｜[^>]*>/g, '')
    // Any DSML-style function calls
    .replace(/<｜DSML｜function_calls>[\s\S]*?<\/｜DSML｜function_calls>/g, '')
    .replace(/<｜DSML｜invoke[^>]*>[\s\S]*?<\/｜DSML｜invoke>/g, '')
    .replace(/<｜DSML｜parameter[^>]*>[\s\S]*?<\/｜DSML｜parameter>/g, '')
    // XML-style function calls (generic)
    .replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '')
    .replace(/<invoke[^>]*>[\s\S]*?<\/invoke>/gi, '')
    .replace(/<parameter[^>]*>[\s\S]*?<\/parameter>/gi, '')
    // Enhanced JSON stripping
    .replace(/```(json|javascript|js|markdown|text)?\s*/gi, '')
    .replace(/```/g, '')
    // Strip function calls with JSON arguments: functionName({...})
    .replace(/\w+\s*\(\s*\{[\s\S]*?\}\s*\)/g, '')
    // Strip standalone JSON objects (entire line)
    .replace(/^\s*\{[^}]*"(?:success|error|data|message|product_id)"[^}]*\}\s*$/gm, '')
    // Strip JSON arrays
    .replace(/^\s*\[[\s\S]*\]\s*$/gm, '')
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

  const technicalPatterns = [
    // JSON patterns
    /\{[\s\S]*"success"[\s\S]*:/i, // {"success": true}
    /\{[\s\S]*"error"[\s\S]*:/i, // {"error": ...}
    /\{[\s\S]*"data"[\s\S]*:/i, // {"data": ...}
    /\{[\s\S]*"product_id"[\s\S]*:/i, // {"product_id": 123}
    /\{[\s\S]*"message"[\s\S]*:/i, // {"message": "..."}
    /^\s*\{[\s\S]*\}\s*$/, // Entire response is JSON object
    /^\s*\[[\s\S]*\]\s*$/, // Entire response is JSON array
    // DSML patterns (DeepSeek Markup Language)
    /<｜DSML｜/i, // Any DSML tag
    /<｜tool/i, // Tool-related tokens
    /<function_calls>/i, // XML function calls
    /<invoke\s+name=/i, // invoke tags
    /<parameter\s+name=/i, // parameter tags
  ];

  return technicalPatterns.some((pattern) => pattern.test(text));
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
