import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

const exclude = ['node_modules/**', 'features/_template/**', 'tests/e2e/**', 'dist/**'];

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'core/**/*.test.ts',
            'contracts/**/*.test.ts',
            'features/*/tests/unit/**/*.test.ts',
            'features/*/tests/*.unit.test.ts',
            'tests/architecture/**/*.test.ts',
            'tests/smoke/**/*.test.ts',
          ],
          exclude,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: [
            'features/*/tests/integration/**/*.test.ts',
            'features/*/tests/*.integration.test.ts',
            'tests/integration/**/*.test.ts',
          ],
          exclude,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['core/**/*.ts', 'features/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        'core/testing/**',
        'features/_template/**',
        'core/feature-registry/registry.generated.ts',
        '**/*.d.ts',
      ],
      // Modest on purpose: raise per feature in Stage 2 once real code exists.
      thresholds: { lines: 50, functions: 50, branches: 40, statements: 50 },
    },
  },
});
