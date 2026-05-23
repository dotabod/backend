import { defineConfig } from 'vite-plus'

export default defineConfig({
  staged: {
    '*.{js,jsx,ts,tsx,mjs,cjs}': 'vp check --fix',
  },
  pack: {
    outExtensions: () => ({ js: '.js' }),
  },
  fmt: {
    singleQuote: true,
    semi: false,
    useTabs: false,
  },
  lint: {
    plugins: ['typescript', 'unicorn', 'oxc'],
    categories: {
      correctness: 'error',
    },
    options: {
      reportUnusedDisableDirectives: 'error',
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'vite-plus/prefer-vite-plus-imports': 'error',
    },
    env: {
      builtin: true,
    },
    overrides: [
      {
        files: [
          '**/__tests__/**',
          '**/*.test.ts',
          '**/tests/**',
          '**/setupMocks.ts',
          '**/sharedMocks.ts',
        ],
        rules: {
          'unicorn/no-thenable': 'off',
        },
      },
    ],
    jsPlugins: [
      {
        name: 'vite-plus',
        specifier: 'vite-plus/oxlint-plugin',
      },
    ],
  },
})
