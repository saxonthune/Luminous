import { defineConfig, lazyPlugins } from "vite-plus";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: lazyPlugins(() => [solidPlugin()]),
});
