# map-engine reference

The full reference. The short guide is [README.md](../README.md).

A lightweight, browser-native TypeScript library for rendering interactive Paradox-style grand strategy maps using Three.js.

Inspired by the Clausewitz/Jomini engine pipeline (EU4, HOI4, CK3): a 24-bit RGB-coded province bitmap as the source of spatial truth, linked to structured data via color-as-identifier. This library brings the same conceptual approach to the open web using browser-native APIs.

## What it does

1. Ingests a PNG bitmap where every pixel's RGB value encodes a **sector** identity
2. Builds an in-memory spatial registry from the bitmap and a JSON definition file, then transfers it into a dedicated Web Worker (Off-Main-Thread architecture) so simulation-side work never blocks rendering
3. Renders the map via Three.js using a GPU palette-shader pipeline (instant, zero-CPU-iteration recoloring), with pan/zoom and typed `sectorClick` / `sectorHover` events, plus async `pick()` for on-demand lookups
4. Provides Worker-side grand-strategy spatial primitives — A\* pathfinding, hierarchical (group) bbox aggregation, guaranteed-interior label anchors, and dynamic group-perimeter border rendering — all returning to the main thread via zero-GC Transferable handoffs

**Bundle size:** 16341 bytes gzipped, the entry and the worker together (Three.js is a peer dependency — not bundled)

## Requirements

- Browser only — no Node.js, no SSR
- Required browser APIs: **WebGL2**, `OffscreenCanvas`, `createImageBitmap`, `Worker`, Fetch, `HTMLCanvasElement`, `requestAnimationFrame`
- Peer dependency: `three@^0.160.0`

## Stability

| Tier             | Exports                                                                                                                                                                                                                                                                                                                                                             | Contract                                                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primary**      | `MapEngine`, `MapConfig`, `PickResult`, `SectorData`, `SectorBBox`, `SectorDefinitionFile`, `MapModeId`                                                                                                                                                                                                                                                             | Settled. A removal or a signature change is a breaking change.                                                                                                                                                                                                                           |
| **Advanced**     | `SectorRegistry`, `SectorBitmapParser`, `toHexKey`, canonical errors (`MapInvalidatedError`, `WebGL2NotSupportedError`, etc.)                                                                                                                                                                                                                                       | Settled.                                                                                                                                                                                                                                                                                 |
| **Experimental** | Exports marked `@experimental` or `@deprecated` (currently: `BBox`, `MapView`, `FitBoundsOptions`, and `FitMode` types, `getView()`, `setView()`, `fitBounds()` and its `fit` option, the `viewChange` event, the `ignoredColors` option of `MapConfig`, `getSectorId()` and `getSectorKey()`, plus the `BorderEdge` type, `SectorRegistry.borderEdges` raw buffer) | No stability guarantee. Group-perimeter border _rendering_ shipped in `v0.0.6` via `recomputeBorders()` / `getBorderSegments()` (see API below); the deprecated `BorderEdge` type and the raw `SectorRegistry.borderEdges` allocation are legacy internal buffers, not that public path. |

The project is in early development (`v0.0.y`). All releases increment the patch version only. A tier describes the state of the code for the projects of its author. It is not a promise to other users.

## Installation

map-engine is not on npm, and it is not offered as a dependency. This section records the route that the maintainer uses in personal projects.

**Local route:** the built snapshot is the one route that a consumer app of the maintainer has proved.

1. Build the library: run `npm run build` in the map-engine directory. Use the built snapshot, not the source.
2. In the consumer, add the library as a `file:` dependency: `npm install ../map-engine`. Then install the peer: `npm install three@^0.160.0`. The consumer, not the library, owns `three`.
3. In `vite.config.ts` of the consumer (Node 20.11 or later, for `import.meta.dirname`), alias `three` to the copy in its own `node_modules`, and let the dev server read the linked directory:

   ```typescript
   import { resolve } from 'node:path'
   import { defineConfig } from 'vite'

   const root = import.meta.dirname

   export default defineConfig({
     resolve: {
       alias: { three: resolve(root, 'node_modules/three') },
     },
     server: {
       fs: { allow: [root, resolve(root, '../map-engine')] },
     },
   })
   ```

   A `file:` dependency is a symlink, and Vite follows it to the real path. The built `dist/index.js` starts with a bare `import "three"`, so without the alias Vite looks for `three` beside map-engine and not in the consumer. When map-engine has its own `node_modules/three`, Vite finds that copy first, and the consumer then runs two copies of `three`. A second copy of `three` also breaks `instanceof` checks. `server.fs.allow` lists the map-engine directory because the linked path is outside the root of the consumer.

   As an alternative, `resolve.dedupe: ['three']` with `resolve.preserveSymlinks: true` should give the same single copy. No consumer has proved it, so use the alias when you need a route that works.

4. Do not copy `dist/index.js` alone. The worker chunk in `dist/assets` loads by a URL relative to `dist/index.js`, so serve both from one place.
5. Rebuild after each change of the library: the consumer reads `dist`.
6. Types come from `dist/index.d.ts`. `@types/three` is a dev dependency of the consumer, and its version should match the peer range.

## Quick start

