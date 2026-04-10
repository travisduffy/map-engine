# map-engine

A lightweight, browser-native TypeScript library for rendering interactive Paradox-style grand strategy maps using Three.js.

Inspired by the Clausewitz/Jomini engine pipeline (EU4, HOI4, CK3): a 24-bit RGB-coded province bitmap as the source of spatial truth, linked to structured data via color-as-identifier. This library brings the same conceptual approach to the open web using browser-native APIs.

## What it does

1. Ingests a PNG bitmap where every pixel's RGB value encodes a **sector** identity
2. Builds an in-memory spatial registry from the bitmap and a JSON definition file
3. Renders the map via Three.js with pan/zoom, and emits typed `sectorClick` / `sectorHover` events

**Bundle size:** < 15 KB gzipped (Three.js is a peer dependency — not bundled)

## Requirements

- Browser only — no Node.js, no SSR
- Required browser APIs: `OffscreenCanvas`, `createImageBitmap`, Fetch, `HTMLCanvasElement`, `requestAnimationFrame`
- Peer dependency: `three@^0.160.0`

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

await engine.loadMap({
  bitmapUrl: '/assets/sectors.png',
  definitionUrl: '/assets/sectors.json',
  canvas,
})

// Repaint a sector with any CSS color string
engine.setSectorColor('820030', '#3399ff')

// Reset to original bitmap color
engine.resetSectorColor('820030')

// Cleanup (idempotent — safe to call multiple times)
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

Anti-aliased edge pixels introduce intermediate RGB colors not present in `sectors.json`. When the pointer lands on such a pixel, `getSectorAt()` returns the intermediate hex key, `getSector()` returns `undefined`, and the picking pipeline emits `sectorHover` with `null`. This produces null hover flicker along sector borders. The only fix is to regenerate the bitmap without anti-aliasing.

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

**Constructor:** Takes no arguments.

```typescript
const engine = new MapEngine()
```

---

#### `loadMap(config: MapConfig): Promise<void>`

Loads the bitmap and definition concurrently, then constructs the Three.js scene. Resolves when the map is fully loaded and interactive.

**Guards (checked in this order):**

1. Throws `"MapEngine: destroyed"` if `destroy()` was already called on a fully-loaded engine
2. Throws `"MapEngine: already loaded — call destroy() before loading a new map"` on double-call
3. Throws `"MapEngine: loadMap() is already in progress"` on concurrent calls

**Rejection and retry:** If `loadMap()` rejects (network error, parse error, etc.), the engine is not permanently destroyed. Call `destroy()` to reset, then retry `loadMap()` with corrected inputs.

```typescript
try {
  await engine.loadMap(config)
} catch (err) {
  engine.destroy() // reset to pre-load state
  await engine.loadMap(correctedConfig) // safe to retry
}
```

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

#### `setSectorColor(hexKey: string, color: string): void`

Overpaints all pixels of the sector with the given CSS color string (`"red"`, `"#3399ff"`, `"rgb(0,128,255)"`, etc.). Updates the WebGL texture immediately.

Emits `console.warn` and returns without throwing for unknown hex keys or zero-pixel sectors. Invalid CSS color strings do not throw.

Throws `"MapEngine: not loaded — call loadMap() first"` before load.
Throws `"MapEngine: destroyed"` after destroy on a fully-loaded engine.

---

#### `resetSectorColor(hexKey: string): void`

Restores all pixels of the sector to their original bitmap colors. The original `sourceBuffer` is never mutated — `resetSectorColor` always has the original pixel values available.

Same warn/guard behavior as `setSectorColor`.

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

#### `destroy(): void`

Cancels the `requestAnimationFrame` loop, disposes the WebGL renderer/geometry/material/texture, removes all DOM event listeners, and clears all event handlers.

**Never throws.** Second and subsequent calls are silent no-ops.

**After a fully-loaded engine is destroyed**, the engine is permanently unusable — all method calls throw `"MapEngine: destroyed"`.

**After a partial failure** (i.e., `loadMap()` rejected before completing), `destroy()` resets the engine to pre-load state without permanently destroying it. `loadMap()` may be called again.

---

#### `renderer` / `registry` (getters)

```typescript
engine.renderer // MapRenderer instance
engine.registry // SectorRegistry instance
```

