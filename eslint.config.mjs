import js from '@eslint/js';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'apps/server/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['apps/miniapp/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks, 'react-refresh': refresh },
    rules: {
      ...hooks.configs.recommended.rules,
      ...refresh.configs.vite.rules,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tma.js/*', '@telegram-apps/*'],
              message: 'Use the adapter in src/telegram.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/miniapp/src/components/ui/**/*.tsx'],
    // Generated shadcn components keep their variant helpers beside the component.
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['apps/miniapp/src/telegram/**/*.{ts,tsx}'],
    // The adapter is the only boundary allowed to import the Telegram SDK.
    rules: { 'no-restricted-imports': 'off' },
  },
];
