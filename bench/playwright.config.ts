import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  // registry-alloc scans a 4096x4096 fixture several times per run; a single
  // scan is multi-second, and fixture generation precedes it.
  timeout: 600_000,
  reporter: 'line',
  // These scripts build once and serve real static ports (not idempotent
  // under concurrent workers) — force single-worker, serial execution.
  workers: 1,
})
