import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  outDir: 'dist',
  dts: false,
  clean: true,
  noExternal: ['@luminous/core'],
})
