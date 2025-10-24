import { jest } from '@jest/globals';

// Manual mock for the OpenAI SDK used in integration tests.
// Provides a jest.fn() constructor so tests can override implementations.
const OpenAI = jest.fn();

export default OpenAI;
