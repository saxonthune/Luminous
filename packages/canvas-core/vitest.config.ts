import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    pool: 'forks',
    poolOptions: {
      forks: { maxForks: 2, minForks: 1, execArgv: ['--max-old-space-size=512'] },
    },
  },
});
