# map-engine

A lightweight, browser-native TypeScript library for rendering interactive Paradox-style grand strategy maps using Three.js.

Inspired by the Clausewitz/Jomini engine pipeline (EU4, HOI4, CK3): a 24-bit RGB-coded province bitmap as the source of spatial truth, linked to structured data via color-as-identifier. This library brings the same conceptual approach to the open web using browser-native APIs.

## What it does

1. Ingests a PNG bitmap where every pixel's RGB value encodes a **sector** identity
2. Builds an in-memory spatial registry from the bitmap and a JSON definition file, then transfers it into a dedicated Web Worker (Off-Main-Thread architecture) so simulation-side work never blocks rendering
3. Renders the map via Three.js using a GPU palette-shader pipeline (instant, zero-CPU-iteration recoloring), with pan/zoom and typed `sectorClick` / `sectorHover` events, plus async `pick()` for on-demand lookups
4. Provides Worker-side grand-strategy spatial primitives — A\* pathfinding, hierarchical (group) bbox aggregation, guaranteed-interior label anchors, and dynamic group-perimeter border rendering — all returning to the main thread via zero-GC Transferable handoffs

**Bundle size:** < 15 KB gzipped (Three.js is a peer dependency — not bundled)

## Requirements

- Browser only — no Node.js, no SSR
- Required browser APIs: **WebGL2**, `OffscreenCanvas`, `createImageBitmap`, `Worker`, Fetch, `HTMLCanvasElement`, `requestAnimationFrame`
- Peer dependency: `three@^0.160.0`

## Stability

| Tier             | Exports                                                                                                                       | Contract                                                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primary**      | `MapEngine`, `MapConfig`, `PickResult`, `SectorData`, `SectorBBox`, `SectorDefinitionFile`, `MapModeId`                       | Stable. Removals and signature changes are breaking.                                                                                                                                                                                                                                     |
| **Advanced**     | `SectorRegistry`, `SectorBitmapParser`, `toHexKey`, canonical errors (`MapInvalidatedError`, `WebGL2NotSupportedError`, etc.) | Stable.                                                                                                                                                                                                                                                                                  |
| **Experimental** | Exports marked `@experimental` or `@deprecated` (currently: `BorderEdge` type, `SectorRegistry.borderEdges` raw buffer)       | No stability guarantee. Group-perimeter border _rendering_ shipped in `v0.0.6` via `recomputeBorders()` / `getBorderSegments()` (see API below); the deprecated `BorderEdge` type and the raw `SectorRegistry.borderEdges` allocation are legacy internal buffers, not that public path. |

The project is in early development (`v0.0.y`). All releases increment the patch version only.

## Installation

```bash
npm install three@^0.160.0
# map-engine is not yet published; install from source
```

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

**Constructor:** Takes no arguments. Spins up a dedicated Web Worker immediately (Off-Main-Thread architecture) — the Worker only becomes active once `loadMap()` bootstraps it.

```typescript
const engine = new MapEngine()
```

---

#### `loadMap(config: MapConfig): Promise<void>`

Loads the bitmap and definition concurrently on the Main thread, builds the spatial registry, then transfers it to the Worker in a single `BOOTSTRAP` message (Transferable `ArrayBuffer`s — no `SharedArrayBuffer`, no special hosting headers required). Resolves when the Worker has acknowledged bootstrap and the map is fully loaded and interactive.

**Guards (checked in this order):**

1. Throws `"MapEngine: destroyed"` if `dispose()`/`destroy()` was already called on a fully-loaded engine
2. Throws `"MapEngine: loadMap() is already in progress"` on concurrent calls

**Reload:** Calling `loadMap()` again on an already-loaded engine is a supported reload — it invalidates the previous session (rejecting any in-flight async calls with `MapInvalidatedError`), tears down the old Worker/renderer, and re-bootstraps against the new map.

**Rejection and retry:** If `loadMap()` rejects (network error, parse error, etc.) before ever completing, the engine is not permanently destroyed. Call `destroy()` to reset, then retry `loadMap()` with corrected inputs.

```typescript
try {
  await engine.loadMap(config)
} catch (err) {
  engine.destroy() // reset to pre-load state
  await engine.loadMap(correctedConfig) // safe to retry
}
```

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