```typescript
import { MapEngine } from 'map-engine'

const canvas = document.getElementById('map') as HTMLCanvasElement

// Ensure canvas has non-zero CSS dimensions and is in the DOM before loadMap()
canvas.style.width = '800px'
canvas.style.height = '600px'

const engine = new MapEngine()

// Subscribe to events before loadMap() — on()/off() are exempt from the pre-load guard
engine.on('sectorHover', result => {
  if (result) {
    console.log(`Hovering: ${result.sectorData.name} (${result.hexKey})`)
  } else {
    console.log('Pointer left the map or landed on an unregistered color')
  }
})

engine.on('sectorClick', ({ hexKey, sectorData, pixelX, pixelY }) => {
  console.log(`Clicked: ${sectorData.name} at pixel (${pixelX}, ${pixelY})`)
})

// Optional: configure the Worker-side simulation tick rate before loadMap() resolves (default 60Hz)
engine.setTickRate(60)

await engine.loadMap({
  bitmapUrl: '/assets/sectors.png',
  definitionUrl: '/assets/sectors.json',
  canvas,
})

// Repaint a sector with any CSS color string (O(1) GPU palette-LUT write)
engine.setSectorColor('820030', '#3399ff')

// Reset to original bitmap color
engine.resetSectorColor('820030')

// Async pick — resolves the sector under an arbitrary point (e.g. for custom input handling)
const hit = await engine.pick({ clientX: 400, clientY: 300 })

// Cleanup (idempotent — safe to call multiple times). Also available as async dispose().
engine.destroy()
```

## Input formats

### `sectors.png` — Sector bitmap

The bitmap is the source of spatial truth. Every pixel's RGB value identifies the sector that pixel belongs to.

**Required constraints:**

- 24-bit RGB PNG only — no RGBA, no indexed-color PNG saved with alpha
- **No anti-aliasing** — edges between sectors must be hard pixel boundaries with no blended intermediate colors
- **No color blending** at region edges — each pixel must be exactly one sector's RGB value
- **No transparency** — alpha must be 255 on every pixel
- **Unique RGB per sector** — no two distinct sectors may share an RGB value
- **Solid fills** — every pixel within a sector must be exactly the same RGB value

**Recommended tooling:**

- **Aseprite** in indexed-color mode — guarantees hard edges with no anti-aliasing
- **GIMP** with snap-to-grid and pencil tool (not paintbrush) — pencil tool never anti-aliases

**Consequences of violations:**

Anti-aliased edge pixels introduce intermediate RGB colors not present in `sectors.json`. When the pointer lands on such a pixel, the picking pipeline resolves to an unregistered color and emits `sectorHover` with `null` (or `pick()` resolves `null`). This produces null hover flicker along sector borders. The only fix is to regenerate the bitmap without anti-aliasing.

**Validation warnings:**

At load time, the engine emits `console.warn` for two mismatch conditions:

- A color appears in the bitmap but has no entry in `sectors.json` — that color is treated as non-interactive (same as the void color)
- A key appears in `sectors.json` but has zero pixels in the bitmap — the sector is registered but never selectable

**Void-color optimization:**

Leave non-interactive regions (oceans, wastelands, national borders) as a single color **not listed** in `sectors.json`. Undefined colors skip all spatial data structure construction. The performance benefit is proportional to non-interactive pixel coverage. `#000000` is the conventional void color.

### `sectors.json` — Sector definition

```json
{
  "820030": { "name": "Northern Reach", "population": 142000 },
  "004d99": { "name": "Coastal Basin", "population": 89000 }
}
```

**Key format:** 6-character lowercase hex string, zero-padded.

| Example    | Valid? | Notes                                     |
| ---------- | ------ | ----------------------------------------- |
| `"004d99"` | ✓      | Correct — 6 chars, lowercase, zero-padded |
| `"4d99"`   | ✗      | Missing leading zeros — will not match    |
| `"04d99"`  | ✗      | Only 5 characters — will not match        |
| `"FF0000"` | ✗      | Uppercase — will not match `"ff0000"`     |

**Case-sensitivity:** Keys are **not normalized**. `"FF0000"` in `sectors.json` will never match the bitmap's `"ff0000"` hex key. Correct lowercase casing is the consumer's responsibility.

**Runtime shape validation:** Not performed. Malformed or missing fields produce `SectorData` objects with `undefined` on the missing field — no error is thrown at load time.

Any additional fields on sector objects are passed through as-is.

**Enumerating sectors:**

`getSectorKeys()` is the canonical way to list all defined sectors. It returns keys from `sectors.json` only — zero-pixel (JSON-only) sectors are included; bitmap-only colors are not.

```typescript
// Build a legend from all defined sectors
engine.getSectorKeys().forEach(key => {
  const data = engine.getSector(key)
  console.log(key, data?.name)
})
```

## API

### `MapEngine`

**Constructor:** Takes no arguments. Spins up a dedicated Web Worker immediately (Off-Main-Thread architecture) — the Worker only becomes active once `loadMap()` bootstraps it. A `dispose()` before `loadMap()` stops that Worker, and the next `loadMap()` starts a new one.

```typescript
const engine = new MapEngine()
```

---

#### `loadMap(config: MapConfig): Promise<void>`

Loads the bitmap and definition concurrently on the Main thread, builds the spatial registry, then transfers it to the Worker in a single `BOOTSTRAP` message (Transferable `ArrayBuffer`s — no `SharedArrayBuffer`, no special hosting headers required). Resolves when the Worker has acknowledged bootstrap and the map is fully loaded and interactive.

