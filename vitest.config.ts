import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ripcord/types': path.resolve(__dirname, 'packages/shared-types/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'apps/**/src/**/*.test.ts',
      'packages/**/src/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
  },
});
