# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Vite dev server on port 3000
npm run build     # tsc + vite build (library mode, outputs dist/index.js)
npm run format    # prettier --write .
npm run size      # gzip -c dist/index.js | wc -c  (verify <15 KB gzipped; add this script)
npx vitest        # run tests (browser mode via Playwright; Node mode for non-browser tests)
```

Tests requiring browser APIs (`OffscreenCanvas`, `createImageBitmap`, DOM) run under Vitest browser mode with the Playwright provider. Tests without browser API dependencies may use Vitest in Node mode.

To run a single test file: `npx vitest run test/path/to/file.test.ts`

## Architecture

This is a **TypeScript ESM library** (not an app) that renders Paradox-style grand strategy maps in the browser using Three.js. The entry point will be `src/index.ts`; `src/main.ts` is currently just Vite boilerplate.

### The four modules (not yet implemented)

| Module               | Role                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SectorBitmapParser` | Loads PNG URL or Blob → raw RGBA pixel buffer + dimensions. Worker-safe (zero DOM deps).                                                                                                    |
| `SectorRegistry`     | Single O(W×H) scan over pixel buffer + JSON definition → all spatial data (hex-key map, bboxes, centroids, pixelIndices, borderEdges). Immutable after construction. Zero Three.js imports. |
| `MapRenderer`        | Three.js scene: OrthographicCamera, PlaneGeometry + CanvasTexture, pan/zoom, `setSectorColor`/`resetSectorColor`. Main-thread only.                                                         |
| `MapEngine`          | Public facade wiring all modules. Zero-arg constructor; consumer calls `loadMap(bitmapUrl, definitionUrl, canvas)`.                                                                         |

### Key data flow

1. `SectorBitmapParser.parse(source)` → `{ buffer: Uint8ClampedArray, width, height }`
2. `SectorRegistry(buffer, width, height, definition)` → spatial lookup structure
3. `MapRenderer(canvas, registry)` → Three.js scene with CanvasTexture initialized from `registry.sourceBuffer`
4. `MapEngine.loadMap()` orchestrates 1–3; exposes `on('sectorHover'|'sectorClick', cb)` events

### Sector identity system

Every pixel's RGB value encodes a sector identity. The hex key (`"ff0000"` lowercase, no `#`) is the universal identifier connecting bitmap pixels to JSON definition entries. `toHexKey(r, g, b)` is the single conversion utility used throughout. `#000000` is the conventional void/non-interactive color.

### Color overlay strategy (v1)

`setSectorColor` patches only a sector's pixels in a persistent `displayImageData` (separate from `sourceBuffer`), flushes via dirty-rect `putImageData` using the sector's bbox, then sets `texture.needsUpdate = true`. This triggers a full `texImage2D` re-upload — accepted for v1; shader-based v2 path is documented in the PRD.

### Picking pipeline

`pointermove`/`click` → NDC conversion via `getBoundingClientRect()` → `raycaster.intersectObject(mesh)` → UV → pixel (with mandatory Y-inversion: `pixelY = Math.floor((1 - uv.y) * height)`) → `getSectorAt` → `getSector`. Emits `sectorHover` (on change only) or `sectorClick`.

### Build configuration

`vite.config.ts` serves dual purpose: library build (`rollupOptions.external: ['three']` is mandatory — omitting it bundles Three.js and silently blows the 15 KB gzipped size target) and Vitest browser-mode testing. See PRD §"Dev Dependencies" for the exact config block.

### Test fixtures

Located at `test/fixtures/`. The `test-4x4.png` (4×4 pixel, 4 sectors) is generated programmatically via `test/fixtures/generate-fixtures.js` using `sharp`. Use absolute paths in browser-mode tests (e.g., `'/test/fixtures/test-4x4.png'`), not relative paths.

### Post-task checklist

Before concluding any task: build (`npm run build`), lint/typecheck, run tests, update relevant `.claude/rules/*.md` files if domain patterns changed, and update `docs/PROGRESS.md`.

## Dev dependencies (when installing)

```
three@^0.160.0          # peer dep — external in build
vitest@^2.1.0
@vitest/browser@^2.1.0
playwright@^1.40.0
sharp@^0.33.0           # fixture generation only
```

## Important constraints from PRD

- **ESM only** — no UMD/CJS bundles
- `SectorRegistry` must have **zero Three.js imports** (enforced by static analysis)
- `SectorBitmapParser` and `SectorRegistry` must be **Worker-compatible** (zero DOM access)
- `MapRenderer` and `MapEngine` are **main-thread only**
- JSON hex keys are **not** normalized — `"FF0000"` ≠ `"ff0000"`; consumer's responsibility
- `createImageBitmap` called without options (safe because bitmap guarantees alpha=255)
- Do not implement anything in the "v1 explicitly does not include" list (see `docs/PRD.md` §"What v1 Explicitly Does Not Include")

## Documentation

- `docs/PRD.md` — full implementation spec including exact algorithms, acceptance criteria, and known risks
- `docs/epics/` — 18 tasks across 3 epics; each task has a full work spec and done-when criteria
- `docs/PROGRESS.md` — **read this first at the start of every session**; tracks task completion status, session logs, and lessons learned
- `docs/claude-strategy.md` — three-tier docs strategy (CLAUDE.md → `.claude/rules/*.md` → README.md)

## Session Workflow

**Every session must follow this protocol:**

1. **Read `docs/PROGRESS.md` first.** It tells you exactly what has been done, what is in progress, what is blocked, and where the last session left off. Never start implementation work without reading it.
2. **Find the next task.** The Task Registry in `docs/PROGRESS.md` lists all 18 tasks with their current status. Pick up from the first `[ ]` (not started) or `[~]` (in progress) task.
3. **Read the epic file for that task.** Epic files are in `docs/epics/`. They contain the full work spec, PRD references, and done-when criteria for every task.
4. **Cross-reference the PRD.** `docs/PRD.md` is the canonical authority. Epic files cite specific PRD sections — go there for algorithm details and acceptance criteria.
5. **Update `docs/PROGRESS.md` when done.** Before closing a session: mark completed tasks `[x]`, mark any blocked task `[!]`, append a Session Log entry (date, tasks touched, outcome, decisions made, where you left off), and add any non-obvious discoveries to Lessons Learned.