**Guards (checked in this order):**

1. Throws `"MapEngine: destroyed"` if `dispose()`/`destroy()` was already called on a fully-loaded engine
2. Throws `"MapEngine: loadMap() is already in progress"` on concurrent calls
3. Throws `RangeError` before any request when an `ignoredColors` entry is not six hex digits

**Reload:** Calling `loadMap()` again on an already-loaded engine is a supported reload — it invalidates the previous session (rejecting any in-flight async calls with `MapInvalidatedError`), tears down the old Worker/renderer, and re-bootstraps against the new map.

**Rejection and retry:** If `loadMap()` rejects (network error, parse error, `WorkerStartError`, etc.) before ever completing, the engine is not permanently destroyed. Call `loadMap()` again with corrected inputs, with no `destroy()` first. The retry keeps the handlers that you registered with `on()`, the frame callbacks, and the stored `setView()` or `fitBounds()` request. `destroy()` and `dispose()` remove all three, even on an engine that never loaded, so call them only to end the engine's life.

**Worker failure:** `loadMap()` rejects with `WorkerStartError` when the Worker fails before it acknowledges `BOOTSTRAP` (its script did not load, or it threw during start). The retry rule above applies: the engine starts a new Worker for the next `loadMap()`.

```typescript
try {
  await engine.loadMap(config)
} catch (err) {
  await engine.loadMap(correctedConfig) // safe to retry, no destroy() needed
}
```

**Ignored colors (Experimental):** A bitmap color with no entry in `sectors.json` raises one console warning per color on each load. List the colors that are not sectors, such as the sea or the background, in `ignoredColors: ['ffffff', '000000']` to silence them. They load as void and cannot be picked. A color that is also in `sectors.json` stays a sector.

---

#### `setTickRate(hz: number): void`

Configures the Worker-side simulation tick rate (`1 ≤ hz ≤ 240`, default `60`). Synchronous; throws if called after `loadMap()` has resolved. Must be set before the first `loadMap()` call if a non-default rate is needed.

---

#### `pick(point: { clientX: number; clientY: number }): Promise<PickResult | null>`

Resolves the sector under an arbitrary point via GPU index-texture readback — the sole sanctioned async signature break in the public API (needed because GPU readback and Worker coordination cannot be answered synchronously). Resolves `null` before a successful `loadMap()`, on a mesh-miss (point outside the map plane), or on a void/unregistered pixel.

---

#### `getSector(hexKey: string): SectorData | undefined`

Returns the `SectorData` for the given hex key, or `undefined` if the key is not in `sectors.json`.

Throws `"MapEngine: not loaded — call loadMap() first"` before load.
Throws `"MapEngine: destroyed"` after destroy on a fully-loaded engine.

---

#### `getSectorKeys(): string[]`

Returns all hex keys from `sectors.json`. Includes zero-pixel sectors; excludes bitmap-only colors.

Throws `"MapEngine: not loaded — call loadMap() first"` before load.
Throws `"MapEngine: destroyed"` after destroy on a fully-loaded engine.

---

#### `getSectorId(hexKey: string): number | undefined` (Experimental)

Returns the numeric sector id of a hex key — its index in `getSectorKeys()`. Returns `undefined` for a key that is not in `sectors.json`. Pass the id to `findPath`, `getAnchor`, and `getGroupBBox`.

Throws `"MapEngine: not loaded — call loadMap() first"` before load.
Throws `"MapEngine: destroyed"` after destroy on a fully-loaded engine.

#### `getSectorKey(id: number): string | undefined` (Experimental)

Returns the hex key of a numeric sector id, the inverse of `getSectorId()`. Returns `undefined` for an id that is not an index of `getSectorKeys()`.

Throws `"MapEngine: not loaded — call loadMap() first"` before load.
Throws `"MapEngine: destroyed"` after destroy on a fully-loaded engine.

#### `getBBox(id: string | number): [number, number, number, number]`

#### `getCentroid(id: string | number): [number, number]`

#### `getNeighbors(id: string): string[] | undefined` / `getNeighbors(id: number): number[]`

Synchronous spatial accessors — hex-key and numeric-sector-ID overloads are both supported. Served from Main-resident snapshots taken at bootstrap, so they remain synchronous even though the live registry has been transferred to the Worker. `getNeighbors` returns `undefined` for an unrecognized hex key; the numeric overload returns an empty array instead.

---

#### `setSectorColor(hexKey: string, color: string): void`

Writes a single entry in the GPU palette LUT (O(1) — no CPU pixel iteration, no full-texture re-upload) with any CSS color string (`"red"`, `"#3399ff"`, `"rgb(0,128,255)"`, etc.).

Emits `console.warn` and returns without throwing for unknown hex keys or zero-pixel sectors. Invalid CSS color strings do not throw.

Throws `"MapEngine: not loaded — call loadMap() first"` before load.
Throws `"MapEngine: destroyed"` after destroy on a fully-loaded engine.

---

#### `resetSectorColor(hexKey: string): void`

Restores a sector's palette entry to its original bitmap color.

Same warn/guard behavior as `setSectorColor`.

---

#### `registerMapMode(id: string, colors: Uint32Array): void`

