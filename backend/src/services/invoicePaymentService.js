/**
 * Invoice Payment Service - Facade for backward compatibility
 *
 * @module invoicePaymentService
 * @description Re-exports from modular invoicePayment/ structure
 *
 * Usage (both work):
 *   import invoicePaymentService from './invoicePaymentService.js';
 *   import { processOrderPayment } from './invoicePayment/index.js';
 */

// Re-export everything from new modular structure
export * from './invoicePayment/index.js';

// Default export for backward compatibility
export { default } from './invoicePayment/index.js';
