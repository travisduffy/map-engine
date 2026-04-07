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
const engine = new MapEngine()

// Subscribe to events before loading (works without loadMap being called yet)
engine.on('sectorClick', ({ hexKey, sectorData, pixelX, pixelY }) => {
  console.log(`Clicked: ${sectorData.name} (${hexKey})`)
})

engine.on('sectorHover', result => {
  if (result) console.log(`Hovering: ${result.sectorData.name}`)
  else console.log('Off map')
})

await engine.loadMap({
  bitmapUrl: '/assets/sectors.png',
  definitionUrl: '/assets/sectors.json',
  canvas,
})

// Repaint a sector
engine.setSectorColor('820030', '#3399ff')

// Reset to original bitmap color
engine.resetSectorColor('820030')

// Cleanup
engine.destroy()
```

## Input formats

### `sectors.png` — Sector bitmap

- 24-bit RGB PNG; no anti-aliasing, no transparency, no color blending at edges
- Every pixel's RGB value is the sector's identity
- Non-interactive regions (oceans, wastelands) should be a single color **not** listed in the JSON — `#000000` is the conventional void color

### `sectors.json` — Sector definition

```json
{
  "820030": { "name": "Northern Reach", "population": 142000 },
  "004d99": { "name": "Coastal Basin", "population": 89000 }
}
```

Keys are **6-character lowercase hex strings** (e.g. `"004d99"`, not `"4D99"`). The engine does not normalize case — mismatched keys silently produce zero-pixel sectors.

Any additional fields on sector objects are passed through as-is.

## API

### `MapEngine`

```typescript
class MapEngine {
  constructor()
  loadMap(config: MapConfig): Promise<void>
  getSector(hexKey: string): SectorData | undefined
  setSectorColor(hexKey: string, color: string): void // any CSS color string
  resetSectorColor(hexKey: string): void
  on(event: 'sectorClick', handler: (result: PickResult) => void): void
  on(event: 'sectorHover', handler: (result: PickResult | null) => void): void
  off(event: 'sectorClick' | 'sectorHover', handler: Function): void
  destroy(): void // idempotent
}
```

### Types

```typescript
interface MapConfig {
  bitmapUrl: string
  definitionUrl: string
  canvas: HTMLCanvasElement
}

interface PickResult {
  hexKey: string // e.g. "820030"
  sectorData: SectorData
  pixelX: number
  pixelY: number
}

type SectorData = {
  name: string
  [key: string]: unknown // your domain fields
}
```

### Events

| Event         | Payload              | Fires when                                                                              |
| ------------- | -------------------- | --------------------------------------------------------------------------------------- |
| `sectorClick` | `PickResult`         | User clicks a defined sector                                                            |
| `sectorHover` | `PickResult \| null` | Hover sector changes; `null` when pointer leaves the map or lands on an undefined pixel |

`sectorHover` fires only on sector identity change, not on every `pointermove`.

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
```

`map-engine` does not resize or restyle the canvas element — CSS sizing is your responsibility.

## Deployment note (CORS)

When the bitmap URL is hosted on a different origin, the asset server must send `Access-Control-Allow-Origin` headers. Standard `fetch` CORS semantics apply. This is an operational concern; the engine does not add CORS headers to requests.

## Development

```bash
npm run dev     # Vite dev server on port 3000
npm run build   # tsc + vite build (outputs dist/index.js)
npm run format  # prettier --write .
npm run size    # gzip -c dist/index.js | wc -c  (verify < 15 KB)
npx vitest      # run tests
```

## Architecture

| Module               | Role                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `SectorBitmapParser` | Loads PNG URL or Blob → raw RGBA pixel buffer. Worker-safe.                                                         |
| `SectorRegistry`     | Single O(W×H) scan → hex-key map, bboxes, centroids, pixel indices, border edges. Zero Three.js imports.            |
| `MapRenderer`        | Three.js scene: `OrthographicCamera`, `PlaneGeometry` + `CanvasTexture`, pan/zoom, color overlay. Main-thread only. |
| `MapEngine`          | Public facade wiring all modules.                                                                                   |

ESM only. No UMD or CJS bundles.
