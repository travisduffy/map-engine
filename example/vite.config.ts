import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so built asset references resolve under any subpath
  // deployment (e.g. GH Pages project sites like /user.github.io/repo/),
  // not just domain-root static hosting (Epic 4 Task 4.4).
  base: './',
  resolve: {
    alias: {
      'map-engine': new URL('../src/index.ts', import.meta.url).pathname,
    },
  },
  plugins: [],
})
