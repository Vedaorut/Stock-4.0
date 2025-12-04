/**
 * ProductAI Constants
 * Conversation and stock update configuration
 */

// Conversation history limits
export const MAX_HISTORY_MESSAGES = 40; // Keep last 40 messages (~10 tool exchanges or 20 text exchanges)
export const CONVERSATION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours

// Natural language shortcuts for stock updates (Russian + English keywords)
export const STOCK_KEYWORDS = ['сток', 'наличие', 'остаток', 'stock', 'quantity', 'qty', 'qnty'];

export const STOCK_ACTION_KEYWORDS = [
  'обнови',      // update (imperative)
  'обновить',    // update (infinitive)
  'выстави',     // set (imperative)
  'выставить',   // set (infinitive)
  'поставь',     // put/set (imperative)
  'поставить',   // put/set (infinitive)
  'установи',    // install/set (imperative)
  'установить',  // install/set (infinitive)
  'измени',      // change (imperative)
  'изменить',    // change (infinitive)
  'set',
  'update',
  'change',
];

export const STOCK_INVALID_TARGET_KEYWORDS = [
  'все',           // all
  'каждый',        // each (masculine)
  'каждая',        // each (feminine)
  'каждому',       // to each (dative masculine)
  'каждой',        // to each (dative feminine)
  'каждые',        // each (plural)
  'каждый товар',  // each product
  'каждому товару', // to each product
  'всем',          // to all
  'all',
  'every',
];

// Stock update patterns for natural language parsing (Russian + English)
export const STOCK_UPDATE_PATTERNS = [
  // Pattern: "update stock iPhone to 50" or "обнови сток iPhone до 50"
  /(?:обнови(?:ть)?|выстави(?:ть)?|поставь|поставить|установи|установить|измени|изменить|set|update|change)\s+(?:сток|наличие|остаток|stock|quantity|qty|qnty)\s+(?<product>.+?)\s*(?:до|на|=)\s*(?<quantity>\d+)/i,
  // Pattern: "update iPhone stock to 50" or "обнови iPhone сток до 50"
  /(?:обнови(?:ть)?|выстави(?:ть)?|поставь|поставить|установи|установить|измени|изменить|set|update|change)\s+(?<product>.+?)\s*(?:сток|наличие|остаток|stock|quantity|qty|qnty)\s*(?:до|на|=)\s*(?<quantity>\d+)/i,
  // Pattern: "stock iPhone to 50" or "сток iPhone на 50"
  /(?:сток|наличие|остаток|stock|quantity|qty|qnty)\s+(?<product>.+?)\s*(?:до|на|=)\s*(?<quantity>\d+)/i,
  // Pattern: "iPhone stock to 50" or "iPhone сток на 50"
  /(?<product>.+?)\s*(?:сток|наличие|остаток|stock|quantity|qty|qnty)\s*(?:до|на|=)\s*(?<quantity>\d+)/i,
  // Pattern: "50 pcs for iPhone" or "50 шт для iPhone"
  /(?<quantity>\d+)\s*(?:шт|штук|pcs|pieces|ед|единиц)?\s*(?:для|по|на)\s+(?<product>.+)/i,
  // Pattern: "stock 50 pcs for iPhone" or "наличие 50 шт для iPhone"
  /(?:наличие|сток|остаток|stock|quantity|qty|qnty)\s+(?<quantity>\d+)\s*(?:шт|штук|pcs|pieces|ед|единиц)?\s*(?:для|у|по)?\s*(?<product>.+)/i,
];
