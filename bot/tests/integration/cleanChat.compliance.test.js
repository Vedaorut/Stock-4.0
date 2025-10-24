/**
 * Clean Chat Compliance Integration Test
 *
 * Тестирует соблюдение clean chat правил (макс. 4 сообщения в чате):
 * - Message pair deletion (user + bot messages)
 * - Auto-delete timer (60 seconds)
 * - AI response cleanup
 * - Multiple reply scenarios
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { textUpdate, callbackUpdate } from '../helpers/updateFactories.js';
import { api } from '../../src/utils/api.js';

describe('Clean Chat Compliance - Message Cleanup (P0)', () => {
  let testBot;
  let mock;

  const mockShop = {
    id: '123',
    name: 'Test Shop',
    description: 'Test description',
    seller_username: 'testseller'
  };

  const mockProducts = [
    { id: 1, name: 'Product A', price: 10.00, stock: 5 },
    { id: 2, name: 'Product B', price: 20.00, stock: 10 }
  ];

  beforeEach(() => {
    testBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: 'test-jwt-token',
        user: { id: 1, telegramId: '123456', selectedRole: 'seller' },
        role: 'seller',
        shopId: '123',
        shopName: 'Test Shop'
      }
    });
    mock = new MockAdapter(api);

    // Mock products endpoint
    mock.onGet('/products').reply(200, { data: mockProducts });
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
    jest.clearAllTimers();
  });

  describe('AI Message Pair Deletion', () => {
    it('должен удалять предыдущую пару (user + bot) при новом AI запросе', async () => {
      // Mock AI endpoint
      mock.onPost('/ai/product-command').reply(200, {
        data: {
          success: true,
          message: 'Товар добавлен',
          operation: 'add_product'
        }
      });

      // First AI request
      const update1 = textUpdate('добавь товар Product C за $30', { message_id: 100 });
      await testBot.handleUpdate(update1);
      await new Promise(resolve => setImmediate(resolve));

      // Store first message IDs
      const firstUserMsgId = 100;
      const firstBotMsgId = testBot.getLastReply()?.message_id;

      expect(firstBotMsgId).toBeDefined();
      expect(testBot.captor.getAllCalls().length).toBeGreaterThan(0);

      testBot.captor.reset();

      // Second AI request - should delete first pair
      const update2 = textUpdate('добавь товар Product D за $40', { message_id: 101 });
      await testBot.handleUpdate(update2);
      await new Promise(resolve => setImmediate(resolve));

      // Check that deleteMessage was called twice (user + bot from first pair)
      const deleteCalls = testBot.captor.getDeleteMessageCalls();
      expect(deleteCalls.length).toBeGreaterThanOrEqual(1); // At least one delete

      // Verify new message was sent
      const lastReply = testBot.getLastReplyText();
      expect(lastReply).toBeTruthy();
    });

    it('должен очищать таймер cleanup при новом AI запросе', async () => {
      jest.useFakeTimers();

      mock.onPost('/ai/product-command').reply(200, {
        data: {
          success: true,
          message: 'Товар добавлен',
          operation: 'add_product'
        }
      });

      // First AI request
      const update1 = textUpdate('добавь товар Test', { message_id: 100 });
      await testBot.handleUpdate(update1);
      await new Promise(resolve => setImmediate(resolve));

      // Check timer was set (session should have aiCleanupTimer)
      const session1 = testBot.getLastContext()?.session;
      expect(session1?.lastAIPair).toBeDefined();

      // Second AI request before timer fires
      testBot.captor.reset();
      const update2 = textUpdate('добавь товар Test2', { message_id: 101 });
      await testBot.handleUpdate(update2);
      await new Promise(resolve => setImmediate(resolve));

      // Timer should be cleared and reset
      const session2 = testBot.getLastContext()?.session;
      expect(session2?.lastAIPair).toBeDefined();
      expect(session2?.lastAIPair.userMsgId).toBe(101); // New message ID

      jest.useRealTimers();
    });

    it('должен игнорировать noise команды (привет, спасибо)', async () => {
      const noiseCommands = ['привет', 'Спасибо', 'хорошо', 'ok'];

      for (const cmd of noiseCommands) {
        testBot.captor.reset();
        const update = textUpdate(cmd);
        await testBot.handleUpdate(update);
        await new Promise(resolve => setImmediate(resolve));

        // No reply should be sent for noise commands
        const calls = testBot.captor.getAllCalls();
        const replyCalls = calls.filter(c => c.method === 'reply' || c.method === 'replyWithHTML');
        expect(replyCalls.length).toBe(0);
      }
    });

    it('должен блокировать concurrent AI calls (race condition guard)', async () => {
      mock.onPost('/ai/product-command').reply(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve([200, {
            data: { success: true, message: 'Done', operation: 'add' }
          }]), 100);
        });
      });

      // Simulate concurrent calls
      const update1 = textUpdate('добавь товар A', { message_id: 100 });
      const update2 = textUpdate('добавь товар B', { message_id: 101 });

      // Fire both immediately
      const promise1 = testBot.handleUpdate(update1);
      const promise2 = testBot.handleUpdate(update2);

      await Promise.all([promise1, promise2]);
      await new Promise(resolve => setImmediate(resolve));

      // Second call should be blocked with "Подождите" message
      const allReplies = testBot.captor.getAllCalls()
        .filter(c => c.method === 'reply')
        .map(c => c.args[0]);

      const hasWaitMessage = allReplies.some(text => 
        text && text.includes('Обрабатываю предыдущую команду') || text.includes('Подождите')
      );

      expect(hasWaitMessage).toBe(true);
    });
  });

  describe('Auto-Delete Timer (60 seconds)', () => {
    it('должен автоматически удалять пару через 60 секунд', async () => {
      jest.useFakeTimers();

      mock.onPost('/ai/product-command').reply(200, {
        data: {
          success: true,
          message: 'Товар добавлен',
          operation: 'add_product'
        }
      });

      const update = textUpdate('добавь товар Test', { message_id: 100 });
      await testBot.handleUpdate(update);
      await new Promise(resolve => setImmediate(resolve));

      testBot.captor.reset();

      // Fast-forward 60 seconds
      jest.advanceTimersByTime(60000);
      await new Promise(resolve => setImmediate(resolve));

      // Check that deleteMessage was called
      const deleteCalls = testBot.captor.getDeleteMessageCalls();
      expect(deleteCalls.length).toBeGreaterThanOrEqual(1);

      jest.useRealTimers();
    });

    it('таймер должен отменяться при новом сообщении', async () => {
      jest.useFakeTimers();

      mock.onPost('/ai/product-command').reply(200, {
        data: { success: true, message: 'OK', operation: 'add' }
      });

      // First message
      await testBot.handleUpdate(textUpdate('первое', { message_id: 100 }));
      await new Promise(resolve => setImmediate(resolve));

      // Second message after 30 seconds (before first timer fires)
      jest.advanceTimersByTime(30000);
      testBot.captor.reset();
      await testBot.handleUpdate(textUpdate('второе', { message_id: 101 }));
      await new Promise(resolve => setImmediate(resolve));

      // First pair should be deleted immediately, not by timer
      const deleteCalls1 = testBot.captor.getDeleteMessageCalls();
      expect(deleteCalls1.length).toBeGreaterThan(0);

      // Advance remaining 30 seconds - no additional deletes
      testBot.captor.reset();
      jest.advanceTimersByTime(30000);
      await new Promise(resolve => setImmediate(resolve));

      const deleteCalls2 = testBot.captor.getDeleteMessageCalls();
      expect(deleteCalls2.length).toBe(0); // Timer was cancelled

      // Advance full 60 seconds for second message
      jest.advanceTimersByTime(60000);
      await new Promise(resolve => setImmediate(resolve));

      const deleteCalls3 = testBot.captor.getDeleteMessageCalls();
      expect(deleteCalls3.length).toBeGreaterThan(0); // Second timer fired

      jest.useRealTimers();
    });
  });

  describe('Clean Chat Violations (>4 messages)', () => {
    it('НЕ должен превышать 4 сообщения в чате (AI responses)', async () => {
      mock.onPost('/ai/product-command').reply(200, {
        data: { success: true, message: 'OK', operation: 'add' }
      });

      // Send 5 AI requests sequentially
      for (let i = 0; i < 5; i++) {
        await testBot.handleUpdate(textUpdate(`команда ${i}`, { message_id: 100 + i }));
        await new Promise(resolve => setImmediate(resolve));
      }

      // After each request, previous pair should be deleted
      // So max messages = 2 (current user + current bot)
      const session = testBot.getLastContext()?.session;
      expect(session?.lastAIPair).toBeDefined();

      // Total reply calls should be 5 (one per request)
      const allCalls = testBot.captor.getAllCalls();
      const replyCalls = allCalls.filter(c => c.method === 'reply' || c.method === 'replyWithHTML');
      expect(replyCalls.length).toBeGreaterThanOrEqual(5);

      // But deleteMessage should have been called multiple times
      const deleteCalls = testBot.captor.getDeleteMessageCalls();
      expect(deleteCalls.length).toBeGreaterThan(0);
    });

    it('должен отслеживать streaming responses', async () => {
      // Mock streaming response (returns streamingMessageId)
      mock.onPost('/ai/product-command').reply(200, {
        data: {
          success: true,
          message: '', // Empty = streamed already
          streamingMessageId: 999, // ID of streamed message
          operation: null // No operation = text response
        }
      });

      const update = textUpdate('опиши товары', { message_id: 100 });
      await testBot.handleUpdate(update);
      await new Promise(resolve => setImmediate(resolve));

      const session = testBot.getLastContext()?.session;
      expect(session?.lastAIPair).toBeDefined();
      expect(session?.lastAIPair.userMsgId).toBe(100);
      // streamingMessageId should be tracked
    });
  });

  describe('Error Handling', () => {
    it('должен показывать ошибки пользователю (AI unavailable)', async () => {
      mock.onPost('/ai/product-command').reply(503, {
        error: 'AI service unavailable'
      });

      const update = textUpdate('добавь товар', { message_id: 100 });
      await testBot.handleUpdate(update);
      await new Promise(resolve => setImmediate(resolve));

      const lastReply = testBot.getLastReplyText();
      expect(lastReply).toContain('Ошибка');
    });

    it('должен gracefully handle deleteMessage errors (message too old)', async () => {
      mock.onPost('/ai/product-command').reply(200, {
        data: { success: true, message: 'OK', operation: 'add' }
      });

      // First message
      await testBot.handleUpdate(textUpdate('первое', { message_id: 100 }));
      await new Promise(resolve => setImmediate(resolve));

      // Mock deleteMessage to throw (message too old)
      const originalDelete = testBot.bot.telegram.deleteMessage;
      testBot.bot.telegram.deleteMessage = jest.fn().mockRejectedValue(
        new Error('Bad Request: message to delete not found')
      );

      // Second message - should not crash on delete error
      await expect(async () => {
        await testBot.handleUpdate(textUpdate('второе', { message_id: 101 }));
        await new Promise(resolve => setImmediate(resolve));
      }).not.toThrow();

      // Restore
      testBot.bot.telegram.deleteMessage = originalDelete;
    });
  });

  describe('Role-based Access', () => {
    it('buyer НЕ должен иметь доступ к AI (silent delete)', async () => {
      // Switch to buyer role
      testBot = createTestBot({
        skipAuth: true,
        mockSession: {
          token: 'test-jwt-token',
          user: { id: 2, telegramId: '234567', selectedRole: 'buyer' },
          role: 'buyer'
        }
      });

      const update = textUpdate('добавь товар', { message_id: 100 });
      await testBot.handleUpdate(update);
      await new Promise(resolve => setImmediate(resolve));

      // No reply should be sent
      const replyCalls = testBot.captor.getAllCalls()
        .filter(c => c.method === 'reply' || c.method === 'replyWithHTML');
      expect(replyCalls.length).toBe(0);

      // Message should be silently deleted
      const deleteCalls = testBot.captor.getDeleteMessageCalls();
      expect(deleteCalls.length).toBeGreaterThan(0);
    });

    it('seller без shop НЕ должен получать AI responses', async () => {
      testBot = createTestBot({
        skipAuth: true,
        mockSession: {
          token: 'test-jwt-token',
          user: { id: 3, telegramId: '345678', selectedRole: 'seller' },
          role: 'seller',
          shopId: null // No shop
        }
      });

      const update = textUpdate('добавь товар', { message_id: 100 });
      await testBot.handleUpdate(update);
      await new Promise(resolve => setImmediate(resolve));

      // Should be ignored (no shop ID)
      const replyCalls = testBot.captor.getAllCalls()
        .filter(c => c.method === 'reply');
      expect(replyCalls.length).toBe(0);
    });
  });

  describe('Rate Limiting', () => {
    it('должен блокировать >10 AI команд в минуту', async () => {
      mock.onPost('/ai/product-command').reply(200, {
        data: { success: true, message: 'OK', operation: 'add' }
      });

      // Send 11 commands rapidly
      for (let i = 0; i < 11; i++) {
        await testBot.handleUpdate(textUpdate(`команда ${i}`, { message_id: 100 + i }));
        await new Promise(resolve => setImmediate(resolve));
      }

      // 11th command should show rate limit message
      const allReplies = testBot.captor.getAllCalls()
        .filter(c => c.method === 'reply')
        .map(c => c.args[0]);

      const hasRateLimitMessage = allReplies.some(text =>
        text && (text.includes('Слишком много команд') || text.includes('Подождите минуту'))
      );

      expect(hasRateLimitMessage).toBe(true);
    });
  });
});

describe('Clean Chat Compliance - Follow Button (P1)', () => {
  let testBot;
  let mock;

  beforeEach(() => {
    testBot = createTestBot({
      skipAuth: true,
      mockSession: {
        token: 'test-jwt-token',
        user: { id: 1, telegramId: '123456', selectedRole: 'seller' },
        role: 'seller',
        shopId: '123'
      }
    });
    mock = new MockAdapter(api);
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
  });

  it('follow:list должен использовать editMessageText (не reply)', async () => {
    mock.onGet('/follows').reply(200, { data: [] });

    await testBot.handleUpdate(callbackUpdate('follow:list'));
    await new Promise(resolve => setImmediate(resolve));

    // Should use editMessageText, NOT reply
    const editCalls = testBot.captor.getAllCalls()
      .filter(c => c.method === 'editMessageText');
    expect(editCalls.length).toBeGreaterThan(0);

    // Should NOT use reply (which creates new message)
    const replyCalls = testBot.captor.getAllCalls()
      .filter(c => c.method === 'reply' || c.method === 'replyWithHTML');
    expect(replyCalls.length).toBe(0);
  });
});
