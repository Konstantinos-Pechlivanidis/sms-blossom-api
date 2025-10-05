/* ESLint v9 flat config */
import js from '@eslint/js';
import pluginImport from 'eslint-plugin-import';
import pluginN from 'eslint-plugin-n';
import pluginPromise from 'eslint-plugin-promise';
import pluginSecurity from 'eslint-plugin-security';
import pluginPrettier from 'eslint-plugin-prettier';

export default [
  // Ignore build outputs & deps
  { ignores: ['dist/**', 'node_modules/**'] },

  // Base config for all JS files
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        // Node.js globals
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        URL: 'readonly',
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        globalThis: 'readonly',
      },
    },
    plugins: {
      import: pluginImport,
      n: pluginN,
      promise: pluginPromise,
      security: pluginSecurity,
      prettier: pluginPrettier,
    },
    rules: {
      // Base recommended rules
      ...js.configs.recommended.rules,

      // Prettier as an ESLint rule (surfaced as errors)
      'prettier/prettier': 'error',

      // Node/ESM project ergonomics
      'import/no-unresolved': 'off',
      'n/no-missing-import': 'off',
      'n/no-unsupported-features/es-syntax': 'off',

      // We validate inputs with Ajv; this rule is too noisy for our API shapes
      'security/detect-object-injection': 'off',

      // Allow unused vars in catch blocks and function parameters
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Test files get additional globals
  {
    files: ['tests/**/*.js', '**/*.test.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
      },
    },
  },
];
