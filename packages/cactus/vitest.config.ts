import { defineConfig } from "vite-plus";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  pool: "forks",
  poolOptions: {
    forks: { maxForks: 2, minForks: 1, execArgv: ["--max-old-space-size=512"] },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["node_modules", "dist"],
  },
});
