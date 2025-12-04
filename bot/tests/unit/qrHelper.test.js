/**
 * Tests for QR Helper timeout handling
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  generateQRWithTimeout,
  isQRTimeout,
  getQRErrorMessage,
  QR_TIMEOUT,
} from '../../src/utils/qrHelper.js';

describe('QR Helper', () => {
  describe('generateQRWithTimeout', () => {
    it('should return data if generation completes within timeout', async () => {
      const mockData = { success: true, data: { qrCode: 'base64data' } };
      const generateFn = jest.fn(async () => mockData);

      const result = await generateQRWithTimeout(generateFn, 5000);

      expect(result).toEqual(mockData);
      expect(generateFn).toHaveBeenCalledTimes(1);
    });

    it('should use default timeout of 10 seconds', async () => {
      expect(QR_TIMEOUT).toBe(10000);
    });

    it('should reject with timeout error if generation takes longer than timeout', async () => {
      const generateFn = jest.fn(() => new Promise((resolve) => setTimeout(resolve, 5000)));

      await expect(generateQRWithTimeout(generateFn, 1000)).rejects.toEqual(
        new Error('QR_GENERATION_TIMEOUT')
      );
    });

    it('should propagate generation errors', async () => {
      const generateError = new Error('API Error');
      const generateFn = jest.fn(async () => {
        throw generateError;
      });

      await expect(generateQRWithTimeout(generateFn, 5000)).rejects.toEqual(generateError);
    });

    it('should handle timeout error from Promise.race correctly', async () => {
      const generateFn = jest.fn(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 3000))
      );

      await expect(generateQRWithTimeout(generateFn, 1000)).rejects.toThrow(
        'QR_GENERATION_TIMEOUT'
      );
    });
  });

  describe('isQRTimeout', () => {
    it('should return true for QR timeout error', () => {
      const error = new Error('QR_GENERATION_TIMEOUT');
      expect(isQRTimeout(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      const error = new Error('API Error');
      expect(isQRTimeout(error)).toBe(false);
    });

    it('should handle null error gracefully', () => {
      expect(isQRTimeout(null)).toBe(false);
    });

    it('should handle error without message property', () => {
      expect(isQRTimeout({})).toBe(false);
    });
  });

  describe('getQRErrorMessage', () => {
    it('should return timeout message for QR timeout error', () => {
      const error = new Error('QR_GENERATION_TIMEOUT');
      const message = getQRErrorMessage(error);

      expect(message).toBe('QR код генерируется слишком долго. Попробуйте позже.');
    });

    it('should return 400 message for bad request', () => {
      const error = new Error('Bad request');
      error.response = { status: 400 };
      const message = getQRErrorMessage(error);

      expect(message).toBe('Некорректные данные для QR кода. Проверьте адрес кошелька.');
    });

    it('should return 401 message for unauthorized', () => {
      const error = new Error('Unauthorized');
      error.response = { status: 401 };
      const message = getQRErrorMessage(error);

      expect(message).toBe('Вы не авторизованы. Попробуйте позже.');
    });

    it('should return 500+ message for server error', () => {
      const error = new Error('Server error');
      error.response = { status: 500 };
      const message = getQRErrorMessage(error);

      expect(message).toBe('Сервер недоступен. Попробуйте позже.');
    });

    it('should return default message for unknown error', () => {
      const error = new Error('Unknown error');
      const message = getQRErrorMessage(error);

      // Uses i18n key 'qrHelper.defaultError' which resolves to localized text
      expect(message).toBe('Не удалось сформировать QR-код');
    });

    it('should use specified language for default message', () => {
      const error = new Error('Unknown error');
      // Second parameter is now 'lang', not 'defaultMessage'
      const message = getQRErrorMessage(error, 'ru');

      // Should return default error message in Russian
      expect(message).toBe('Не удалось сформировать QR-код');
    });

    it('should handle error without response property', () => {
      const error = new Error('Network error');
      // Second parameter is 'lang', function returns localized default message
      const message = getQRErrorMessage(error, 'ru');

      expect(message).toBe('Не удалось сформировать QR-код');
    });
  });
});
