import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 120_000,
  reporter: 'line',
  // These scripts build once and serve real static ports (not idempotent
  // under concurrent workers) — force single-worker, serial execution.
  workers: 1,
})
