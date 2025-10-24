/**
 * Jest Setup File
 *
 * Runs before each test to clean up mocks and timers
 */

import { jest } from '@jest/globals';

// Provide a stable mock for the OpenAI SDK so tests can override behavior.
jest.mock('openai', () => {
  const mockConstructor = jest.fn();
  return { __esModule: true, default: mockConstructor };
});

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();

  // Clear all timers before each test
  jest.clearAllTimers();
});

afterEach(() => {
  // Restore all mocks after each test
  jest.restoreAllMocks();
});
