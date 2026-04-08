import { defineConfig, type Plugin } from 'vite'

/** Serves a real HTTP 404 for /test/__404__ so browser-mode tests can exercise the r.ok guard. */
function test404Plugin(): Plugin {
  return {
    name: 'test-404',
    configureServer(server) {
      server.middlewares.use('/test/__404__', (_req, res) => {
        res.statusCode = 404
        res.setHeader('Content-Type', 'text/plain')
        res.end('Not Found')
      })
    },
  }
}

export default defineConfig({
  plugins: [test404Plugin()],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['three'],
    },
  },
  test: {
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [{ browser: 'chromium' }],
    },
  },
})
