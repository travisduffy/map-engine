---
paths:
  - 'test/**/*.ts'
---

## Test fixtures

Located at `test/fixtures/`. The `test-4x4.png` (4×4 pixel, 4 sectors) is generated programmatically via `test/fixtures/generate-fixtures.js` using `sharp`. Use absolute paths in browser-mode tests (e.g., `'/test/fixtures/test-4x4.png'`), not relative paths.

## Perf and timing test design

This dev session has no dedicated GPU and runs `*.gl.spec.ts` perf gates alongside other real-GPU tests and, per the CLAUDE.md post-task checklist, concurrently with `npm run build`. Design any perf/timing gate around that contention from the first draft, not as a reaction to an observed failure.

Apply the same environment-aware tolerance already established for render perf (5.0× on a detected software renderer, via `WEBGL_debug_renderer_info`) to every hardware-relative assertion in the gate — a drift or cadence bound is exactly as hardware-relative as a render-time bound. Sample latency across repeated passes and keep the minimum per measurement, since contention only makes a run slower, never faster. Run any extra latency passes after a drift/cadence snapshot, not overlapping it — lengthening a same-thread measurement window can itself starve a co-resident timer.

A same-thread sequence of many fast calls chained via `await` can starve a co-resident `setInterval`-driven clock (e.g. `SimulationClock`) even though each call is individually async: `yieldIfNeeded` only yields past its interval threshold, so a sequence where every call resolves under that threshold runs entirely on microtasks with no macrotask yield in between. Don't pad between calls with `setTimeout(0)` to fix this — browsers clamp zero-delay timeouts to a floor around 4ms, which aliases against a 60Hz tick period and produces a different, still-wrong reading. Sample a real ≥1 second wall-clock window instead (`test/SimulationClock.test.ts` is the precedent), so a transient disruption's catch-up burst dilutes into an acceptable overall mean rather than needing every inter-tick delta to individually pass.

Compare a computed tolerance with `toBeLessThanOrEqual`, not `toBeLessThan` — an exact tie at the boundary is a reachable value, not an edge case to ignore.

Stop once best-of-N sampling and environment-aware tolerance are in place and a few stress-test runs — including one concurrent with `npm run build` — look reasonable. A slow or contended box is non-authoritative for a perf gate; chasing zero residual flakiness past that point costs far more than it is worth. When you need one clean full-suite pass despite that contention, run `npx vitest run --no-file-parallelism` — the `*.gl.spec.ts` gates false-fail when several run in parallel on this box but pass serialized, so serialize before reading a failure as a real regression.

## Source-fetching isolation tests

A few tests assert import-isolation by `fetch()`-ing library source over HTTP and regex-matching the text (`AdjacencyGraph`'s "no forbidden imports", `FrameHook`'s "color utility isolation"). This fails silently two ways: a stale served path 404s and the negative assertion passes vacuously against the 404 page, and a bare-identifier match false-positives on a comment that merely names the module. On any file move, grep every `fetch('/src/` and `new URL(` string path — tsc cannot see them — and write these assertions import-scoped (`/import[^\n]*Name/`), never bare identifiers.
