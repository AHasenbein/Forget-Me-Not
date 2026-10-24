import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// e2e: boots the real API over HTTP. Runs on push to main + manually, not on every PR.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['tests/e2e/**/*.e2e.test.ts', 'features/*/tests/e2e/**/*.test.ts'],
    exclude: ['features/_template/**', 'node_modules/**'],
    passWithNoTests: true,
    testTimeout: 20_000,
  },
});