Registers a named full-map palette — `colors` is a packed-RGB `Uint32Array` with one entry per sector, indexed by numeric sector ID (`getSectorKey(id)` and `getSectorId(hexKey)` map between the two). Synchronous; throws on a duplicate `id`, a `colors.length` mismatch against the sector count, or if called before `loadMap()` resolves.

#### `setMapMode(id: string): void`

Activates a registered map mode — swaps the entire GPU palette in one render submit. Synchronous; throws `Unknown map mode: <id>` for an unregistered id. Re-activating the already-current mode is a no-op (zero uniform writes, zero render submits).

```typescript
engine.registerMapMode('grayscale', grayscaleColors) // Uint32Array, one packed-RGB entry per sector
engine.setMapMode('grayscale')
```

---

#### `on(event, handler): void`

```typescript
engine.on('sectorClick', (result: PickResult) => void)
engine.on('sectorHover', (result: PickResult | null) => void)
engine.on('viewChange', (view: MapView) => void) // Experimental
```

Registers an event handler. **Exempt from the pre-load guard** — `on()` may be called before `loadMap()`, which is the recommended pattern for ensuring no events are missed.

Throws `"MapEngine: destroyed"` after destroy on a fully-loaded engine.

---

#### `off(event: 'sectorClick' | 'sectorHover' | 'viewChange', handler: Function): void`

Removes a previously registered handler by reference identity. No-op if the handler was never registered.

Same pre-load exemption and post-destroy guard as `on()`.

---

#### `onFrame(callback: FrameCallback): void` / `offFrame(callback: FrameCallback): void`

Registers/removes a callback fired at the top of every rendered frame with the frame's `dt` in milliseconds. Rendering is dirty-flag gated — frames only render (and these callbacks only fire) when something actually changed (pan/zoom, a color mutation, or a canvas resize).

---

#### `dispose(): Promise<void>`

Rejects all in-flight async calls with `MapInvalidatedError`, then tears down the Worker, WebGL renderer/geometry/material, and all DOM event listeners, and clears all event handlers, the frame callbacks, and the stored camera request. Idempotent — safe to call multiple times.

A `dispose()` during `loadMap()` rejects that load with `MapInvalidatedError`, tears down the partial renderer, stops the Worker, and returns the engine to the pre-load state, so `loadMap()` may be called again. This holds for a reload of a loaded engine too: the engine is not destroyed.

#### `destroy(): void`

Synchronous convenience wrapper that calls `dispose()` fire-and-forget. Never throws. It removes the handlers, the frame callbacks, and the stored camera request, as `dispose()` does.

**After a fully-loaded engine is destroyed/disposed**, the engine is permanently unusable — all method calls throw `"MapEngine: destroyed"`.

**After a partial failure** (i.e., `loadMap()` rejected before completing), `destroy()`/`dispose()` resets the engine to pre-load state without permanently destroying it. `loadMap()` may be called again, but you must register the handlers and the camera again, because the reset removes them.

---

#### `renderer` / `registry` (getters)

```typescript
engine.renderer // MapRenderer instance
engine.registry // SectorRegistry instance — @deprecated, see below
```

`renderer` exposes the `MapRenderer` for advanced use. Throws `"MapEngine: not loaded"` before load and `"MapEngine: destroyed"` after destroy.

`registry` is **`@deprecated`**: once the Worker bootstrap transfer has detached the registry's buffers, this getter throws `MapInvalidatedError`. Use `getSector`/`getSectorKeys`/`getBBox`/`getCentroid`/`getNeighbors` instead — those remain synchronous and are served from pre-transfer snapshots.

---

### Grand-strategy spatial primitives

These Worker-side primitives (shipped in `v0.0.6`) run off the main thread and index sectors by **numeric ID** — the dense `0..sectorCount-1` id space (`getSectorId()` and `getSectorKey()` map id ↔ hex key). Each `Promise`-returning method rejects with `MapInvalidatedError` if a concurrent `loadMap()`/`dispose()` invalidates it, and all guard with `"MapEngine: not loaded"` before load / `"MapEngine: destroyed"` after destroy.

#### Pathfinding (A\*)

```typescript
await engine.setTraversalCosts(costs) // Uint8Array, one cost per sector id
const path = await engine.findPath(startId, endId) // Uint16Array of sector ids
```

`setTraversalCosts(costs: Uint8Array): Promise<void>` transfers the buffer to the Worker (`costs.byteLength === 0` on Main once it resolves — pass a fresh allocation, never a sub-view). `findPath(startId: number, endId: number): Promise<Uint16Array>` runs A\* over the CSR adjacency graph and returns the sector-ID sequence; rejects with `CostsRequiredError` if costs were never set, or `PathNotFoundError` if the endpoints are not connected by traversable edges.

#### Hierarchical aggregation (groups)

```typescript
await engine.setParentMapping(mapping, maxGroups) // Uint16Array: sector id → group id (0xFFFF = excluded)
await engine.aggregateGroups()
const [minX, minY, maxX, maxY] = engine.getGroupBBox(groupId)
```

`setParentMapping(mapping: Uint16Array, maxGroups: number): Promise<void>` transfers the mapping to the Worker. `aggregateGroups(): Promise<void>` folds each group's member-sector bounding boxes into one aggregate bbox per group (rejects with `MappingRequiredError` if no mapping was set). `getGroupBBox(groupId: number)` reads the result synchronously from the Main-side snapshot.

