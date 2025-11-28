/**
 * ProductAI Constants
 * Conversation and stock update configuration
 */

// Conversation history limits
export const MAX_HISTORY_MESSAGES = 40; // Keep last 40 messages (~10 tool exchanges or 20 text exchanges)
export const CONVERSATION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours

// Natural language shortcuts for stock updates
export const STOCK_KEYWORDS = ['сток', 'наличие', 'остаток', 'stock', 'quantity', 'qty', 'qnty'];

export const STOCK_ACTION_KEYWORDS = [
  'обнови',
  'обновить',
  'выстави',
  'выставить',
  'поставь',
  'поставить',
  'установи',
  'установить',
  'измени',
  'изменить',
  'set',
  'update',
  'change',
];

export const STOCK_INVALID_TARGET_KEYWORDS = [
  'все',
  'каждый',
  'каждая',
  'каждому',
  'каждой',
  'каждые',
  'каждый товар',
  'каждому товару',
  'всем',
  'all',
  'every',
];

export const STOCK_UPDATE_PATTERNS = [
  /(?:обнови(?:ть)?|выстави(?:ть)?|поставь|поставить|установи|установить|измени|изменить|set|update|change)\s+(?:сток|наличие|остаток|stock|quantity|qty|qnty)\s+(?<product>.+?)\s*(?:до|на|=)\s*(?<quantity>\d+)/i,
  /(?:обнови(?:ть)?|выстави(?:ть)?|поставь|поставить|установи|установить|измени|изменить|set|update|change)\s+(?<product>.+?)\s*(?:сток|наличие|остаток|stock|quantity|qty|qnty)\s*(?:до|на|=)\s*(?<quantity>\d+)/i,
  /(?:сток|наличие|остаток|stock|quantity|qty|qnty)\s+(?<product>.+?)\s*(?:до|на|=)\s*(?<quantity>\d+)/i,
  /(?<product>.+?)\s*(?:сток|наличие|остаток|stock|quantity|qty|qnty)\s*(?:до|на|=)\s*(?<quantity>\d+)/i,
  /(?<quantity>\d+)\s*(?:шт|штук|pcs|pieces|ед|единиц)?\s*(?:для|по|на)\s+(?<product>.+)/i,
  /(?:наличие|сток|остаток|stock|quantity|qty|qnty)\s+(?<quantity>\d+)\s*(?:шт|штук|pcs|pieces|ед|единиц)?\s*(?:для|у|по)?\s*(?<product>.+)/i,
];
