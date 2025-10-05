/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { node: true, es2023: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['import', 'n', 'promise', 'security', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:import/recommended',
    'plugin:n/recommended',
    'plugin:promise/recommended',
    'plugin:security/recommended',
    'plugin:prettier/recommended',
  ],
  rules: {
    'prettier/prettier': ['error'],
    'import/no-unresolved': 'off', // ESM paths ok
    'n/no-missing-import': 'off',
    'n/no-unsupported-features/es-syntax': 'off',
    'security/detect-object-injection': 'off', // noisy for API payloads; we validate with Ajv
  },
  ignorePatterns: ['dist/', 'node_modules/'],
};
