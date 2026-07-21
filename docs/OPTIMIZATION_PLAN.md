# Worker-side map load: parse + registry construction off the Main thread

## Context

`MapEngine.loadMap()` currently runs `SectorBitmapParser.parse()` (PNG fetch/decode) and the `SectorRegistry` O(W×H) scan on the Main thread, then transfers 9 buffers to the Worker via `BOOTSTRAP`. On large bitmaps (8192×4096) this blocks Main for 200–500 ms — a documented known limitation. Both classes are already zero-DOM/zero-Three.js *specifically so they can run in a Worker* (`.claude/rules/worker.md`), but that payoff was never collected: v0.0.5 deliberately kept construction on Main ("Documented Deviation 1", `docs/archive/v0.0.5/PROGRESS.md:169`).

This change inverts the load direction: Main posts a `LOAD` message with the asset URLs; the Worker fetches, decodes, scans, and keeps the authoritative state (born in place — no Main→Worker transfer at all); the Worker ships Main back exactly the buffers Main-side consumers need (`LOAD_READY`), from which Main rehydrates a `SectorRegistry` without scanning. The public `MapEngine` API is unchanged — same `loadMap` signature, guards, reload semantics, error messages, and sync accessors.

## Design decisions

- **Protocol:** `BOOTSTRAP`/`BOOTSTRAP_ACK` removed entirely (internal protocol; nothing external uses them). New: `LOAD` (Main→Worker), `LOAD_READY` (Worker→Main, carries rehydration buffers + integrity scalars), `LOAD_ERROR` (Worker→Main, rehydrated via the existing `rehydrateError` pattern). `BootstrapPayload` deleted; `BootstrapAckPayload` → `LoadAckPayload` (same fields). `MapEngine.lastBootstrapAck` (@internal) → `lastLoadAck`.
- **Rehydration:** `SectorRegistry` gains a constructor overload taking a `RegistryRehydrationPayload` (readonly fields must be assigned inside the constructor — `erasableSyntaxOnly` forbids parameter properties, and a static factory can't assign readonly fields). The scanning constructor body is untouched.
- **Buffer ownership after load:** Worker keeps `pixelIndices`, `bboxes`, `centroids`, adjacency, contours, borderEdges (its handlers' state — unchanged shape, so **zero changes to pathfinding/aggregation/anchor/border handlers**). Worker `.slice()`s the five Main-needed hot buffers off-main-thread and transfers the copies; Main-only buffers (`pixelIndicesMirror`, `hexColors`, `sectorIds`, `idToPackedRgb`, `sectorPixelCounts`) transfer directly (Worker never reads them).
- **`_sectorPixels` (≈64 MB at 4096²) is not shipped and not retained** — the Worker drops the registry instance after deriving state, so it's GC'd (net memory win). Main's only use is the has-pixels check in `MapRenderer.setSectorColor`/`resetSectorColor`; that is served by a new `sectorPixelCounts: Uint32Array` — which is **exactly the existing `centCount` array** the scan already builds (`SectorRegistry.ts:115`). Zero extra scan work.
- **`ThreeRenderBackend` drops its defensive `.slice()`** (`ThreeRenderBackend.ts:120`): nothing detaches the array anymore, and keeping it would double-retain a W×H×4 buffer on Main. One existing test's premise dies with it (rewritten in Step 9).
- **URL resolution on Main:** Worker-relative fetches would resolve against the worker script URL, breaking the example app's relative `'map.png'`. Main resolves via `new URL(url, document.baseURI).href` before posting `LOAD`.
- **No new module files** → no new `.claude/rules/structure.md` Module-layout row needed (role-text/data-flow updates still are, as part of the post-task checklist's rules-update step).

---

## Step 1 — `src/shared/types.ts`

Delete `BootstrapPayload` (lines 88–103). Rename `BootstrapAckPayload` → `LoadAckPayload` (fields unchanged; update the JSDoc to "Worker → Main load round-trip verification scalars"). Add:

```ts
/** Main → Worker load request. URLs are pre-resolved to absolute on Main (the Worker's base URL is the script URL, not the page). */
export interface LoadPayload {
  bitmapUrl: string
  definitionUrl: string
  tickHz: number
}

/**
 * Worker → Main registry-rehydration fields: everything Main-side consumers
 * (MapRenderer, PointerPickResolver, getSector/getSectorKeys/getNeighbors)
 * read post-load, prebuilt by the Worker-side scan. Contour/border scratch
 * buffers are deliberately absent — Main never reads them after load.
 */
export interface RegistryRehydrationPayload {
  width: number
  height: number
  pixelIndices: Uint32Array
  pixelIndicesMirror: Uint16Array
  bboxes: Int16Array
  centroids: Int16Array
  adjacencyPointers: Uint32Array
  adjacencyNeighbors: Uint16Array
  idToHex: string[]
  sectorData: Array<SectorData | null>
  hexColors: Uint32Array
  sectorIds: Uint16Array
  idToPackedRgb: Uint32Array
  sectorPixelCounts: Uint32Array
}

/** Worker → Main load completion: rehydration fields plus round-trip integrity scalars. */
export interface LoadReadyPayload {
  registry: RegistryRehydrationPayload
  ack: LoadAckPayload
}
```

`WorkerMessage` union (117–131): remove the `BOOTSTRAP` and `BOOTSTRAP_ACK` members; add:

```ts
  | { type: 'LOAD'; payload: LoadPayload }
  | { type: 'LOAD_READY'; payload: LoadReadyPayload }
  | { type: 'LOAD_ERROR'; errorName: string; message: string }
```

## Step 2 — `src/sector/SectorRegistry.ts`

1. **New public field** in the fields block (after `borderEdgeCount`, line 53):
   ```ts
   readonly sectorPixelCounts: Uint32Array // sectorCount: per-sector pixel count (zero-pixel detection)
   ```
   Scanning path: add `this.sectorPixelCounts = centCount` to the property-assignment block (309–327).

2. **Constructor overload.** Add overload signatures above the implementation; the implementation takes the union and branches. The scan body (lines 71–342) moves under the `instanceof Uint8ClampedArray` branch **verbatim**, with local aliases at the branch top (`const buffer = bufferOrPayload`, `const width = widthArg!`, etc. — rename the implementation params to `widthArg`/`heightArg`/`definitionArg` so the aliases can keep the original names and the body needs zero textual churn):

   ```ts
   constructor(buffer: Uint8ClampedArray, width: number, height: number, definition: SectorDefinitionFile)
   /** @internal Rehydrates from a Worker-built `RegistryRehydrationPayload` without scanning. */
   constructor(payload: RegistryRehydrationPayload)
   constructor(
     bufferOrPayload: Uint8ClampedArray | RegistryRehydrationPayload,
     widthArg?: number,
     heightArg?: number,
     definitionArg?: SectorDefinitionFile
   ) {
     if (!(bufferOrPayload instanceof Uint8ClampedArray)) {
       const p = bufferOrPayload
       this.width = p.width
       this.height = p.height
       this.sourceBuffer = null
       this.bboxes = p.bboxes
       this.centroids = p.centroids
       this.idToHex = p.idToHex
       this.pixelIndices = p.pixelIndices
       this.pixelIndicesMirror = p.pixelIndicesMirror
       this.hexColors = p.hexColors
       this.sectorIds = p.sectorIds
       this.idToPackedRgb = p.idToPackedRgb
       this.adjacencyPointers = p.adjacencyPointers
       this.adjacencyNeighbors = p.adjacencyNeighbors
       // Main never reads contour/border scratch state post-load.
       this.contourPointers = new Uint32Array(0)
       this.contourPoints = new Int16Array(0)
       this.borderEdges = new Float32Array(0)
       this.borderEdgeCount = new Uint32Array(1)
       this.sectorPixelCounts = p.sectorPixelCounts
       this._hexToId = new Map(p.idToHex.map((hex, id) => [hex, id]))
       this._sectorData = p.sectorData
       this._sectorPixels = [] // pixel lists are never shipped cross-thread
       return
     }
     // ── existing scan body, verbatim, behind local aliases ──
     ...
   }
   ```
   Update the constructor JSDoc to document both paths.

3. **New method** (after `getSectorPixels`):
   ```ts
   /** True iff `hexKey` is a defined sector with at least one bitmap pixel — the recolor-path precondition, valid on both construction paths. */
   hasSectorPixels(hexKey: string): boolean {
     const id = this._hexToId.get(hexKey)
     return id !== undefined && this.sectorPixelCounts[id] > 0
   }
   ```

4. **Guard `getSectorPixels`** (line 378) — MANDATORY, not defensive: on a rehydrated instance `this._sectorPixels[id]` is `undefined` and the current `pixels.length` would throw `TypeError`:
   ```ts
   const pixels = this._sectorPixels[id]
   return pixels !== undefined && pixels.length > 0 ? pixels : undefined
   ```
   Add a JSDoc note: a rehydrated instance always returns `undefined`.

5. **New method `serializeForMain()`** (Worker-side use). 10 transferables, all distinct buffers (a duplicate in the list would throw):
   ```ts
   /**
    * Builds the Worker→Main rehydration payload + Transferable list: slices
    * the five buffers the Worker keeps live (pixelIndices + the proxy-snapshot
    * four) and hands over Main-only buffers (mirror, RGB LUTs, pixel counts)
    * directly.
    */
   serializeForMain(): { payload: RegistryRehydrationPayload; transfer: ArrayBuffer[] } {
     const payload: RegistryRehydrationPayload = {
       width: this.width,
       height: this.height,
       pixelIndices: this.pixelIndices.slice(),
       pixelIndicesMirror: this.pixelIndicesMirror,
       bboxes: this.bboxes.slice(),
       centroids: this.centroids.slice(),
       adjacencyPointers: this.adjacencyPointers.slice(),
       adjacencyNeighbors: this.adjacencyNeighbors.slice(),
       idToHex: this.idToHex,
       sectorData: this._sectorData,
       hexColors: this.hexColors,
       sectorIds: this.sectorIds,
       idToPackedRgb: this.idToPackedRgb,
       sectorPixelCounts: this.sectorPixelCounts,
     }
     return {
       payload,
       transfer: [
         payload.pixelIndices.buffer, payload.pixelIndicesMirror.buffer,
         payload.bboxes.buffer, payload.centroids.buffer,
         payload.adjacencyPointers.buffer, payload.adjacencyNeighbors.buffer,
         payload.hexColors.buffer, payload.sectorIds.buffer,
         payload.idToPackedRgb.buffer, payload.sectorPixelCounts.buffer,
       ],
     }
   }
   ```
   Import `RegistryRehydrationPayload` with `import type`.

6. Update the stale `getSectorAt` JSDoc (347–352): the mirror is no longer "retained after the bootstrap transfer detaches pixelIndices" — it's shipped to Main in `LOAD_READY`.

## Step 3 — `src/worker/state.ts`

Replace the `BootstrapPayload` alias with an own interface (field-for-field identical, so handlers compile unchanged) plus a derivation function; delete `setWorkerState` (its only caller is the removed BOOTSTRAP case; no test imports it):

```ts
import type { SectorRegistry } from '../sector/SectorRegistry'

/** Worker-side registry state, derived from the Worker-constructed SectorRegistry at LOAD. */
export interface WorkerState {
  pixelIndices: Uint32Array
  bboxes: Int16Array
  centroids: Int16Array
  adjacencyPointers: Uint32Array
  adjacencyNeighbors: Uint16Array
  contourPointers: Uint32Array
  contourPoints: Int16Array
  borderEdges: Float32Array
  borderEdgeCount: Uint32Array
  width: number
  height: number
  sectorCount: number
  tickHz: number
}

let state: WorkerState | null = null

/** Derives the Worker's registry state from the Worker-constructed `SectorRegistry` (the instance itself is dropped afterwards so `_sectorPixels` can be GC'd). */
export function setWorkerStateFromRegistry(registry: SectorRegistry, tickHz: number): void {
  state = {
    pixelIndices: registry.pixelIndices,
    bboxes: registry.bboxes,
    centroids: registry.centroids,
    adjacencyPointers: registry.adjacencyPointers,
    adjacencyNeighbors: registry.adjacencyNeighbors,
    contourPointers: registry.contourPointers,
    contourPoints: registry.contourPoints,
    borderEdges: registry.borderEdges,
    borderEdgeCount: registry.borderEdgeCount,
    width: registry.width,
    height: registry.height,
    sectorCount: registry.idToHex.length,
    tickHz,
  }
}

/** The Worker-side registry state, or `null` before LOAD. */
export function getWorkerState(): WorkerState | null {
  return state
}
```

## Step 4 — `src/worker/index.ts`

Imports: add `SectorBitmapParser`, `SectorRegistry`, swap `setWorkerState` → `setWorkerStateFromRegistry`, swap type `BootstrapAckPayload` → `LoadAckPayload`, add types `LoadPayload`, `SectorDefinitionFile`.

Replace the `BOOTSTRAP` case (38–56) with:

```ts
    case 'LOAD': {
      void handleLoad(msg.payload)
      break
    }
```

Add `handleLoad` (module scope, near `bboxAt`):

```ts
/**
 * LOAD handler: fetches + decodes the bitmap and definition inside the
 * Worker, runs the O(W×H) SectorRegistry scan off-main-thread, derives the
 * Worker state, starts the SimulationClock, and ships Main the rehydration
 * payload in LOAD_READY. Any failure posts LOAD_ERROR for Main to rehydrate.
 * A repeated LOAD only occurs after a failed one (reload recreates the
 * Worker), and a failed LOAD never starts the clock — no double-start guard.
 */
async function handleLoad(load: LoadPayload): Promise<void> {
  try {
    const parser = new SectorBitmapParser()
    const [{ buffer, width, height }, definition] = await Promise.all([
      parser.parse(load.bitmapUrl),
      fetch(load.definitionUrl).then(r => {
        if (!r.ok)
          throw new Error(
            `Failed to load definition: HTTP ${r.status} ${r.statusText}`
          )
        return r.json() as Promise<SectorDefinitionFile>
      }),
    ])
    const registry = new SectorRegistry(buffer, width, height, definition)
    setWorkerStateFromRegistry(registry, load.tickHz)
    simulationClock = new SimulationClock(load.tickHz)
    simulationClock.start()
    const sectorCount = registry.idToHex.length
    const zeroBBox: [number, number, number, number] = [0, 0, 0, 0]
    const ack: LoadAckPayload = {
      sectorCount,
      totalEdges: registry.adjacencyNeighbors.length,
      firstSectorBBox: sectorCount > 0 ? bboxAt(registry.bboxes, 0) : zeroBBox,
      lastSectorBBox:
        sectorCount > 0 ? bboxAt(registry.bboxes, sectorCount - 1) : zeroBBox,
    }
    const { payload, transfer } = registry.serializeForMain()
    self.postMessage(
      { type: 'LOAD_READY', payload: { registry: payload, ack } } satisfies WorkerMessage,
      transfer
    )
  } catch (err) {
    self.postMessage({
      type: 'LOAD_ERROR',
      errorName: err instanceof Error ? err.name : 'Error',
      message: err instanceof Error ? err.message : String(err),
    } satisfies WorkerMessage)
  }
}
```

Critical details: the `Failed to load definition: HTTP …` string moves **verbatim** from `MapEngine.ts:177-179` (tests depend on rejection; keep byte-identical). Ordering: state → clock → ack → `serializeForMain` → post (state/ack read registry buffers before any transfer; only fresh slices and Main-only buffers are in the transfer list, so Worker-kept references stay attached). Update the dispatcher JSDoc (28–33: "BOOTSTRAP stores…" → LOAD wording), the `simulationClock` comment (19: "at BOOTSTRAP" → "at LOAD"), and the `getTickTelemetry` JSDoc (22: "zeros before BOOTSTRAP" → "zeros before LOAD").

## Step 5 — `src/worker/SharedRegistryProxy.ts`

Line 29: `function rehydrateError` → `export function rehydrateError` (MapEngine needs it for `LOAD_ERROR`; `SectorLimitExceededError` is already in `ERROR_CTORS` at line 20, so `instanceof` survives the boundary). Update the stale snapshot comment at line 39 ("surviving the BOOTSTRAP buffer detach" → "delivered by the Worker at load"). No other changes.

## Step 6 — `src/core/MapRenderer.ts`

Lines 275–276 and 288–289: replace
```ts
const pixels = this._registry.getSectorPixels(hexKey)
if (!pixels) {
```
with
```ts
if (!this._registry.hasSectorPixels(hexKey)) {
```
in both `setSectorColor` and `resetSectorColor`. Warn messages unchanged (`MapRenderer.test.ts` asserts them). Constructor (`registry.pixelIndices` → backend) and the `webglcontextrestored` path (`registry.pixelIndicesMirror`, line 163) work against the rehydrated instance unchanged.

## Step 7 — `src/render/ThreeRenderBackend.ts`

Line 120: `this._pixelIndicesSnapshot = pixelIndices.slice()` → `this._pixelIndicesSnapshot = pixelIndices` and rename the field `_pixelIndicesSnapshot` → `_pixelIndices` (other use sites: field declaration, DataTexture ctor at 139–140, `readSectorIdAt` ~312–322). Replace the stale comment block (132–138) — new contract: the caller-owned array backs the texture directly and must stay attached for the backend's lifetime; `MapEngine` hands over the Worker-built copy retained on the rehydrated registry. (`reuploadIndexTexture` writing mirror values into the now-shared array is harmless — values are identical by construction.)

## Step 8 — `src/core/MapEngine.ts`

**Imports/fields:** remove `SectorBitmapParser` import, the `_parser` field, and `this._parser = new SectorBitmapParser()` (line 57). Change `import { SharedRegistryProxy }` → `import { SharedRegistryProxy, rehydrateError }`. Type imports: drop `BootstrapPayload`/`BootstrapAckPayload`, add `LoadReadyPayload`/`LoadAckPayload`. Rename field `_lastBootstrapAck: LoadAckPayload | null` → `_lastLoadAck` and getter `lastBootstrapAck` → `lastLoadAck` (its only reader is the spec rewritten in Step 9).

**JSDoc touch-ups:** constructor (line 55, "bootstrap round-trip" → "load round-trip"), `pick()` (line 97, "`loadMap()`/`BOOTSTRAP_ACK`" → "`loadMap()`"), `setTickRate` (106–107, "handed to the Worker at bootstrap" → "handed to the Worker in the LOAD message; read at `loadMap()` call time"), `tickRate` getter (123, "Task 1.5 BOOTSTRAP payload builder" → "LOAD payload builder"), `loadMap` (128–135, rewrite: "Sends the Worker a LOAD request; the Worker fetches/parses both assets and constructs the registry off-main-thread, shipping back the render/pick buffers in LOAD_READY.").

**`loadMap()` body:** guards + reload teardown (137–170) untouched. Replace lines 172–290 (inside the existing `try`) with:

```ts
      const bitmapUrl = new URL(config.bitmapUrl, document.baseURI).href
      const definitionUrl = new URL(config.definitionUrl, document.baseURI).href

      const ready = await new Promise<LoadReadyPayload>((resolve, reject) => {
        const onMessage = (e: MessageEvent<WorkerMessage>): void => {
          if (e.data.type === 'LOAD_READY') {
            this._worker.removeEventListener('message', onMessage)
            resolve(e.data.payload)
          } else if (e.data.type === 'LOAD_ERROR') {
            this._worker.removeEventListener('message', onMessage)
            reject(rehydrateError(e.data.errorName, e.data.message))
          }
        }
        this._worker.addEventListener('message', onMessage)
        this._worker.postMessage({
          type: 'LOAD',
          payload: { bitmapUrl, definitionUrl, tickHz: this._tickRate },
        } satisfies WorkerMessage)
      })

      this._lastLoadAck = ready.ack
      const registry = new SectorRegistry(ready.registry) // rehydrate — no scan
      const hook = (): void => {
        this._renderClock.tick(this._frameCallbacks)
      }
      const renderer = new MapRenderer(
        config.canvas,
        registry,
        hook,
        e => this._picker?.handlePointer(e, false),
        e => this._picker?.handlePointer(e, true)
      )
      // Suspend rendering until session wiring completes — a real rAF tick
      // here would consume the render loop's "priming" frame before
      // loadMap() has resolved.
      renderer._pauseLoop()

      // Proxy snapshot shares the Main-resident rehydrated buffers directly —
      // both are read-only post-load and nothing detaches them.
      this._proxy = new SharedRegistryProxy(this._worker, {
        bboxes: ready.registry.bboxes,
        centroids: ready.registry.centroids,
        adjacencyPointers: ready.registry.adjacencyPointers,
        adjacencyNeighbors: ready.registry.adjacencyNeighbors,
      })
```

then the pool/hook wiring from today's lines 258–277 **verbatim**, then `renderer._resumeLoop()`, then today's lines 280–290 verbatim (`_registry`/`_renderer`/`_picker` assignment, plus `this._isRegistryInvalidated = true` moved here from old line 254 — the deprecated `registry` getter keeps throwing `MapInvalidatedError` post-load, a documented contract asserted by `MapEngine.test.ts:331`), ending with `_isLoaded = true` / `_isLoading = false`. The `catch { this._isLoading = false; throw err }` wrapper stays.

## Step 9 — Tests

**Replace `test/integration/bootstrap-transfer.spec.ts` → `test/integration/worker-load.spec.ts`** (file rename is safe — the source-isolation `fetch('/src/…')` assertions reference library paths, not test paths):

1. *"rehydrates a populated Main-side registry (no detachment)"* — post-load, over `engine['_registry']`: `byteLength > 0` for `pixelIndices`, `pixelIndicesMirror`, `bboxes`, `centroids`, `adjacencyPointers`, `adjacencyNeighbors`, `hexColors`, `sectorIds`, `idToPackedRgb`, `sectorPixelCounts`; `contourPoints.length === 0` and `borderEdges.length === 0` (documented placeholders).
2. *"lastLoadAck matches independently-computed ground truth"* — port of the old ACK test (lines 51–78) verbatim with `engine.lastLoadAck`.
3. *"rehydrated registry matches a Main-side ground-truth scan"* — ground-truth `SectorRegistry` built on Main (as the old test does) vs. `engine['_registry']`: `getSectorKeys()` equal; `getSector(key)` deep-equal per key; `getSectorAt(x, y)` equal for all 16 fixture pixels; `hasSectorPixels(key) === true` for all 4 keys; `idToPackedRgb` equal; `getSectorPixels(key)` returns `undefined` on the rehydrated instance.
4. *"relative URLs resolve against document.baseURI"* — `bitmapUrl: 'test/fixtures/test-4x4.png'` (no leading slash; comment it as a deliberate exception to the absolute-path fixture rule — it exists to exercise Main-side URL resolution).
5. *LOAD_ERROR propagation* describe-block:
   - bitmap 404: `bitmapUrl: '/test/__404__'` → `rejects.toThrow('SectorBitmapParser: failed to load bitmap — HTTP 404')` (string verified at `SectorBitmapParser.ts:29`).
   - definition 404: `definitionUrl: '/test/__404__'` → `rejects.toThrow('Failed to load definition: HTTP 404')`.
   - `SectorLimitExceededError` across the boundary: build a 65,535-key definition JSON in-test, serve via `URL.createObjectURL(new Blob([json], { type: 'application/json' }))` → `rejects.toBeInstanceOf(SectorLimitExceededError)`. (Fallback if Worker `fetch(blob:)` is flaky under Vitest browser mode: add a committed fixture via `test/fixtures/generate-fixtures.js`.)
   - after a failed load, retry with good URLs succeeds (`_isLoading` reset; engine not destroyed).

**`test/PalettePipeline.gl.spec.ts` (77–109):** the "renders correct sector colors even after the bootstrap transfer detaches registry.pixelIndices" test loses its premise (no transfer detaches anything). Rewrite: drop the `structuredClone(…, { transfer })` detach and the `byteLength === 0` assertion; rename to "backs the index texture with the caller-owned pixelIndices directly (no defensive copy)"; keep the render/color assertions; add `expect(renderer['_backend']['_pixelIndices']).toBe(registry.pixelIndices)`.

**`test/SectorRegistry.test.ts`:** append `describe('rehydration constructor')` — scan a registry from the existing synthetic buffer helper, `serializeForMain()`, `new SectorRegistry(payload)` in-process, then: accessor parity (`getSector`, `getSectorKeys`, `getBBox`/`getCentroid`/`getNeighbors` hex+numeric, `getNumericId`, `getSectorAt`), `hasSectorPixels` parity on both instances, and source-registry buffers still attached (in-process slices, not transfers).

**Comment-only touch-ups** (stale BOOTSTRAP references): `test/workers/pathfinding-perf-worker.ts:74,89`, `test/PathfindingPerf.gl.spec.ts:12`, `test/AggregationPerf.gl.spec.ts:50`, `src/worker/SpatialGraph.ts:9`.

**Expected to pass unchanged (verify in the full run):** `MapEngine.test.ts` (404/non-JSON rejections assert bare `.rejects.toThrow()` or strings that now arrive verbatim via `rehydrateError`; the binary-PNG-as-JSON case surfaces as a Worker-side `SyntaxError` rehydrated as a plain `Error` — still rejects), `lifecycle-invalidation.spec.ts`, `proxy-snapshot.spec.ts`, `anchors.spec.ts` (reads `_registry.pixelIndicesMirror` — present on the rehydrated instance), `borders-soak.spec.ts` (monkeypatches `_worker.postMessage` after `loadMap` resolves — LOAD already sent), `SectorBitmapParser.test.ts`, `SharedRegistryProxy.test.ts`, `MapRenderer.test.ts`, `MapModes.test.ts`, `ContextLossRecovery.gl.spec.ts`, and all direct-construction perf gates.

## Step 10 — Documentation

**README.md:**
- Line 162 ("the Worker only becomes active once `loadMap()` bootstraps it") → "…once `loadMap()` sends it the LOAD request".
- `loadMap` section (~172): rewrite — the Worker fetches and decodes both assets, runs the O(W×H) scan off Main, and ships Main the render/pick buffers in a single `LOAD_READY` message (Transferable `ArrayBuffer`s — no `SharedArrayBuffer`, no special headers).
- ~179 "re-bootstraps against the new map" → "re-issues the LOAD against the new map".
- ~230 sync-accessor note: "Served from Main-resident snapshot buffers delivered by the Worker at load".
- ~318 + error table ~408: reword the `registry`-getter deprecation (still throws `MapInvalidatedError` by contract; the authoritative registry is Worker-resident and Main holds a load-time snapshot).
- **Known limitations: delete the "Main-thread bitmap parse + registry construction" block (~519–520)** and adjust the "Mobile heap budget" paragraph (Main no longer retains `_sectorPixels`; per-thread split changed).
- "What it does" item 2: update ("builds the spatial registry inside a dedicated Web Worker" instead of "builds … then transfers it into a Worker").

**`.claude/rules/*.md`** (as the post-task checklist's rules-update step):
- `worker.md`: replace the "After the one-time `BOOTSTRAP` transfer, a Main-resident `pixelIndicesMirror` … is retained" sentence — the Worker constructs the registry at LOAD and ships the mirror to Main in `LOAD_READY`; staleness caveat unchanged.
- `structure.md`: Worker-entry row ("Dispatches `BOOTSTRAP`/`CALL`…" → "Dispatches `LOAD`/`CALL`…; fetches + parses map assets and constructs the `SectorRegistry` Worker-side"); `SectorRegistry` row (add "; also rehydratable from a Worker-built payload without scanning"); rewrite Key-data-flow items 1–4: (1) Main resolves URLs and posts `LOAD`; (2) Worker parses + scans and derives `WorkerState`; (3) `LOAD_READY` transfers 10 buffers to Main, which rehydrates a `SectorRegistry`, builds the renderer/index texture, and seeds the proxy snapshot; (4) unchanged tail.
- `sectors.md`: "`idToHex: string[]` (Main-resident, never transferred)" → "(structured-cloned to Main at load)".

No example-app changes (public API unchanged; `example/src/app.ts:69` relative `'map.png'` is covered by the Main-side URL resolution; the commented advanced snippet in `example/src/main.ts` stays valid — both classes remain exported with the scanning constructor intact). No `main.ts` header-index change (no public-symbol changes).

## Step 11 — Verification

1. Batch 1 (parallel): `npm run typecheck` + `npm run typecheck:example`.
2. Batch 2 (parallel): `npm run test` + `npm run build`. If a `*.gl.spec.ts` perf gate fails, rerun `npx vitest run --no-file-parallelism` before treating it as real.
3. `npm run size` — must stay < 15 KB gzipped.
4. Manual smoke: `npm run example` — relative-URL load, hover/click, recolor, map modes, pathfinding, borders panels.
5. End of session: rules-file updates (Step 10) + `npm run format`.

## Risks

- **PalettePipeline detach test** is the one test whose premise (not just assertions) dies — must be rewritten, not skipped.
- **Blob-URL fetch in the Worker** (sector-limit test): fine in Chromium; fall back to a committed fixture if flaky.
- **`setTickRate` mid-load nuance:** `tickHz` now rides the LOAD message at `loadMap()` call time; a `setTickRate` between `loadMap()` start and resolution is no longer picked up. No test exercises this; JSDoc updated.
- **Load-time validation `console.warn`s** (zero-pixel / bitmap-only sectors) now emit from the Worker — still reach devtools; no engine-level test spies on them.
- **Exported-type surface:** `BootstrapPayload` deleted / `BootstrapAckPayload` renamed flow through `src/index.ts` re-exports — a type-level break for hypothetical externals; acceptable at v0.0.x, note in release notes.
- **Worker crash before any reply** would hang `loadMap` — identical to today's `ackPromise` behavior; parity kept deliberately (no new timeout).

## Verified against source

Re-read before finalizing; each location matches the plan's assumptions:

- `src/core/MapEngine.ts:40-65` (fields incl. `_parser`, `_lastBootstrapAck`, eager `_createWorker`), `:105-126` (`setTickRate`/`tickRate`), `:136-295` (full `loadMap`: guards, reload teardown 141-168, parse/fetch 173-182 with the exact `Failed to load definition: HTTP …` string at 177-179, 9-buffer transfer list 242-252, `_isRegistryInvalidated` at 254, session wiring 256-290), `:680-684` (`_createWorker`).
- `src/shared/types.ts:88-131` (`BootstrapPayload`, `BootstrapAckPayload`, `WorkerMessage` union).
- `src/worker/state.ts` (entire file; `WorkerState = BootstrapPayload` alias, `setWorkerState`/`getWorkerState`).
- `src/worker/index.ts` (entire file; BOOTSTRAP case 38-56, `bboxAt` 11-17, `simulationClock` module-level, CALL dispatch, telemetry handler).
- `src/sector/SectorRegistry.ts:20-57` (readonly field declarations), `:65-139` (scan-ctor head, `centCount` at 115), `:205-343` (finalization, property assignment 311-327, warn loops reading `centCount`), `:347-385` (`getSectorAt` reads mirror; `getSectorPixels` at 375-380 would throw on `pixels.length` for a missing entry — guard required).
- `src/core/PointerPickResolver.ts` (entire file; uses `renderer.readSectorIdAt`, `registry.width/height/idToHex/getSector` — no mirror dependency).
- `src/core/MapRenderer.ts:149-178` (backend construction args; `webglcontextrestored` → `reuploadIndexTexture(this._registry.pixelIndicesMirror)`), `:274-302` (`getSectorPixels` truthiness checks in `setSectorColor`/`resetSectorColor`).
- `src/render/ThreeRenderBackend.ts:105-150` (`_pixelIndicesSnapshot = pixelIndices.slice()` at 120; stale rationale comment 132-138).
- `src/worker/SharedRegistryProxy.ts:13-39` (`ERROR_CTORS` includes `SectorLimitExceededError` at 20; `rehydrateError` unexported at 29; stale comment at 39).
- `src/sector/SectorBitmapParser.ts:29` (exact bitmap-404 error string).
- `test/integration/bootstrap-transfer.spec.ts` (both tests, incl. `engine.lastBootstrapAck` at 77).
- `test/PalettePipeline.gl.spec.ts:77-109` (the detach-premise test).
- `test/MapEngine.test.ts` error assertions (149, 168, 178-181, 194-204: bare `.rejects.toThrow()` on the two malformed-JSON cases; `registry` getter contract at 305/331).
- `example/src/app.ts:64-70` (relative `'map.png'`/`'sectors.json'` — drives the URL-resolution requirement).
- Grep confirmed: no other references to `BootstrapPayload`/`BootstrapAckPayload`/`lastBootstrapAck`/`setWorkerState` outside the files above; remaining `BOOTSTRAP` mentions are comments only (`SpatialGraph.ts:9`, perf-worker/spec comments — Step 9 touch-ups).
