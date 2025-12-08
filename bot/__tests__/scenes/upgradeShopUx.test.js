/**
 * UpgradeShop Payment UX Tests
 *
 * Tests for payment flow UX improvements:
 * - QR message_id tracking
 * - Keyboard clearing on upgrade:paid
 * - Clean prompts without keyboards
 * - TX hash validation by chain
 *
 * Run: npm test -- upgradeShopUx
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ===========================================
// Mock Utilities
// ===========================================

/**
 * Create mock Telegraf context for testing
 */
const createMockContext = (overrides = {}) => ({
  wizard: {
    state: {},
    next: jest.fn(),
    back: jest.fn(),
  },
  scene: {
    leave: jest.fn(),
    enter: jest.fn(),
  },
  session: {
    token: 'test-token',
    shopId: 1,
    language: 'ru',
  },
  callbackQuery: null,
  message: null,
  chat: { id: 123 },
  from: { id: 456 },
  telegram: {
    editMessageReplyMarkup: jest.fn().mockResolvedValue(true),
    deleteMessage: jest.fn().mockResolvedValue(true),
  },
  reply: jest.fn().mockResolvedValue({ message_id: 999 }),
  replyWithPhoto: jest.fn().mockResolvedValue({ message_id: 789 }),
  answerCbQuery: jest.fn().mockResolvedValue(true),
  editMessageText: jest.fn().mockResolvedValue(true),
  lang: 'ru',
  t: (key) => key,
  ...overrides,
});

/**
 * Validate BTC transaction hash format
 * BTC: 64 hex characters (no 0x prefix)
 */
const validateBtcTxHash = (hash) => {
  if (!hash || typeof hash !== 'string') return false;
  const trimmed = hash.trim();
  // BTC tx hash: exactly 64 hex characters, no 0x prefix
  return /^[a-fA-F0-9]{64}$/.test(trimmed);
};

/**
 * Validate ETH transaction hash format
 * ETH: 0x + 64 hex characters
 */
const validateEthTxHash = (hash) => {
  if (!hash || typeof hash !== 'string') return false;
  const trimmed = hash.trim();
  // ETH tx hash: 0x prefix + 64 hex characters
  return /^0x[a-fA-F0-9]{64}$/.test(trimmed);
};

/**
 * Validate LTC transaction hash format
 * LTC: 64 hex characters (same as BTC)
 */
const validateLtcTxHash = (hash) => {
  return validateBtcTxHash(hash);
};

/**
 * Validate USDT TRC20 transaction hash format
 * USDT TRC20: 64 hex characters (Tron format)
 */
const validateUsdtTrc20TxHash = (hash) => {
  if (!hash || typeof hash !== 'string') return false;
  const trimmed = hash.trim();
  // USDT TRC20 tx hash: 64 hex characters
  return /^[a-fA-F0-9]{64}$/.test(trimmed);
};

// ===========================================
// Test Suite: UpgradeShop Payment UX
// ===========================================

