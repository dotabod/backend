module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: 'airbnb-base',
  overrides: [],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    printWidth: 100,
    'import/extensions': 0,
    semi: ['error', 'never'],
    'linebreak-style': 0,
    'operator-linebreak': ['error', 'after'],
    'no-console': 'off',
  },
}