Registers a named full-map palette — `colors` is a packed-RGB `Uint32Array` with one entry per sector, indexed by numeric sector ID (`SectorRegistry.idToHex` gives the ID↔hex-key mapping order). Synchronous; throws on a duplicate `id`, a `colors.length` mismatch against the sector count, or if called before `loadMap()` resolves.

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
```

Registers an event handler. **Exempt from the pre-load guard** — `on()` may be called before `loadMap()`, which is the recommended pattern for ensuring no events are missed.

Throws `"MapEngine: destroyed"` after destroy on a fully-loaded engine.

---

#### `off(event: 'sectorClick' | 'sectorHover', handler: Function): void`

Removes a previously registered handler by reference identity. No-op if the handler was never registered.

Same pre-load exemption and post-destroy guard as `on()`.

---

#### `onFrame(callback: FrameCallback): void` / `offFrame(callback: FrameCallback): void`

Registers/removes a callback fired at the top of every rendered frame with the frame's `dt` in milliseconds. Rendering is dirty-flag gated — frames only render (and these callbacks only fire) when something actually changed (pan/zoom, a color mutation, or a canvas resize).

---

#### `dispose(): Promise<void>`

Rejects all in-flight async calls with `MapInvalidatedError`, then tears down the Worker, WebGL renderer/geometry/material, and all DOM event listeners, and clears all event handlers. Idempotent — safe to call multiple times.

#### `destroy(): void`

Synchronous convenience wrapper that calls `dispose()` fire-and-forget. Never throws.

**After a fully-loaded engine is destroyed/disposed**, the engine is permanently unusable — all method calls throw `"MapEngine: destroyed"`.

**After a partial failure** (i.e., `loadMap()` rejected before completing), `destroy()`/`dispose()` resets the engine to pre-load state without permanently destroying it. `loadMap()` may be called again.

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

These Worker-side primitives (shipped in `v0.0.6`) run off the main thread and index sectors by **numeric ID** — the dense `0..sectorCount-1` id space (`SectorRegistry.idToHex` maps id ↔ hex key). Each `Promise`-returning method rejects with `MapInvalidatedError` if a concurrent `loadMap()`/`dispose()` invalidates it, and all guard with `"MapEngine: not loaded"` before load / `"MapEngine: destroyed"` after destroy.

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

---

### Types

```typescript
interface MapConfig {
  bitmapUrl: string // URL or path to sectors.png
  definitionUrl: string // URL or path to sectors.json
  canvas: HTMLCanvasElement
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
```

### Events

| Event         | Handler signature                      | Fires when                                                                              |
| ------------- | -------------------------------------- | --------------------------------------------------------------------------------------- |
| `sectorClick` | `(result: PickResult) => void`         | User clicks a defined sector                                                            |
| `sectorHover` | `(result: PickResult \| null) => void` | Hover sector changes; `null` when pointer leaves the map or lands on an undefined color |

`sectorHover` fires only on sector identity change, not on every `pointermove`. When the pointer moves from one sector to another, exactly one `sectorHover` is emitted. When the pointer leaves the map plane or enters an unregistered color, `sectorHover` emits `null`.

### Canonical errors

| Error                      | Thrown when                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MapInvalidatedError`      | An in-flight async call (`pick`, etc.) is invalidated by a concurrent `loadMap()` or `dispose()`, or a consumer reads the deprecated `registry` getter after bootstrap transfer |
| `WebGL2NotSupportedError`  | The canvas's WebGL context does not support WebGL2 (required for the index-texture picking/palette pipeline)                                                                    |
| `SectorLimitExceededError` | The bitmap defines more than 65,534 distinct sectors                                                                                                                            |
| `ModeNotReadyError`        | `registerMapMode`/`setMapMode` called before `loadMap()` resolves                                                                                                               |
| `MappingRequiredError`     | `aggregateGroups()` / `recomputeBorders()` (or `getGroupBBox`) called before `setParentMapping()` / `aggregateGroups()` has resolved                                            |
| `PathNotFoundError`        | `findPath()` cannot connect the two sectors through traversable edges                                                                                                           |
| `CostsRequiredError`       | `findPath()` called before `setTraversalCosts()` has resolved at least once                                                                                                     |

### Camera controls

| Interaction       | Behavior          |
| ----------------- | ----------------- |
| Middle-click drag | Pan               |
| Scroll wheel      | Zoom (0.5× – 20×) |

Initial view fits the entire bitmap ("contain" strategy, preserving aspect ratio). Pan is bounded to the bitmap extents + 10% margin. When the canvas CSS size changes (e.g. browser resize), the engine updates the draw buffer and camera frustum in the same rAF frame — the map stays at the same pixel scale and the viewport boundary grows or shrinks around it.

## Canvas setup

The canvas must be in the DOM with non-zero CSS dimensions before calling `loadMap()`:

```typescript
canvas.style.width = '800px'
canvas.style.height = '600px'
document.body.appendChild(canvas)
await engine.loadMap({ bitmapUrl, definitionUrl, canvas })
```

`map-engine` does not restyle the canvas element — CSS sizing is your responsibility. After `loadMap()` resolves, the engine automatically tracks canvas size changes via the rAF loop and updates the WebGL draw buffer and camera frustum accordingly. The map appears at a fixed pixel scale; a larger canvas reveals more, a smaller canvas crops.

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

The example assets (`example/public/map.png`, `example/public/sectors.json`) are committed static files. The bitmap is a 320×240 RGB map with 8 adjacent sectors — no void gaps, matching real Paradox-style province bitmap conventions.

**The example must be kept in sync with every API change.** If a public method signature changes, the example is the first place to update.

## Development

```bash
npm run example           # example app (localhost:3000, HMR)
npm run dev               # vitest watcher
npm run build             # tsc + vite build (outputs dist/index.js)
npm run build:example     # vite build for the example app
npm run typecheck         # tsc --noEmit (root library)
npm run typecheck:example # tsc --noEmit (example workspace)
npm run format            # prettier --write .
npm run size              # gzip -c dist/index.js | wc -c  (verify < 15 KB)
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

As of this release, `MapEngine.loadMap()` automatically transfers the registry into a dedicated Web Worker (Off-Main-Thread architecture) — no manual Worker wiring is required or possible; `loadMap()` only accepts `bitmapUrl`/`definitionUrl`, not a pre-built registry. `SectorBitmapParser`/`SectorRegistry` remain separately exported (Advanced tier) for consumers building their own custom pipelines outside `MapEngine`.

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

Decode is **not** covered by that figure. The benchmark harness runs in Node, where `createImageBitmap` and `OffscreenCanvas` do not exist, so `SectorBitmapParser`'s cost is still unquantified and is additional to the above.

**Mobile heap budget:**
At the 4096×4096 mobile size cap, the `SectorRegistry` scan retains **~125 MiB at 1,000 sectors and ~188 MiB at 10,000** (resident-set delta, post-GC). It is dominated by `pixelIndices` (64 MiB) and the `pixelIndicesMirror` context-loss recovery copy (32 MiB), both pixel-proportional and fixed; the rest is CSR adjacency and contour data, which scales with total border length. `sourceBuffer` is disposed immediately after `pixelIndices` extraction and is not part of that total.

**A full `loadMap()` retains more than the scan does.** `ThreeRenderBackend` keeps its own `pixelIndices.slice()` to back the index texture — a second 64 MiB copy — and `MapEngine` keeps four smaller proxy snapshots. Budget at least 64 MiB on top of the figures above.

Two caveats on those numbers. They are an upper bound **with respect to void coverage only**: the benchmark fixture assigns every pixel to a sector, but its jittered tile grid fixes border topology rather than bounding it, so a map with more fragmented sectors at the same dimensions can exceed the adjacency/contour component. And the scan's _allocated_ ArrayBuffer bytes run higher than its resident bytes at 10,000 sectors (260 MiB allocated vs 226 MiB resident) — `borderEdges` is allocated zero-filled and never written until borders are recomputed, so those pages are not faulted in until used.

Peak allocation _during_ the scan is considerably higher than what it retains — roughly 407 MiB and 779 MiB above baseline at the two sector counts. Plan capacity against the peak, not the retained figure.

The sizing table in `docs/archive/ROADMAP.md` §12.3 predates these measurements and is a superseded historical estimate; `docs/archive/` is frozen and is not updated.

**`gl.MAX_TEXTURE_SIZE` hardware cap (bitmap dimensions):**
The main index texture cannot exceed the device's `gl.MAX_TEXTURE_SIZE` limit — commonly 4096 px on mobile GPUs and 8192 px on desktop. A bitmap exceeding this limit throws a fatal WebGL error. The engine does not query or tile around this limit for the index texture (the GPU palette LUT itself does 2D-wrap automatically past `MAX_TEXTURE_SIZE` sector counts — a separate, already-solved constraint). If targeting mobile, keep bitmaps within 4096×4096.

**Sector count cap:**
Maximum 65,534 distinct sectors per map (`SectorLimitExceededError` beyond that) — `0xFFFF` is reserved as the internal "no sector" sentinel.

**Single map instance assumption:**
Multiple simultaneous `MapEngine` instances sharing a canvas, or managing multiple canvases independently, are not a tested configuration.

**No touch input:**
Camera controls are mouse/wheel only (middle-click drag to pan, scroll wheel to zoom) — no tap or pinch-to-zoom handling.

## What this version does not include

The following are explicitly out of scope for the current release:

- River layer or heightmap rendering
- CSV definition format — JSON only
- Built-in UI controls, tooltips, or legend components
- SSR / Node.js support
- Multiple simultaneous map instances
- Touch event support (tap, pinch-to-zoom)
- UMD / CommonJS bundles — ESM only
- React or any framework integration layer
- `gl.MAX_TEXTURE_SIZE` querying or texture tiling for the main index texture

## Future work

This release (`v0.0.6`) shipped the Worker-side grand-strategy primitives — pathfinding, hierarchical (group-level) aggregation, dynamic border rendering, and spatial anchoring — on top of the earlier Off-Main-Thread kernel. The now-frozen historical roadmap (`docs/archive/ROADMAP.md`) sketched framework bindings, a modding script boundary, and group-scope palettes as possible future directions; none are committed.

## Bundle size

```bash
npm run build && npm run size
```

If the size far exceeds 15 KB gzipped, verify that `rollupOptions.external: ['three']` is present in `vite.config.ts`. Omitting it bundles the entire Three.js library (~600 KB gzipped) and silently fails the size check.
