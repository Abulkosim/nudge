import base from '../../eslint.config.mjs';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';

export default [
  ...base,
  {
    files: ['src/**/*.{ts,tsx}'],
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
    files: ['src/telegram/**/*.{ts,tsx}'],
    // The adapter is the only boundary allowed to import the Telegram SDK.
    rules: { 'no-restricted-imports': 'off' },
  },
];
