import { defineConfig } from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  define: {
    __GITHUB_PAGES__: 'false',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'src/__tests__/**/*.test.tsx',
      'src/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.tsx',
    ],
    exclude: ['node_modules', 'dist', 'e2e'],
    server: {
      deps: {
        // @kobalte/core ships .jsx files that Vitest can't load without Vite transforms
        // @kobalte/core and its peer deps distribute .jsx files that Node can't load directly
        inline: [/@kobalte\//, /solid-prevent-scroll/, /@corvu\//, /solid-presence/],
      },
    },
  },
});
