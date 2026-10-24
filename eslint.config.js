import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Boundary rule (cheap first line of defence; tests/architecture/boundary.test.ts is the real guard):
// features may not use the @features alias at all, and core/contracts may never import features.
const noFeatureAlias = {
  patterns: [
    {
      group: ['@features/*', '@features/**'],
      message:
        'Features must not import other features. Use the event bus or a contract in contracts/.',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      'dist',
      'coverage',
      '.expo',
      'core/feature-registry/registry.generated.ts',
      'core/feature-registry/ui-registry.generated.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }], // use core/logging (it redacts PII)
    },
  },
  {
    files: ['features/**/*.{ts,tsx}', 'contracts/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', noFeatureAlias] },
  },
  {
    files: ['core/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', noFeatureAlias] },
  },
  { files: ['scripts/**', 'tests/**', '**/*.test.ts'], rules: { 'no-console': 'off' } },
);