Expose internal subsystems for advanced use. Both throw `"MapEngine: not loaded"` before load and `"MapEngine: destroyed"` after destroy.

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
```

### Events

| Event         | Handler signature                      | Fires when                                                                              |
| ------------- | -------------------------------------- | --------------------------------------------------------------------------------------- |
| `sectorClick` | `(result: PickResult) => void`         | User clicks a defined sector                                                            |
| `sectorHover` | `(result: PickResult \| null) => void` | Hover sector changes; `null` when pointer leaves the map or lands on an undefined color |

`sectorHover` fires only on sector identity change, not on every `pointermove`. When the pointer moves from one sector to another, exactly one `sectorHover` is emitted. When the pointer leaves the map plane or enters an unregistered color, `sectorHover` emits `null`.

### `borderEdges` (experimental)

```typescript
engine.registry.borderEdges // BorderEdge[]
```

> **@experimental** — shape may change in v2.

Array of pixel-boundary edges between adjacent sectors. Each `BorderEdge` has:

```typescript
interface BorderEdge {
  x: number
  y: number
  direction: 'h' | 'v'
  sectorA: string // hex key
  sectorB: string // hex key
}
```

**Direction label semantics** (counter-intuitive vs. geometric convention, but internally consistent):

- `'h'` — **horizontal scan** direction (the edge was found by looking at the right neighbor). This produces a **vertical boundary line** on screen.
- `'v'` — **vertical scan** direction (the edge was found by looking at the bottom neighbor). This produces a **horizontal boundary line** on screen.

The engine does not consume `borderEdges` internally — it is provided for consumers building their own border overlay rendering.

### Camera controls

| Interaction  | Behavior          |
| ------------ | ----------------- |
| Pointer drag | Pan               |
| Scroll wheel | Zoom (0.5× – 20×) |

Initial view fits the entire bitmap ("contain" strategy, preserving aspect ratio). Pan is bounded to the bitmap extents + 10% margin.

## Canvas setup

The canvas must be in the DOM with non-zero CSS dimensions before calling `loadMap()`:

```typescript
canvas.style.width = '800px'
canvas.style.height = '600px'
document.body.appendChild(canvas)
await engine.loadMap({ bitmapUrl, definitionUrl, canvas })
```

`map-engine` does not resize or restyle the canvas element — CSS sizing is your responsibility. Canvas resize after construction is not handled in v1.

## Deployment note (CORS)

When bitmap or definition assets are hosted on a different origin, the asset server must send `Access-Control-Allow-Origin` headers. Standard `fetch` CORS semantics apply — the browser will block cross-origin requests without proper headers. In some browsers, `getImageData()` on a tainted canvas may throw a `SecurityError`. This is an operational deployment concern, not an engine bug.

## Canonical example

The `example/` directory is a permanent part of the repository — a vanilla TypeScript Vite app that exercises every public API surface and serves as the primary browser-based development tool.

```bash
npm run example   # example app at localhost:3000
npm run dev       # vitest watcher
```

The example demonstrates:

- `MapEngine` instantiation, `loadMap()`, and `destroy()` / reload
- `sectorHover` — transient highlight with `setSectorColor` / `resetSectorColor`
- `sectorClick` — persistent selection with toggle deselect
- `getSectorKeys()` / `getSector()` — sector enumeration in the sidebar
- `engine.registry.bboxes` / `.centroids` / `.pixelIndices` — spatial data display
- `on()` / `off()` — live unsubscribe toggle for the hover handler
- `toHexKey()` — round-trip verification on load

The example assets (`example/public/example-map.png`, `example/public/sectors.json`) are committed and generated once via `node example/generate-map.js`. The bitmap is a 320×240 RGB map with 8 adjacent sectors — no void gaps, matching real Paradox-style province bitmap conventions.

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

| Module               | Role                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `SectorBitmapParser` | Loads PNG URL or Blob → raw RGBA pixel buffer. Worker-safe (zero DOM deps).                                         |
| `SectorRegistry`     | Single O(W×H) scan → hex-key map, bboxes, centroids, pixel indices, border edges. Zero Three.js imports.            |
| `MapRenderer`        | Three.js scene: `OrthographicCamera`, `PlaneGeometry` + `CanvasTexture`, pan/zoom, color overlay. Main-thread only. |
| `MapEngine`          | Public facade wiring all modules.                                                                                   |

ESM only. No UMD or CJS bundles. `SectorBitmapParser` and `SectorRegistry` have zero DOM global references and are safe to use inside a Web Worker.

## Web Worker opt-in

`SectorBitmapParser` and `SectorRegistry` have zero DOM global references by design and are safe to instantiate inside a Web Worker. This lets you offload the O(W×H) scan pass off the main thread for large bitmaps.

```typescript
// worker.ts
import { SectorBitmapParser, SectorRegistry } from 'map-engine'

