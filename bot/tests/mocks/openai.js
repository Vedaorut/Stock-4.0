import { jest } from '@jest/globals';

// Jest manual mock for the OpenAI SDK used in integration tests.
const OpenAI = jest.fn();

export default OpenAI;
