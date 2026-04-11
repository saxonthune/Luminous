import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'))

let gitCommit = 'unknown'
try {
  gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
} catch {
  // not a git repo or git not available
}

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/Luminous/' : '/',
  plugins: [solidPlugin(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_COMMIT__: JSON.stringify(gitCommit),
    __GITHUB_PAGES__: JSON.stringify(!!process.env.GITHUB_PAGES),
  },
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
