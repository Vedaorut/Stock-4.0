import { ValidationError } from '../../../utils/errors.js';
import { VALID_PAYMENT_CURRENCIES } from '../constants.js';

export function validateCurrencyParam(currency) {
  if (!currency || !VALID_PAYMENT_CURRENCIES.includes(currency.toUpperCase())) {
    throw new ValidationError(
      `Invalid currency. Valid options: ${VALID_PAYMENT_CURRENCIES.join(', ')}`
    );
  }

  return currency.toUpperCase();
}

export function validateTxHash(txHash) {
  if (!txHash || typeof txHash !== 'string' || txHash.length < 10) {
    throw new ValidationError('Valid transaction hash required');
  }
}

export function validateDateRange(from, to) {
  if (!from || !to) {
    throw new ValidationError('Missing required parameters: from and to dates (YYYY-MM-DD format)');
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    throw new ValidationError('Invalid date format. Use YYYY-MM-DD (e.g., 2025-01-01)');
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    throw new ValidationError('Invalid date values');
  }

  if (fromDate > toDate) {
    throw new ValidationError('from date must be before or equal to to date');
  }

  const now = new Date();
  if (fromDate > now) {
    throw new ValidationError('from date cannot be in the future');
  }

  return { fromDate, toDate };
}
