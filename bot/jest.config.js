export default {
  // Use node environment for testing
  testEnvironment: 'node',
  
  // Transform files (ESM support)
  transform: {},
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json'],
  
  // Map external ESM packages that need manual mocks
  moduleNameMapper: {
    '^openai$': '<rootDir>/tests/mocks/openai.js'
  },
  
  // Test match patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js'
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Test timeout
  testTimeout: 10000,
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/bot.js', // Exclude main entry point
    '!**/node_modules/**'
  ],
  
  // Coverage thresholds (realistic for Telegram bots: 50-60%)
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks between tests
  restoreMocks: true
};