self.onmessage = async ({ data }) => {
  const { bitmapUrl, definition } = data
  const parser = new SectorBitmapParser()
  const { buffer, width, height } = await parser.parse(bitmapUrl)
  const registry = new SectorRegistry(buffer, width, height, definition)
  // Transfer the buffer back to avoid a copy
  self.postMessage({ buffer, width, height }, [buffer.buffer])
}
```

```typescript
// main.ts
const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module',
})
worker.postMessage({ bitmapUrl: '/assets/sectors.png', definition })
worker.onmessage = ({ data }) => {
  // Construct MapRenderer on the main thread with the transferred buffer
}
```

> **Note:** `MapRenderer` and `MapEngine` are main-thread only (they require `HTMLCanvasElement` and `requestAnimationFrame`). Worker wiring is not built into the v1 `MapEngine.loadMap()` call — this is a manual integration pattern for advanced use cases.

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

These are documented constraints in v1. See the Upgrade paths section for the planned v2 mitigations.

**Memory usage:**  
Three full-resolution pixel buffer copies are held in memory simultaneously: `sourceBuffer` (original bitmap RGBA), `displayImageData` (mutable overlay copy), and `pixelIndices` flat arrays per sector (`Uint32Array`), plus the GPU texture copy and `Map`/object overhead. For an 8192×4096 bitmap (~134 MB per buffer), realistic total RAM usage is **400–500 MB**. Plan capacity accordingly.

**Full texture re-upload on every `setSectorColor` call:**  
`setSectorColor` sets `texture.needsUpdate = true`, which triggers a full `texImage2D` re-upload of the entire texture on the next render frame — not a partial `texSubImage2D` update. For frequent color changes across many sectors this is expensive. The v2 shader-based overlay eliminates this cost entirely.

**`gl.MAX_TEXTURE_SIZE` hardware cap:**  
WebGL textures cannot exceed the device's `gl.MAX_TEXTURE_SIZE` limit — commonly 4096 px on mobile GPUs and 8192 px on desktop. A bitmap exceeding this limit throws a fatal `INVALID_VALUE` WebGL error. The engine does not query or check this limit in v1. If targeting mobile, keep bitmaps within 4096×4096.

**Main-thread scan pass:**  
`SectorRegistry` performs a synchronous O(W×H) scan on construction. For an 8192×4096 bitmap, this blocks the main thread for 200–500 ms. Use the Web Worker opt-in pattern above to move this work off the main thread.

**Canvas resize not handled:**  
After `loadMap()` resolves, resizing the canvas element does not update the Three.js renderer or camera frustum. Destroy and reload to handle resize.

**Continuous render loop:**  
The engine runs `requestAnimationFrame` continuously. Render-on-demand (only re-render when the scene is dirty) is deferred to v2.

**`sectorHover` fires during active pan drag:**  
Pointer events during a drag pan still pass through the picking pipeline and may emit `sectorHover`. Suppression during drag is deferred to v2.

**Single map instance assumption:**  
Multiple simultaneous `MapEngine` instances sharing a canvas, or managing multiple canvases independently, are not supported in v1.

## What v1 does not include

The following features are explicitly out of scope for v1:

- Adjacency graph (which sectors border which)
- Area / region hierarchy (grouping sectors into provinces, countries, etc.)
- River layer or heightmap rendering
- Shader-based political overlay (v2 upgrade path for `setSectorColor`)
- CSV definition format — JSON only
- Built-in UI controls, tooltips, or legend components
- SSR / Node.js support
- Multiple simultaneous map instances
- Touch event support (tap, pinch-to-zoom)
- Canvas resize handling after construction
- Render-on-demand (engine always runs rAF)
- UMD / CommonJS bundles — ESM only
- React or any framework integration layer
- Pre-fetched `ArrayBuffer` or `ImageBitmap` as `loadMap()` inputs — URL strings and `Blob` only
- `gl.MAX_TEXTURE_SIZE` querying or texture tiling
- Automatic Web Worker wiring in `loadMap()`

## Upgrade paths (v2)

| Limitation                                       | v2 approach                                                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Full `texImage2D` re-upload per `setSectorColor` | Shader-based sector color overlay using a palette texture — eliminates CPU pixel writes entirely            |
| `texImage2D` → partial update                    | `texSubImage2D` dirty-rect upload                                                                           |
| Main-thread O(W×H) scan                          | Move `SectorBitmapParser` + `SectorRegistry` construction into a Web Worker; transfer buffer to main thread |
| Memory: three buffer copies                      | Explore sharing `sourceBuffer` and `displayImageData` via `SharedArrayBuffer`                               |
| `gl.MAX_TEXTURE_SIZE` crash                      | Query limit at init; tile oversized bitmaps into multiple textures                                          |
| No adjacency graph                               | Post-scan edge-list → adjacency `Map<hexKey, hexKey[]>`                                                     |
| Continuous rAF loop                              | Render-on-demand — only call `renderer.render()` when the scene is dirty                                    |
| Hover during drag                                | Track drag state in `MapEngine`; suppress `sectorHover` emissions while `_isDragging` is true               |
| River / heightmap layers                         | Additional `PlaneGeometry` layers with separate textures composited over the base map                       |

## Bundle size

`dist/index.js` gzipped: **3.78 KB** (Three.js is external — not bundled).

```bash
npm run build && npm run size
```

If the size far exceeds 15 KB, verify that `rollupOptions.external: ['three']` is present in `vite.config.ts`. Omitting it bundles the entire Three.js library (~600 KB gzipped) and silently fails the size check.
