import { defineConfig } from 'vite-plus';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  test: { environment: 'jsdom', include: ['tests/**/*.test.tsx'] },
});