#### Spatial anchors (label placement)

```typescript
await engine.computeAnchors()
const [x, y] = engine.getAnchor(sectorId) // bitmap pixel-space, guaranteed interior
```

`computeAnchors(): Promise<void>` computes a guaranteed-interior Pole-of-Inaccessibility (`polylabel`) anchor for every sector from its contour geometry. `getAnchor(sectorId: number)` reads it synchronously.

#### Dynamic group borders

```typescript
await engine.setParentMapping(mapping, maxGroups) // required at least once first
await engine.recomputeBorders()
const segments = engine.getBorderSegments() // Float32Array [x1,y1,x2,y2,...] or null
engine.setBordersVisible(false) // hide the drawn lines without recomputing
```

`recomputeBorders(): Promise<void>` extracts the group-perimeter line segments from the current `parentMapping` and uploads them to a managed GPU VBO drawn as `THREE.LineSegments` (rejects with `MappingRequiredError` if no mapping was set; does **not** require `aggregateGroups()`). Concurrent calls coalesce — at most two Worker computations run regardless of caller count, and coalesced callers share one resolution. `getBorderSegments(): Float32Array | null` returns a retained Main-side copy (`null` before the first resolution; `Float32Array(0)` for a zero-edge result). `setBordersVisible(visible: boolean)` toggles the drawn lines without recomputing or re-uploading — safe to call before any border exists (the choice is remembered and applied when borders are next built).

#### `project(x: number, y: number): [number, number]`

Projects a bitmap pixel-space coordinate to CSS screen-space (canvas-relative, top-left origin), honoring the live camera pan/zoom — e.g. to position a DOM label overlay at a `getAnchor()` point. A pure-number transform; no Three.js type crosses the boundary.

#### `getView(): MapView | null` (Experimental)

Returns the camera view in continuous bitmap pixels: `{ centerX, centerY, zoom }`, where `(0, 0)` is the top-left corner of the bitmap and `zoom: 1` is the initial "contain" fit. Returns `null` before `loadMap()` has resolved, and during a reload. Returns the clamped state. Throws `"MapEngine: destroyed"` after destroy on a fully-loaded engine.

#### `setView(view: Partial<MapView>): void` (Experimental)

Sets the camera. A field that you omit keeps its value (the live one after load, the initial fit before load). `zoom` clamps to [0.5, 20], and a center outside the bitmap clamps to the pan bound. Before `loadMap()` has resolved, the call stores one request (the last `setView()` or `fitBounds()` wins), and `loadMap()` applies it before the first frame; a retry of `loadMap()` after a failed load, with no `destroy()`, keeps it. Throws `RangeError` on a non-finite number, and `"MapEngine: destroyed"` after destroy on a fully-loaded engine. `dispose()` of an engine that never loaded clears the stored request.

#### `fitBounds(bbox: BBox, options?: FitBoundsOptions): void` (Experimental)

Frames a `[minX, minY, maxX, maxY]` box of inclusive pixel indices — the tuple that `getBBox()` and `getGroupBBox()` return — so that the whole box is visible and centered. Zoom clamps to [0.5, 20], so a box of about one pixel or a large `padding` does not fill the canvas. `options.padding` keeps CSS pixels clear on each side (default 0). `options.keepOnResize` fits the box again on each canvas resize, until the next user pan or zoom, `setView()`, or `fitBounds()` (default `false`). The edge rules of `setView()` hold, and a bbox with `min > max` (such as the sentinel bbox of a sector with no pixels) or a negative `padding` throws `RangeError`. `options.fit` (Experimental, default `'contain'`): `'cover'` fills the canvas on both axes and may move part of the box out of view. With `padding`, `'cover'` keeps that margin clear on one axis, so a band of that width stays; the bitmap is never cropped, and pan reaches it. A canvas that is very narrow can reach the zoom limit of 20 and keep a band. An unknown `fit` throws `RangeError`.

---

### Types

```typescript
interface MapConfig {
  bitmapUrl: string // URL or path to sectors.png
  definitionUrl: string // URL or path to sectors.json
  canvas: HTMLCanvasElement
  ignoredColors?: string[] // Experimental
}

interface PickResult {
  hexKey: string // e.g. "820030"
  sectorData: SectorData // the matched sectors.json entry
  pixelX: number // bitmap pixel X (0-based, within bitmap bounds)
  pixelY: number // bitmap pixel Y (0-based, within bitmap bounds)
}

type SectorData = {
  name: string
  [key: string]: unknown // your domain fields
}

type MapModeId = string

// Experimental
type BBox = readonly [number, number, number, number]

// Experimental
interface MapView {
  centerX: number // X of the canvas center; 0 is the left edge of the bitmap
  centerY: number // Y of the canvas center; 0 is the top edge of the bitmap
  zoom: number // 1 is the initial fit of the whole bitmap; clamped to [0.5, 20]
}

// Experimental
interface FitBoundsOptions {
  padding?: number // CSS pixels kept clear on each side; default 0
  keepOnResize?: boolean // fit again on each resize until a user pan or zoom; default false
  fit?: 'contain' | 'cover' // 'cover' fills the canvas and may crop the box from view; default 'contain'
}
```

### Events

