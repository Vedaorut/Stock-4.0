/**
 * QR Code Helper with Timeout Handling
 *
 * Provides timeout-safe QR generation to prevent infinite hangs
 * when backend API is unresponsive
 */

import { t } from '../i18n/index.js';

const QR_TIMEOUT = 10000; // 10 seconds

/**
 * Generate QR code with timeout protection
 *
 * @param {Function} generateFn - Async function that generates QR
 * @param {number} timeout - Timeout in milliseconds (default: 10s)
 * @returns {Promise} - Resolves with QR result or rejects with timeout error
 *
 * @example
 * const qrBuffer = await generateQRWithTimeout(
 *   () => walletApi.generateQR(qrData, token),
 *   10000
 * );
 */
async function generateQRWithTimeout(generateFn, timeout = QR_TIMEOUT) {
  return Promise.race([
    generateFn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('QR_GENERATION_TIMEOUT')), timeout)
    ),
  ]);
}

/**
 * Check if error is a QR generation timeout
 *
 * @param {Error} error - Error to check
 * @returns {boolean} - True if error is a timeout
 */
function isQRTimeout(error) {
  return error?.message === 'QR_GENERATION_TIMEOUT';
}

/**
 * Get user-friendly error message for QR generation error
 *
 * @param {Error} error - Error from QR generation
 * @param {string} lang - Language code
 * @returns {string} - User-friendly error message
 */
function getQRErrorMessage(error, lang = 'ru') {
  if (isQRTimeout(error)) {
    return t('qrHelper.timeout', {}, lang);
  }

  if (error?.response?.status === 400) {
    return t('qrHelper.invalidData', {}, lang);
  }

  if (error?.response?.status === 401) {
    return t('qrHelper.unauthorized', {}, lang);
  }

  if (error?.response?.status >= 500) {
    return t('qrHelper.serverUnavailable', {}, lang);
  }

  return t('qrHelper.defaultError', {}, lang);
}

export { generateQRWithTimeout, isQRTimeout, getQRErrorMessage, QR_TIMEOUT };
