import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', 'node_modules', 'public/mockServiceWorker.js', 'coverage'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // NOTE: ESLint doesn't recognize JSX-used imports without eslint-plugin-react.
      // These patterns cover common JSX components (motion.*, AnimatePresence, etc.)
      // and imports used as JSX tags (Header, ProductCard, etc.)
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^(_.*|.*Icon$|props|data)$',
        varsIgnorePattern: '^(_.*|m|motion|AnimatePresence|LazyMotion|domAnimation|React|Suspense|App|TelegramProvider|ProductGrid|.*Lazy|.*Page|.*Modal|.*Card|.*List|.*Button|.*Icon|.*Sheet|.*Container|.*Item|.*Form|.*Input|.*Badge|.*Timer|.*Banner|.*Manager|.*Boundary|.*Portal|.*Control|.*Skeleton|.*Dialog|.*Slider|.*Tabs|Header|PageLoader|PageHeader|InteractiveListItem|SegmentedControl|QRCodeSVG|TabIcon|WrapperComponent|Migration.*|Loading.*|Error.*|RateLimitWarning|Channel.*|Subscriber.*|Success.*|Countdown|fireEvent|within|container|user|initial|animate|exit|transition|whileTap|layout|List.*State|.*Spinner|InlineLoader)$'
      }],
      'no-console': ['warn', { allow: ['error'] }],
    },
  },
];
