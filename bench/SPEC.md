# Benchmark Specification: registry-alloc

## Goal

Put a number on `SectorRegistry`'s single O(W×H) scan — how long it blocks the
thread it runs on, how much memory it peaks at while running, and how much it
retains once it finishes.

The scan is the whole of map load on the main thread today. Before this
benchmark existed in working form, the only figure anyone could cite was a
prose estimate in `README.md`, and the benchmark that might have grounded it had
stopped compiling during a module reorganization — the root `tsconfig.json` pins
`include` to `["src"]` and `vite.config.ts` excludes `bench/**` from Vitest, so
nothing checked it. `npm run typecheck:bench` now covers this directory.

## Command

```bash
npm run bench:registry-alloc        # both fixture sizes, in sequence
npm run bench:registry-alloc:1k     # 4096x4096, 1,000 sectors
npm run bench:registry-alloc:10k    # 4096x4096, 10,000 sectors
```

Run it through npm, not `npx playwright test` directly: the scripts set
`NODE_OPTIONS=--expose-gc`, and the spec throws rather than continuing if
`global.gc` is unavailable.

Results land in `bench/.last-result.json` (raw, per run) and are transcribed
into `bench/baselines.json` under `b1.registry_scan` (curated, with metadata).

## Fixture

`test/fixtures/generate-registry-fixture.ts` builds the bitmap in-process as a
raw `Uint8ClampedArray`. `SectorRegistry`'s constructor takes that type
directly, so PNG encoding would buy nothing and would cost a `sharp` encode plus
decode of a 67 MB buffer inside the very process whose memory is being sampled.
Nothing is written to disk and nothing multi-megabyte is committed.

Two sector counts at a fixed 4096×4096 — the repo's documented mobile texture
cap, and the size `README.md` sizes its heap budget against. Two points rather
than one so the figures carry a slope: whether cost tracks sector count or
pixel count is the question the deferred Worker-relocation decision turns on.

Coverage is 1.0. Every pixel is assigned to a sector and none carry the reserved
`000000` void colour, so **every figure here is an explicit upper bound** for a
map of these dimensions. Real maps have void pixels and will measure lower.

## Procedure

Per fixture size, in a dedicated process:

1. Generate the fixture buffer and definition from a fixed seed.
2. Force a collection.
3. Start the sampler worker (`bench/rss-sampler.mjs`) and wait for its ready
   message, so the polling loop is live before the scan begins.
4. Take the baseline `process.memoryUsage()` on the main thread.
5. Bracket `new SectorRegistry(...)` with `performance.now()`.
6. Stop the sampler and collect its peak.
7. Force a collection and take the retained `process.memoryUsage()`, with the
   registry still reachable — this delta is what the scan hands back to its
   caller, not what it burned producing it.
8. Repeat the scan twice more for wall-clock only, keeping the minimum.

### Why peak and retained use different counters

`process.memoryUsage()`'s `heapUsed`, `heapTotal`, `external`, and
`arrayBuffers` are read from the **calling thread's own V8 isolate**. Only `rss`
is process-wide. Measured on Node v26.5.0: with the main thread holding 270 MB
`heapUsed` and 24 MB `arrayBuffers`, a sampler worker polling the same API
reported 7.8 MB and 0.1 MB — `rss` was the only field that tracked.

So:

- **Peak** is RSS, sampled every 5 ms from a real OS thread. The constructor is
  one synchronous block with no `await`, yield, or timer, so no observer on its
  own thread can see the moment the transient per-sector pixel lists and their
  typed-array conversions are both alive. Instrumenting the constructor was
  rejected — the peak is bench-only information, and sampling hooks in library
  code work against both the size budget and the "composable, not invasive"
  invariant in `docs/vision.md` (in the legacy snapshot under `log/artifacts/`).
- **Retained** is the main thread's own post-GC delta, split into its V8 heap
  and ArrayBuffer components. Either counter alone hides roughly half the
  picture: the transient lists are heap objects, the retained spatial buffers
  are ArrayBuffer-backed.

RSS is an upper bound rather than an allocation total — it counts pages the
allocator has not returned to the OS. This is also why each fixture size runs in
its own process: RSS is a high-water mark, and a second measurement in the same
process would inherit the first one's peak as its baseline and report a
peak-over-retained gap of roughly zero.

## Assertions

The benchmark is **not a pass/fail gate**. It emits figures; `bench/baselines.json`
records them. No threshold is asserted — setting one before a first measurement
existed is the failure this benchmark was rewritten to avoid.

Three in-run assertions exist only to catch an instrument that is measuring
nothing: the sampler took at least one sample, scan time is non-zero, and peak
RSS exceeds retained RSS. The last is the load-bearing one — if peak does not
clear retained, the sampler missed the constructor's window and the run says
nothing about transient allocation.

## Stated assumptions

- **Node wall-clock stands in for browser main-thread blocking.** The harness
  runs in Node under Playwright, where `createImageBitmap` and `OffscreenCanvas`
  do not exist, so `SectorBitmapParser`'s decode path cannot be exercised here
  at all — these figures cover the scan only, never decode. The scan itself is
  pure JS over typed arrays with no DOM dependency and both hosts run V8, but
  this is assumed, not measured. Decode is measured separately by
  `test/DecodePerf.gl.spec.ts` under Vitest browser mode and recorded as
  `b4.decode`; add the two for total main-thread load cost.
- **Recorded hardware is not reference hardware.** See the `hardware` field in
  `bench/baselines.json`. Treat the ratio between pre- and post-removal figures
  as the signal rather than the absolute milliseconds.

## Principles Compliance

- **PR-3 (Performance Where It Earns It):** this benchmark exists so that
  optimizations to the load path can be accepted or rejected against a measured
  figure rather than an estimate.
- **PR-1 (Hobbyist Deployability):** the benchmark needs no COOP/COEP headers,
  and neither does anything it measures. `performance.measureUserAgentSpecificMemory()`
  — which an earlier draft of this spec called for — would have required them.