| Event         | Handler signature                        | Fires when                                                                                                  |
| ------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `sectorClick` | `(result: PickResult) => void`           | User clicks a defined sector                                                                                |
| `sectorHover` | `(result: PickResult \| null) => void`   | Hover sector changes; `null` when pointer leaves the map or lands on an undefined color                     |
| `viewChange`  | `(view: MapView) => void` (Experimental) | The first rendered frame, and each rendered frame in which the camera view changed (at most once per frame) |

`sectorHover` fires only on sector identity change, not on every `pointermove`. When the pointer moves from one sector to another, exactly one `sectorHover` is emitted. When the pointer leaves the map plane or enters an unregistered color, `sectorHover` emits `null`.

### Canonical errors

| Error                      | Thrown when                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MapInvalidatedError`      | An in-flight async call (`findPath`, etc.) is invalidated by a concurrent `loadMap()` or `dispose()`, a `loadMap()` is cancelled by `dispose()`, or a consumer reads the deprecated `registry` getter after bootstrap transfer |
| `WorkerStartError`         | `loadMap()` finds that the Worker failed before it acknowledged `BOOTSTRAP`: its script did not load, or it threw during start                                                                                                 |
| `WebGL2NotSupportedError`  | The canvas's WebGL context does not support WebGL2 (required for the index-texture picking/palette pipeline)                                                                                                                   |
| `SectorLimitExceededError` | The bitmap defines more than 65,534 distinct sectors                                                                                                                                                                           |
| `ModeNotReadyError`        | `registerMapMode`/`setMapMode` called before `loadMap()` resolves                                                                                                                                                              |
| `MappingRequiredError`     | `aggregateGroups()` / `recomputeBorders()` (or `getGroupBBox`) called before `setParentMapping()` / `aggregateGroups()` has resolved                                                                                           |
| `PathNotFoundError`        | `findPath()` cannot connect the two sectors through traversable edges                                                                                                                                                          |
| `CostsRequiredError`       | `findPath()` called before `setTraversalCosts()` has resolved at least once                                                                                                                                                    |

### Camera controls

| Interaction            | Behavior          |
| ---------------------- | ----------------- |
| Middle-click drag      | Pan               |
| Scroll wheel           | Zoom (0.5× – 20×) |
| One-finger touch drag  | Pan               |
| Two-finger touch pinch | Zoom (0.5× – 20×) |

Initial view fits the entire bitmap ("contain" strategy, preserving aspect ratio). Pan is bounded to the bitmap extents + 10% margin. When the canvas CSS size changes (e.g. browser resize), the engine updates the draw buffer and camera frustum in the same rAF frame — the map stays at the same pixel scale and the viewport boundary grows or shrinks around it, unless the last camera call was `fitBounds()` with `keepOnResize: true`. A consumer container taller or narrower than the bitmap shows bands (the clear color is black) under the default 'contain' framing.

The camera can also be driven from code (Experimental): `getView()`, `setView()`, and `fitBounds()`. A call before `loadMap()` resolves is applied before the first frame, so a consumer can frame a region with no flash of the whole map. For example, one region from its sector, after load:

```typescript
await engine.loadMap(config)
engine.fitBounds(engine.getBBox('820030'), { padding: 16, keepOnResize: true })
```

Before load, pass a literal bbox from your own data, because `getBBox()` needs a loaded engine:

```typescript
engine.fitBounds([120, 80, 260, 190], { padding: 16, keepOnResize: true })
await engine.loadMap(config)
```

To fill a tall or narrow frame with no bands, pass the literal bbox of your bitmap (the engine has no size getter) and `fit: 'cover'`. The bitmap is not cropped, and the camera keeps the fill across a resize:

```typescript
engine.fitBounds([0, 0, 1279, 719], { fit: 'cover', keepOnResize: true })
```

## Canvas setup

The canvas must be in the DOM with non-zero CSS dimensions before calling `loadMap()`:

```typescript
canvas.style.width = '800px'
canvas.style.height = '600px'
document.body.appendChild(canvas)
await engine.loadMap({ bitmapUrl, definitionUrl, canvas })
```

`map-engine` does not restyle the canvas element — CSS sizing is your responsibility. After `loadMap()` resolves, the engine automatically tracks canvas size changes via the rAF loop and updates the WebGL draw buffer and camera frustum accordingly. The map appears at a fixed pixel scale; a larger canvas reveals more, a smaller canvas crops.

For touch input, set `canvas.style.touchAction = 'none'` yourself. Without it the browser takes the gesture for page scroll or zoom and cancels the pointer, so the map neither pans nor zooms.

## Deployment note (CORS)

When bitmap or definition assets are hosted on a different origin, the asset server must send `Access-Control-Allow-Origin` headers. Standard `fetch` CORS semantics apply — the browser will block cross-origin requests without proper headers. In some browsers, `getImageData()` on a tainted canvas may throw a `SecurityError`. This is an operational deployment concern, not an engine bug.

The engine requires no special cross-origin-isolation headers (no COOP/COEP) for its own operation — Worker communication uses Transferable `ArrayBuffer`s, never `SharedArrayBuffer`, so it runs on any zero-config static host (GitHub Pages, Netlify, itch.io, etc.).

## Canonical example

The `example/` directory is a permanent part of the repository — a vanilla TypeScript Vite app that exercises every public API surface and serves as the primary browser-based development tool.

```bash
npm run example   # example app at localhost:3000
npm run dev       # vitest watcher
```

The example demonstrates:

- `MapEngine` instantiation, `loadMap()`, and `destroy()` / reload
- `sectorHover` — transient highlight with `setSectorColor` / `resetSectorColor`
- `sectorClick` — persistent selection, plus `getBBox`/`getCentroid`/`getNeighbors` in the Advanced panel
- `getSectorKeys()` / `getSector()` — sector enumeration in the sidebar
- `registerMapMode()` / `setMapMode()` — a Map Modes panel toggling between palettes
- `setTraversalCosts()` / `findPath()` — a Pathfinding panel drawing A\* routes between two clicked sectors
- `setParentMapping()` / `aggregateGroups()` / `getGroupBBox()` — a Regions panel visualizing aggregated group bounds
- `computeAnchors()` / `getAnchor()` / `project()` — an Anchors panel placing DOM labels at guaranteed-interior points
- `recomputeBorders()` / `getBorderSegments()` / `setBordersVisible()` — a Borders panel toggling group-perimeter lines
- `on()` / `off()` — live unsubscribe toggle for the hover handler
- `toHexKey()` — round-trip verification on load
- `getView()` / `setView()` / `fitBounds()` / `viewChange` — a Camera panel that frames the selected sector with padding, resets the zoom, and shows the live view
- `ignoredColors` — a comment at `loadMap()` only, because the example bitmap has no void color

The example assets (`example/public/map.png`, `example/public/sectors.json`) are committed static files. The bitmap is a 5680×4635 PNG of the Maritime provinces of Canada, with 36 sectors, one for each county. Its white and black pixels belong to no sector.

**The example must be kept in sync with every API change.** If a public method signature changes, the example is the first place to update.

## Development

```bash
npm run example           # example app (localhost:3000, HMR)
npm run dev               # vitest watcher
npm run build             # vite build + tsc + dist consumer check (outputs dist/index.js)
npm run build:example     # vite build for the example app
npm run typecheck         # tsc --noEmit (root library)
npm run typecheck:example # tsc --noEmit (example workspace)
npm run format            # prettier --write .
npm run size              # build, then gzip the entry and the worker together (16341 bytes)
npm run test              # run full test suite (vitest run)
```

## Architecture

| Module               | Role                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `SectorBitmapParser` | Loads PNG URL or Blob → raw RGBA pixel buffer. Worker-safe (zero DOM deps).                                                  |
| `SectorRegistry`     | Two O(W×H) passes → hex-key map, SoA bboxes/centroids/CSR adjacency/contours. Zero Three.js imports.                         |
| `InputController`    | Owns pan/zoom/pick pointer events. Main-thread only.                                                                         |
| `MapRenderer`        | Three.js scene: `OrthographicCamera`, GPU fragment-LUT palette shader, pan/zoom, dirty-flag render gating. Main-thread only. |
| `MapEngine`          | Public facade — owns the Worker lifecycle and wires all modules together.                                                    |

ESM only. No UMD or CJS bundles. `SectorBitmapParser` and `SectorRegistry` have zero DOM global references and are Worker-safe by construction — `MapEngine` relies on exactly this property to run the registry inside its own internal Worker after the initial Main-thread parse/scan.

As of this release, `MapEngine.loadMap()` automatically transfers the registry into a dedicated Web Worker (Off-Main-Thread architecture) — no manual Worker wiring is required or possible; `loadMap()` takes URLs, not a pre-built registry. `SectorBitmapParser`/`SectorRegistry` remain separately exported (Advanced tier) for consumers building their own custom pipelines outside `MapEngine`.

## UV coordinate system note

Three.js UV coordinates have their origin at the bottom-left of the texture, but image/bitmap coordinates have their origin at the top-left. When building custom overlay systems on top of the engine, apply the following inversion when converting UV to bitmap pixel coordinates:

```typescript
const pixelX = Math.max(0, Math.min(width - 1, Math.floor(uv.x * width)))
const pixelY = Math.max(
  0,
  Math.min(height - 1, Math.floor((1 - uv.y) * height))
)
//                                                              ^^^^^^^^^^
//                                    Y-inversion: Three.js UV origin is bottom-left
```

Omitting the `(1 - uv.y)` inversion causes the top and bottom halves of the map to swap identities.

## Known limitations

These are documented constraints in the current version. See the Future work section below for planned mitigations.

**Main-thread bitmap parse + registry construction:**
`SectorBitmapParser.parse()` and the `SectorRegistry` O(W×H) scan both still run on the Main thread inside `loadMap()`, before the registry is transferred to the Worker. There is no built-in mitigation yet — the Worker relocation shipped in this release only covers post-construction state and computation, not the initial parse/scan.

The scan half is measured (`npm run bench:registry-alloc`; figures and method in `bench/baselines.json` under `b1.registry_scan`). At 4096×4096 with **every** pixel assigned to a sector — an upper bound, since real maps carry void pixels — the scan takes **~1.9 s at 1,000 sectors and ~3.2 s at 10,000** on the recorded hardware, a 2011-era Intel i5-2520M under container contention. Faster hardware will be substantially quicker; the point is the order of magnitude, not the number. Both measured points are 4096×4096 and differ only in sector count, so what they establish is that sector count matters far less than pixel count. The scan is a per-pixel loop, so an 8192×4096 bitmap should be expected to roughly double the time; that inference comes from the loop's shape, not from these two points, and the peak footprint doubles with it, which can push the curve past linear once paging starts.

Decode is additional to that figure and is measured separately (`test/DecodePerf.gl.spec.ts`, recorded under `b4.decode`) — it runs in browser mode because `createImageBitmap` and `OffscreenCanvas` do not exist in the Node harness. On the same fixture and hardware, `SectorBitmapParser.parse()` takes **~320 ms**, of which the PNG decode itself is only ~80 ms; the remaining ~225 ms is reading the pixels back out through an `OffscreenCanvas` 2D context.

**Total main-thread map load** at 4096×4096 on that hardware is therefore roughly **2.1 s at 1,000 sectors and 3.3 s at 10,000**, worst case.

**Mobile heap budget:**
At the 4096×4096 mobile size cap, the `SectorRegistry` scan retains **~125 MiB at 1,000 sectors and ~188 MiB at 10,000** (resident-set delta, post-GC). It is dominated by `pixelIndices` (64 MiB) and the `pixelIndicesMirror` context-loss recovery copy (32 MiB), both pixel-proportional and fixed; the rest is CSR adjacency and contour data, which scales with total border length. `sourceBuffer` is disposed immediately after `pixelIndices` extraction and is not part of that total.

**A full `loadMap()` retains more than the scan does.** `ThreeRenderBackend` keeps its own `pixelIndices.slice()` to back the index texture — a second 64 MiB copy — and `MapEngine` keeps four smaller proxy snapshots. Budget at least 64 MiB on top of the figures above.

Two caveats on those numbers. They are an upper bound **with respect to void coverage only**: the benchmark fixture assigns every pixel to a sector, but its jittered tile grid fixes border topology rather than bounding it, so a map with more fragmented sectors at the same dimensions can exceed the adjacency/contour component. And the scan's _allocated_ ArrayBuffer bytes run higher than its resident bytes at 10,000 sectors (260 MiB allocated vs 226 MiB resident) — `borderEdges` is allocated zero-filled and never written until borders are recomputed, so those pages are not faulted in until used.

Peak allocation _during_ the scan is considerably higher than what it retains — roughly 407 MiB and 779 MiB above baseline at the two sector counts. Plan capacity against the peak, not the retained figure.

The sizing table in `docs/archive/ROADMAP.md` §12.3, now in the legacy snapshot (`log/artifacts/ca024dad78fe1c4c8a41bbddb88209ab6c451bd3b98a461c1070752df1a95867.tar.gz`), predates these measurements and is a superseded historical estimate. The snapshot is frozen and is not updated.

**`gl.MAX_TEXTURE_SIZE` hardware cap (bitmap dimensions):**
The main index texture cannot exceed the device's `gl.MAX_TEXTURE_SIZE` limit — commonly 4096 px on mobile GPUs and 8192 px on desktop. A bitmap exceeding this limit throws a fatal WebGL error. The engine does not query or tile around this limit for the index texture (the GPU palette LUT itself does 2D-wrap automatically past `MAX_TEXTURE_SIZE` sector counts — a separate, already-solved constraint). If targeting mobile, keep bitmaps within 4096×4096.

**Sector count cap:**
Maximum 65,534 distinct sectors per map (`SectorLimitExceededError` beyond that) — `0xFFFF` is reserved as the internal "no sector" sentinel.

**Single map instance assumption:**
Multiple simultaneous `MapEngine` instances sharing a canvas, or managing multiple canvases independently, are not a tested configuration.

**No left-drag pan for a mouse or a trackpad:**
A mouse pans with middle-click drag only. A left-button drag does not pan; it suppresses the click that follows it.

## What this version does not include

The following are explicitly out of scope for the current release:

- River layer or heightmap rendering
- CSV definition format — JSON only
- Built-in UI controls, tooltips, or legend components
- SSR / Node.js support
- Multiple simultaneous map instances
- UMD / CommonJS bundles — ESM only
- React or any framework integration layer
- `gl.MAX_TEXTURE_SIZE` querying or texture tiling for the main index texture

## Future work

This release (`v0.0.7`) made map-load cost measurable and then reduced it: the registry scan is 4–6× faster, the per-sector pixel arrays it used to retain are gone, and both halves of load — decode and scan — now have recorded figures in `bench/baselines.json` rather than estimates.

Uncommitted directions live in `docs/vision.md` §"Open directions", now in the legacy snapshot (`log/artifacts/ca024dad78fe1c4c8a41bbddb88209ab6c451bd3b98a461c1070752df1a95867.tar.gz`) — framework bindings, a modding script boundary, group-scope palettes, and moving map load into the Worker. That last one was the presumed next step before this release; the measurements weakened its case, and the reasoning is recorded there. The frozen historical roadmap (`docs/archive/ROADMAP.md`, in the same snapshot) sketched some of these originally and is kept only for provenance.

## Bundle size

```bash
npm run build && npm run size
```

The script prints the gzipped size of `dist/index.js` and the worker chunk in `dist/assets` together: 16341 bytes at this release. If the size is far above that, verify that `rollupOptions.external: ['three']` is present in `vite.config.ts`. Omitting it bundles the entire Three.js library (~600 KB gzipped) and silently fails the size check.
