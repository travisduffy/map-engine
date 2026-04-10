import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      'map-engine': new URL('../src/index.ts', import.meta.url).pathname,
    },
  },
})