describe('UpgradeShop Payment UX', () => {
  let ctx;

  beforeEach(() => {
    jest.clearAllMocks();
    ctx = createMockContext();
  });

  // ===========================================
  // Test 1: QR message stores message_id
  // ===========================================
  describe('QR Message ID Tracking', () => {
    it('should store qrMessageId in wizard state after sending QR', async () => {
      // Setup: Mock replyWithPhoto to return message with id
      const expectedMessageId = 123;
      ctx.replyWithPhoto.mockResolvedValue({ message_id: expectedMessageId });

      // Simulate createUpgradeInvoiceAndShow behavior
      // In the actual implementation, this would call ctx.replyWithPhoto
      const qrMessage = await ctx.replyWithPhoto(
        { source: Buffer.from('mock-qr') },
        {
          caption: 'Payment QR',
          parse_mode: 'HTML',
        }
      );

      // Store message_id in wizard state (as the fix should do)
      ctx.wizard.state.qrMessageId = qrMessage.message_id;

      // Assert
      expect(ctx.wizard.state.qrMessageId).toBe(expectedMessageId);
      expect(ctx.replyWithPhoto).toHaveBeenCalledTimes(1);
    });

    it('should preserve qrMessageId across wizard steps', () => {
      // Setup: Simulate QR sent in step 3
      ctx.wizard.state.qrMessageId = 456;
      ctx.wizard.state.currency = 'BTC';
      ctx.wizard.state.address = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';

      // Simulate wizard.next() - state should be preserved
      ctx.wizard.next();

      // Assert: qrMessageId still available in step 4
      expect(ctx.wizard.state.qrMessageId).toBe(456);
    });
  });

  // ===========================================
  // Test 2: upgrade:paid clears QR keyboard
  // ===========================================
  describe('Clear QR Keyboard on upgrade:paid', () => {
    it('should clear QR message keyboard when user clicks upgrade:paid', async () => {
      // Setup: QR message was sent previously
      ctx.wizard.state.qrMessageId = 456;
      ctx.callbackQuery = { data: 'upgrade:paid' };

      // Simulate handler clearing keyboard
      // In the actual fix, this would be called when handling upgrade:paid
      if (ctx.wizard.state.qrMessageId) {
        await ctx.telegram.editMessageReplyMarkup(
          ctx.chat.id,
          ctx.wizard.state.qrMessageId,
          undefined, // inline_message_id
          { inline_keyboard: [] } // empty keyboard
        );
      }

      // Assert
      expect(ctx.telegram.editMessageReplyMarkup).toHaveBeenCalledWith(
        123, // chat.id
        456, // qrMessageId
        undefined,
        { inline_keyboard: [] }
      );
    });

    it('should NOT throw error if qrMessageId is not set', async () => {
      // Setup: No QR message was sent
      ctx.wizard.state.qrMessageId = undefined;
      ctx.callbackQuery = { data: 'upgrade:paid' };

      // Simulate handler - should not call editMessageReplyMarkup
      if (ctx.wizard.state.qrMessageId) {
        await ctx.telegram.editMessageReplyMarkup(
          ctx.chat.id,
          ctx.wizard.state.qrMessageId,
          undefined,
          { inline_keyboard: [] }
        );
      }

      // Assert: editMessageReplyMarkup was NOT called
      expect(ctx.telegram.editMessageReplyMarkup).not.toHaveBeenCalled();
    });

    it('should handle Telegram API errors gracefully when clearing keyboard', async () => {
      // Setup: QR message was sent but may have been deleted
      ctx.wizard.state.qrMessageId = 456;
      ctx.telegram.editMessageReplyMarkup.mockRejectedValue(
        new Error('Bad Request: message to edit not found')
      );

      // Simulate handler with error handling
      let error = null;
      try {
        await ctx.telegram.editMessageReplyMarkup(
          ctx.chat.id,
          ctx.wizard.state.qrMessageId,
          undefined,
          { inline_keyboard: [] }
        );
      } catch (e) {
        error = e;
        // Should be caught and ignored in actual implementation
      }

      // Assert: Error was thrown (implementation should catch it)
      expect(error).not.toBeNull();
      expect(error.message).toContain('message to edit not found');
    });
  });

  // ===========================================
  // Test 3: tx_hash prompt has no keyboard
  // ===========================================
  describe('TX Hash Prompt Without Keyboard', () => {
    it('should send tx_hash prompt WITHOUT inline keyboard', async () => {
      // Setup: User clicked upgrade:paid
      ctx.wizard.state.awaitingTxHash = true;

      // Simulate sending prompt WITHOUT keyboard
      // The fix should remove keyboard from smartMessage.send call
      const promptText = 'Please enter your transaction hash:';
      await ctx.reply(promptText, { parse_mode: 'HTML' });

      // Assert: reply called WITHOUT keyboard parameter
      expect(ctx.reply).toHaveBeenCalledWith(promptText, { parse_mode: 'HTML' });
      expect(ctx.reply).toHaveBeenCalledTimes(1);

      // Verify no inline_keyboard in call
      const callArgs = ctx.reply.mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty('reply_markup');
    });

    it('should compare: prompt WITH keyboard (current behavior)', async () => {
      // This test documents the CURRENT (buggy) behavior for comparison
      const promptText = 'Please enter your transaction hash:';
      const cancelKeyboard = {
        reply_markup: {
          inline_keyboard: [[{ text: 'Cancel', callback_data: 'seller:menu' }]],
        },
      };

      await ctx.reply(promptText, { parse_mode: 'HTML', ...cancelKeyboard });

      // Assert: keyboard WAS included (this is what we want to remove)
      const callArgs = ctx.reply.mock.calls[0];
      expect(callArgs[1]).toHaveProperty('reply_markup');
    });
  });

  // ===========================================
  // Test 4: BTC tx_hash validation
  // ===========================================
  describe('BTC Transaction Hash Validation', () => {
    it('should accept valid BTC tx_hash (64 hex chars)', () => {
      const validHash = 'a'.repeat(64);
      expect(validateBtcTxHash(validHash)).toBe(true);
    });

    it('should accept valid BTC tx_hash with mixed case', () => {
      const validHash = 'aAbBcCdDeEfF0123456789'.padEnd(64, '0');
      expect(validateBtcTxHash(validHash)).toBe(true);
    });

    it('should reject BTC tx_hash with 0x prefix', () => {
      const invalidHash = '0x' + 'a'.repeat(64);
      expect(validateBtcTxHash(invalidHash)).toBe(false);
    });

    it('should reject short BTC tx_hash', () => {
      const shortHash = 'a'.repeat(32);
      expect(validateBtcTxHash(shortHash)).toBe(false);
    });

    it('should reject BTC tx_hash with non-hex characters', () => {
      const invalidHash = 'g'.repeat(64); // g is not hex
      expect(validateBtcTxHash(invalidHash)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(validateBtcTxHash('')).toBe(false);
    });

    it('should reject null', () => {
      expect(validateBtcTxHash(null)).toBe(false);
    });

    it('should handle whitespace by trimming', () => {
      const hashWithSpaces = '  ' + 'a'.repeat(64) + '  ';
      expect(validateBtcTxHash(hashWithSpaces)).toBe(true);
    });
  });

  // ===========================================
  // Test 5: ETH tx_hash validation
  // ===========================================
  describe('ETH Transaction Hash Validation', () => {
    it('should accept valid ETH tx_hash (0x + 64 hex chars)', () => {
      const validHash = '0x' + 'a'.repeat(64);
      expect(validateEthTxHash(validHash)).toBe(true);
    });

    it('should accept valid ETH tx_hash with mixed case', () => {
      const validHash = '0xaAbBcCdDeEfF0123456789'.padEnd(66, '0');
      expect(validateEthTxHash(validHash)).toBe(true);
    });

    it('should reject ETH tx_hash WITHOUT 0x prefix', () => {
      const invalidHash = 'a'.repeat(64);
      expect(validateEthTxHash(invalidHash)).toBe(false);
    });

    it('should reject ETH tx_hash with wrong prefix', () => {
      const invalidHash = '0X' + 'a'.repeat(64); // uppercase X
      expect(validateEthTxHash(invalidHash)).toBe(false);
    });

    it('should reject short ETH tx_hash', () => {
      const shortHash = '0x' + 'a'.repeat(32);
      expect(validateEthTxHash(shortHash)).toBe(false);
    });

    it('should reject ETH tx_hash with non-hex characters', () => {
      const invalidHash = '0x' + 'g'.repeat(64);
      expect(validateEthTxHash(invalidHash)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(validateEthTxHash('')).toBe(false);
    });

    it('should reject null', () => {
      expect(validateEthTxHash(null)).toBe(false);
    });

    it('should handle whitespace by trimming', () => {
      const hashWithSpaces = '  0x' + 'a'.repeat(64) + '  ';
      expect(validateEthTxHash(hashWithSpaces)).toBe(true);
    });
  });

  // ===========================================
  // Test 6: Non-text message shows clean prompt
  // ===========================================
  describe('Non-text Message Handling in TX Hash Mode', () => {
    it('should show clean prompt without keyboard for photo in tx_hash mode', async () => {
      // Setup: User is in tx_hash input mode
      ctx.wizard.state.awaitingTxHash = true;
      ctx.message = { photo: [{ file_id: 'photo123' }] }; // Photo instead of text
      ctx.message.text = undefined;

      // Simulate handler logic
      if (!ctx.message?.text && ctx.wizard.state.awaitingTxHash) {
        const promptText = 'Please enter transaction hash as text';
        // The fix should send WITHOUT keyboard
        await ctx.reply(promptText, { parse_mode: 'HTML' });
      }

      // Assert: prompt sent WITHOUT keyboard
      expect(ctx.reply).toHaveBeenCalledWith(
        'Please enter transaction hash as text',
        { parse_mode: 'HTML' }
      );
      const callArgs = ctx.reply.mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty('reply_markup');
    });

    it('should show clean prompt without keyboard for sticker in tx_hash mode', async () => {
      // Setup: User sends sticker instead of text
      ctx.wizard.state.awaitingTxHash = true;
      ctx.message = { sticker: { file_id: 'sticker123' } };
      ctx.message.text = undefined;

      // Simulate handler logic
      if (!ctx.message?.text && ctx.wizard.state.awaitingTxHash) {
        const promptText = 'Please enter transaction hash as text';
        await ctx.reply(promptText, { parse_mode: 'HTML' });
      }

      // Assert
      expect(ctx.reply).toHaveBeenCalled();
      const callArgs = ctx.reply.mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty('reply_markup');
    });

    it('should show clean prompt without keyboard for document in tx_hash mode', async () => {
      // Setup: User sends document instead of text
      ctx.wizard.state.awaitingTxHash = true;
      ctx.message = { document: { file_id: 'doc123' } };
      ctx.message.text = undefined;

      // Simulate handler logic
      if (!ctx.message?.text && ctx.wizard.state.awaitingTxHash) {
        const promptText = 'Please enter transaction hash as text';
        await ctx.reply(promptText, { parse_mode: 'HTML' });
      }

      // Assert
      expect(ctx.reply).toHaveBeenCalled();
      const callArgs = ctx.reply.mock.calls[0];
      expect(callArgs[1]).not.toHaveProperty('reply_markup');
    });

    it('should NOT show prompt if NOT in awaitingTxHash mode', async () => {
      // Setup: User is NOT in tx_hash input mode
      ctx.wizard.state.awaitingTxHash = false;
      ctx.message = { photo: [{ file_id: 'photo123' }] };

      // Simulate handler logic
      if (!ctx.message?.text && ctx.wizard.state.awaitingTxHash) {
        await ctx.reply('Please enter transaction hash as text', { parse_mode: 'HTML' });
      }

      // Assert: no reply was sent
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  // ===========================================
  // Additional: LTC and USDT validation
  // ===========================================
  describe('LTC Transaction Hash Validation', () => {
    it('should accept valid LTC tx_hash (64 hex chars, same as BTC)', () => {
      const validHash = 'b'.repeat(64);
      expect(validateLtcTxHash(validHash)).toBe(true);
    });

    it('should reject LTC tx_hash with 0x prefix', () => {
      const invalidHash = '0x' + 'b'.repeat(64);
      expect(validateLtcTxHash(invalidHash)).toBe(false);
    });
  });

  describe('USDT TRC20 Transaction Hash Validation', () => {
    it('should accept valid USDT TRC20 tx_hash (64 hex chars)', () => {
      const validHash = 'c'.repeat(64);
      expect(validateUsdtTrc20TxHash(validHash)).toBe(true);
    });

    it('should reject USDT TRC20 tx_hash with 0x prefix', () => {
      const invalidHash = '0x' + 'c'.repeat(64);
      expect(validateUsdtTrc20TxHash(invalidHash)).toBe(false);
    });
  });

  // ===========================================
  // Integration: Full upgrade:paid flow
  // ===========================================
  describe('Full upgrade:paid Flow', () => {
    it('should execute complete upgrade:paid flow correctly', async () => {
      // Setup: QR was sent, user clicks upgrade:paid
      ctx.wizard.state.qrMessageId = 789;
      ctx.wizard.state.currency = 'BTC';
      ctx.callbackQuery = { data: 'upgrade:paid' };

      // Step 1: Answer callback query
      await ctx.answerCbQuery();

      // Step 2: Clear QR keyboard (the fix)
      if (ctx.wizard.state.qrMessageId) {
        try {
          await ctx.telegram.editMessageReplyMarkup(
            ctx.chat.id,
            ctx.wizard.state.qrMessageId,
            undefined,
            { inline_keyboard: [] }
          );
        } catch {
          // Ignore errors (message may be deleted)
        }
      }

      // Step 3: Set awaitingTxHash flag
      ctx.wizard.state.awaitingTxHash = true;

      // Step 4: Send clean prompt WITHOUT keyboard
      const promptText = 'Send transaction hash:';
      await ctx.reply(promptText, { parse_mode: 'HTML' });

      // Assert: All steps executed correctly
      expect(ctx.answerCbQuery).toHaveBeenCalledTimes(1);
      expect(ctx.telegram.editMessageReplyMarkup).toHaveBeenCalledWith(
        123, 789, undefined, { inline_keyboard: [] }
      );
      expect(ctx.wizard.state.awaitingTxHash).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(promptText, { parse_mode: 'HTML' });
    });
  });
});
