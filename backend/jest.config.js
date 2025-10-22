export default {
  // Test environment
  testEnvironment: 'node',

  // Setup files (env-setup.js runs FIRST to set NODE_ENV='test')
  setupFiles: ['<rootDir>/__tests__/env-setup.js'],

  // Coverage settings
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js', // Exclude server entry point
    '!src/config/database.js', // Exclude DB config (tested via integration)
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],

  // Module settings
  transform: {},

  // Setup files (runs after imports)
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],

  // Timeout
  testTimeout: 10000,

  // Verbose output
  verbose: true,

  // Run tests serially to avoid database race conditions
  maxWorkers: 1,
};
