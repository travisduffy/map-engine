# map-engine

A TypeScript library that renders interactive maps in the browser.

![The example app: hover and select a sector on the map, route a path across two sectors, zoom, pan, and switch the map mode](docs/demo.gif)

Provide a flat-color PNG bitmap paired with a JSON definitions file, and the engine generates a GPU-accelerated canvas supporting panning, zooming, sector selection, dynamic recoloring, and route calculation.

---

## Overview

`map-engine` implements the discrete bitmap architecture common in grand-strategy games such as _Europa Universalis IV_, _Hearts of Iron IV_, and _Crusader Kings III_:

- The base map is encoded as an RGB bitmap.
- Each sector is defined by a unique, discrete RGB color value.
- An auxiliary JSON file maps those color keys to sector data.
- Color values serve as programmatic identities, allowing map asset creation directly in standard image editing software.

The library delivers this workflow natively to the web platform as a standalone module without dependencies on game engines, UI frameworks, or server-side rendering.

## Architecture

Execution runs in four stages:

1. **Ingestion:** `loadMap()` fetches the PNG and definitions JSON, converts the bitmap to raw pixel buffers, and scans the image once. It assigns sequential integer IDs to unique colors and precomputes bounding boxes, centroids, topological neighbors, and boundary contours.
2. **Rendering:** Sector IDs load into an integer texture on the GPU. A fragment shader looks up each pixel ID in a secondary palette texture (one texel per sector). Sector recoloring and map-mode transitions update only this palette texture, leaving the CPU out of per-frame pixel processing.
3. **Picking:** Pointer events raycast onto the map plane, resolve hit coordinates to bitmap pixel positions, sample the sector ID at that coordinate, and emit high-level events (`sectorClick`, `sectorHover`, `pick`).
4. **Worker Threading:** Sector data transfers to a Web Worker via transferable `ArrayBuffer` instances. The worker computes A\* pathfinding routes, groups sectors into regions, resolves label anchors, and builds region boundary geometry without blocking the main browser thread. The architecture avoids `SharedArrayBuffer`, permitting deployment on standard static web hosts without cross-origin isolation headers.

Three.js is a peer dependency. The production bundle size is approximately 16 kB (gzipped), Web Worker included.

## Requirements

### Runtime

- WebGL 2.0
- `OffscreenCanvas`
- Web Workers
- Browser environments only (SSR is not supported)

### Peer Dependencies

- `three` (^0.160.0)
- `@types/three` (^0.160.0, optional for TypeScript projects)

## Installation

`map-engine` is still under development and is not published as a package. For local development workflows, see the [Installation Guide](docs/REFERENCE.md#installation) in the reference documentation.

## Usage

```typescript
import { MapEngine } from '@travisduffy/map-engine'

// The DOM requires an HTML canvas element with defined dimensions before calling loadMap()
const canvas = document.getElementById('map') as HTMLCanvasElement
canvas.style.width = '800px'
canvas.style.height = '600px'

const engine = new MapEngine()

engine.on('sectorClick', ({ hexKey, sectorData }) => {
  console.log(`Selected sector: ${sectorData.name} (${hexKey})`)
})

await engine.loadMap({
  bitmapUrl: '/map.png',
  definitionUrl: '/sectors.json',
  canvas,
  ignoredColors: ['ffffff', '000000'], // Ignored non-sector regions (e.g., oceans, borders)
})

// Recolor a single sector via palette update
engine.setSectorColor('ff0000', '#3399ff')
```

### Input Specifications

- **PNG Bitmap:** Save bitmaps with hard edges. Disable anti-aliasing and alpha transparency. Every pixel must resolve to an exact RGB value.
- **JSON Definitions:** Key each sector record using lowercase hexadecimal color codes:

```json
{
  "ff0000": { "name": "Halifax, NS" },
  "b300ff": { "name": "Lunenburg, NS" }
}
```

Sample data files are in `example/public/`.

Complete technical specifications for map modes, pathfinding, camera controls, label anchors, and data schemas can be found in [docs/REFERENCE.md](docs/REFERENCE.md).

## Example & Test Suite

### Running the Example Application

```bash
git clone https://github.com/travisduffy/map-engine
cd map-engine
npm install
npm run example

```

Open `http://localhost:3000` to run the demonstration.

### Running Tests

Integration tests execute against Chromium via Playwright and Vitest:

```bash
npx playwright install chromium
npm test
npm run build

```

## Known Limitations

- **Initialization Latency:** Bitmap decoding and coordinate scanning run synchronously on the main thread. On a 4096×4096 pixel canvas, initial load requires approximately 2.1 seconds for 1,000 sectors and 3.3 seconds for 10,000 sectors (benchmarked on dual-core mobile hardware).
- **Navigation Controls:**
- Mouse: Middle-button drag pans; wheel zooms.
- Touch: Single-finger drag pans; pinch zooms.
- Trackpad: Two-finger scroll zooms. Panning via trackpad is currently unsupported.

- **Capacity:** A single map instance supports up to 65,534 addressable sectors.
- **Stability:** Software is in early alpha (`v0.0.7`); APIs are subject to breaking changes across minor releases.

## Development Event Log

This project tracks changes in the `log/` directory independently of the Git commit tree:

- `log/events.log`: Append-only event store formatted as `<id> <timestamp> <message>`. The ID is the SHA-256 hash of the payload message, ensuring tamper evidence.
- `log/artifacts/`: Immutable assets and test snapshots named by their SHA-256 content digest.
- Commits append single entries to the log without editing previous lines. The repository applies the Git `union` merge driver to prevent merge conflicts on concurrent branches.

```bash
npm run commit      # Generates a formatted log record and creates artifacts
npm run check:log   # Validates log schema and cryptographic integrity

```

## License

MIT © [Travis Duffy](LICENSE)
