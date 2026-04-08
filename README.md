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

## Development

```bash
npm run dev       # Vite dev server on port 3000
npm run build     # tsc + vite build (outputs dist/index.js)
npm run format    # prettier --write .
npm run size      # gzip -c dist/index.js | wc -c  (verify < 15 KB)
npm run test      # run full test suite (vitest run)
npm run typecheck # tsc --noEmit
```

## Architecture

| Module               | Role                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `SectorBitmapParser` | Loads PNG URL or Blob → raw RGBA pixel buffer. Worker-safe (zero DOM deps).                                         |
| `SectorRegistry`     | Single O(W×H) scan → hex-key map, bboxes, centroids, pixel indices, border edges. Zero Three.js imports.            |
| `MapRenderer`        | Three.js scene: `OrthographicCamera`, `PlaneGeometry` + `CanvasTexture`, pan/zoom, color overlay. Main-thread only. |
| `MapEngine`          | Public facade wiring all modules.                                                                                   |

ESM only. No UMD or CJS bundles. `SectorBitmapParser` and `SectorRegistry` have zero DOM global references and are safe to use inside a Web Worker.
