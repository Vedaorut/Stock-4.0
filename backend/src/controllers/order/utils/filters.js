import { STATUS_ALIASES, VALID_ORDER_STATUSES } from '../constants.js';

export const parseStatusFilter = (statusParam) => {
  if (!statusParam) {
    return [];
  }

  const normalized = new Set();

  statusParam
    .split(',')
    .map((status) => status.trim().toLowerCase())
    .filter(Boolean)
    .forEach((status) => {
      const mapped = STATUS_ALIASES.get(status) || status;
      if (VALID_ORDER_STATUSES.has(mapped)) {
        normalized.add(mapped);
      }
    });

  return Array.from(normalized);
};
