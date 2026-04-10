import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/Luminous/' : '/',
  plugins: [solidPlugin(), tailwindcss()],
  server: {
    port: 5200,
    proxy: {
      '/api': 'http://localhost:4080',
      '/ws': { target: 'http://localhost:4080', ws: true },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        viewer: resolve(__dirname, 'viewer.html'),
      },
    },
  },
})
