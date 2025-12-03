/**
 * /start Flow Integration Test
 *
 * Basic test for /start command
 * Note: Role memory tests require E2E testing with real backend
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { createTestBot } from '../helpers/testBot.js';
import { commandUpdate } from '../helpers/updateFactories.js';
import { api } from '../../src/utils/api.js';

describe('/start Flow', () => {
  let testBot;
  let mock;

  beforeEach(() => {
    testBot = createTestBot({ skipAuth: true });
    mock = new MockAdapter(api);
  });

  afterEach(() => {
    testBot.reset();
    mock.reset();
  });

  it('/start shows language selection for new user', async () => {
    await testBot.handleUpdate(commandUpdate('start'));

    const lastText = testBot.getLastReplyText();
    // New users see language selection first
    // Language selection shows bilingual or single language based on settings
    expect(lastText.toLowerCase()).toMatch(/choose|выберите|language|язык/i);
  });
});
