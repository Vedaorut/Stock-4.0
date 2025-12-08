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
        ...globals.jest,
      },
    },
    rules: {
      // Base rules
      'no-console': 'off',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',

      // P0 BAN: Prevent delete ctx.session.__scenes (breaks scene transitions)
      // See: BUGHUNT audit - causes race condition when leave() followed by enter()
      'no-restricted-syntax': [
        'error',
        {
          selector: 'UnaryExpression[operator="delete"][argument.property.name="__scenes"]',
          message: 'Do not delete ctx.session.__scenes - it breaks scene transitions. Use ctx.scene.leave() instead.',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.js', '**/*.test.js'],
    rules: {
      'no-unused-expressions': 'off',
    },
  },
];
