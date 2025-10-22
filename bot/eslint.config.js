import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      // Base rules
      'no-console': 'off',
      'no-unused-vars': ['error', {
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_'
      }],
      'eqeqeq': ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },
  {
    files: ['tests/**/*.js', '**/*.test.js'],
    rules: {
      'no-unused-expressions': 'off'
    }
  }
];
