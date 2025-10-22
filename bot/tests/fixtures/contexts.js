/**
 * Mock Telegraf Context Factory
 *
 * Creates properly structured mock contexts with getters
 * that match real Telegraf behavior
 */

import { jest } from '@jest/globals';

/**
 * Create a mock Telegraf context
 * @param {Object} overrides - Override default properties
 * @returns {Object} Mock context
 */
export function createMockContext(overrides = {}) {
  const baseContext = {
    // User info (getter simulation)
    from: overrides.from || {
      id: 123456,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User'
    },

    // Chat info (getter simulation)
    chat: overrides.chat || {
      id: 123456,
      type: 'private'
    },

    // Message
    message: overrides.message || null,

    // Callback query
    callbackQuery: overrides.callbackQuery || null,

    // Session
    session: {
      userId: 123456,
      token: null,
      shopId: null,
      shopName: null,
      role: null,
      ...overrides.session
    },

    // Wizard
    wizard: {
      state: {},
      next: jest.fn(),
      back: jest.fn(),
      selectStep: jest.fn(),
      ...overrides.wizard
    },

    // Scene
    scene: {
      enter: jest.fn(),
      leave: jest.fn().mockResolvedValue(undefined),
      ...overrides.scene
    },

    // Methods
    reply: jest.fn().mockResolvedValue({ message_id: 123 }),
    editMessageText: jest.fn().mockResolvedValue({ message_id: 123 }),
    editMessageReplyMarkup: jest.fn().mockResolvedValue({ message_id: 123 }),
    answerCbQuery: jest.fn().mockResolvedValue(true),
    deleteMessage: jest.fn().mockResolvedValue(true),
    sendMessage: jest.fn().mockResolvedValue({ message_id: 124 }),

    // Update
    update: overrides.update || {},

    // Additional overrides
    ...overrides
  };

  return baseContext;
}

/**
 * Create mock context with text message
 */
export function createTextMessageContext(text, overrides = {}) {
  return createMockContext({
    message: { text },
    ...overrides
  });
}

/**
 * Create mock context with callback query
 */
export function createCallbackContext(data, overrides = {}) {
  return createMockContext({
    callbackQuery: { data },
    ...overrides
  });
}

/**
 * Create mock context with session
 */
export function createAuthedContext(sessionData = {}, overrides = {}) {
  return createMockContext({
    session: {
      userId: 123456,
      token: 'mock-jwt-token',
      ...sessionData
    },
    ...overrides
  });
}
