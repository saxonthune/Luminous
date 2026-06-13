import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['node_modules', 'dist'],
    environment: 'jsdom',
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 2, minForks: 1, execArgv: ['--max-old-space-size=512'] },
    },
  },
});
