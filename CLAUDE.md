# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation Architecture — Read Before Anything Else

This repo uses a strict three-tier documentation system defined in `docs/claude-strategy.md`. **All persistent AI context lives inside the repo, version-controlled, in one of exactly three places:**

1. `CLAUDE.md` — global directives, loaded every session
2. `.claude/rules/*.md` — path-scoped domain rules
3. `docs/` — project docs (PRD, PROGRESS, ROADMAP, epics, archive)

**Never create any external or machine-local persistence for this project.** This means:

- No `memory/` directory anywhere in the repo
- No harness memory files (e.g., `~/.claude/projects/*/memory/`)
- No notes, scratchpads, or state files outside the three tiers above

If a rule or convention is worth preserving, it goes in `CLAUDE.md` (global) or `.claude/rules/*.md` (domain-scoped). If it is not worth encoding in one of those two places, it is not worth preserving at all.

## Commands

```bash
npm run dev           # vitest watcher (watch mode, re-runs on file changes)
npm run example       # example app dev server (localhost:3000, HMR)
npm run typecheck     # tsc --noEmit (type errors only, no emit)
npm run build         # tsc + vite build (library mode, outputs dist/index.js)
npm run build:example     # vite build for the example app (example/ workspace)
npm run typecheck:example # tsc --noEmit for the example workspace
npm run format            # prettier --write .
npm run test              # run full test suite (vitest run — all test files, single pass)
npm run size              # gzip -c dist/index.js | wc -c  (verify <15 KB gzipped)
npm run knowledge         # repomix CLAUDE.md + README.md + docs/** → stdout (pipe to clipboard etc.)
```

Tests requiring browser APIs (`OffscreenCanvas`, `createImageBitmap`, DOM) run under Vitest browser mode with the Playwright provider. Tests without browser API dependencies may use Vitest in Node mode.

To run a single test file: `npx vitest run test/path/to/file.test.ts`

## Workspace structure

This is an npm workspace with two packages:

| Package              | Path       | Role                                                              |
| -------------------- | ---------- | ----------------------------------------------------------------- |
| `map-engine`         | `/` (root) | The library — TypeScript ESM, built to `dist/index.js`            |
| `map-engine-example` | `example/` | Canonical example app — vanilla TS Vite app consuming the library |

The example is a **permanent fixture** of the repo, not a throwaway demo. It serves as the living integration reference for all public API surfaces and as the primary browser-based development tool. It must be kept in sync with every API change.

`example/vite.config.ts` aliases `map-engine` → `../src/index.ts`, so the example runs directly against library source with HMR — no pre-build required.

## Architecture

This is a **TypeScript ESM library** (not an app) that renders Paradox-style grand strategy maps in the browser using Three.js. The entry point is `src/index.ts`; `src/main.ts` is Vite boilerplate only — the real development surface is `example/`.

### The four modules (v0.0.1 — implemented)

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

### Color overlay strategy (v0.0.1)

`setSectorColor` patches only a sector's pixels in a persistent `displayImageData` (separate from `sourceBuffer`), flushes via dirty-rect `putImageData` using the sector's bbox, then sets `texture.needsUpdate = true`. This triggers a full `texImage2D` re-upload — accepted for the current version; the GPU palette approach is documented in the ROADMAP (CA-7).

### Picking pipeline

`pointermove`/`click` → NDC conversion via `getBoundingClientRect()` → `raycaster.intersectObject(mesh)` → UV → pixel (with mandatory Y-inversion: `pixelY = Math.floor((1 - uv.y) * height)`) → `getSectorAt` → `getSector`. Emits `sectorHover` (on change only) or `sectorClick`.

### Resize / responsiveness strategy

`MapRenderer` handles canvas resize inside the rAF render loop — **not** via `ResizeObserver`. At the top of every frame, `canvas.clientWidth/clientHeight` is compared to the last-known size. If changed, `renderer.setSize()` and the camera frustum are updated immediately before `renderer.render()` in the same callback. This is the canonical [webgl2fundamentals.org](https://webgl2fundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html) pattern.

**Why not ResizeObserver:** Per the HTML spec rendering order (rAF → layout → ResizeObserver → paint), any ResizeObserver approach that defers work to the next rAF frame is exactly one frame late — the CSS-scaled old buffer gets composited first. Checking size inside rAF avoids all timing ambiguity.

**Proportional frustum scaling:** A `_worldUnitsPerPixel` constant is computed once at construction from the initial "contain" framing. On resize, frustum half-dimensions are set to `(newCSSPx * _worldUnitsPerPixel) / 2`. This keeps the world-to-pixel ratio constant — the map appears the same physical size and the viewport boundary simply grows or shrinks. Do not rerun the "contain" strategy on resize; that changes scale.

### Build configuration

`vite.config.ts` serves dual purpose: library build (`rollupOptions.external: ['three']` is mandatory — omitting it bundles Three.js and silently blows the 15 KB gzipped size target) and Vitest browser-mode testing. See PRD §"Dev Dependencies" for the exact config block.

### Test fixtures

Located at `test/fixtures/`. The `test-4x4.png` (4×4 pixel, 4 sectors) is generated programmatically via `test/fixtures/generate-fixtures.js` using `sharp`. Use absolute paths in browser-mode tests (e.g., `'/test/fixtures/test-4x4.png'`), not relative paths.

### Example app assets

The example app's map bitmap and sector definition are committed static assets. Do not generate or replace them programmatically.

### Post-task checklist

Before concluding any task, run in this order:

1. `npm run typecheck` — zero type errors (root library)
2. `npm run typecheck:example` — zero type errors (example workspace)
3. `npm run build` — clean library output
4. `npm run test` — full test suite passes
5. Update relevant `.claude/rules/*.md` files if domain patterns changed, then update `docs/PROGRESS.md`
6. `npm run format` — apply Prettier to all edited files

**When modifying the public API:** also update `example/src/main.ts` to reflect the change — the example must always demonstrate the current, accurate API surface.

## Dev dependencies (when installing)

```
three@^0.160.0          # peer dep — external in build
vitest@^3.2.0
@vitest/browser@^3.2.0
playwright@^1.59.0
sharp@^0.33.0           # fixture generation only
```

## Important constraints from PRD

- **ESM only** — no UMD/CJS bundles
- `SectorRegistry` must have **zero Three.js imports** (enforced by static analysis)
- `SectorBitmapParser` and `SectorRegistry` must be **Worker-compatible** (zero DOM access)
- `MapRenderer` and `MapEngine` are **main-thread only**
- JSON hex keys are **not** normalized — `"FF0000"` ≠ `"ff0000"`; consumer's responsibility
- `createImageBitmap` called without options (safe because bitmap guarantees alpha=255)
- Do not implement anything in the "v0.0.1 explicitly does not include" list (see `docs/PRD.md` §"What v0.0.1 Explicitly Does Not Include")

## Documentation

- `docs/PROGRESS.md` — **read this first at the start of every session**; tracks task completion status, session logs, and lessons learned. If the Task Registry is empty or the active version is `None`, do not begin implementation — wait for the user to start a new cycle.
- `docs/PRD.md` — full implementation spec for the active version. If the Overview section is empty or marked `TODO`, do not infer requirements — stop and ask.
- `docs/epics/` — epic files for the active version; each task has a full work spec and done-when criteria. Empty between development cycles.
- `docs/archive/` — completed versions organized by SemVer tag (e.g., `v0.0.1/`). Treat as read-only historical reference; never modify archive contents.
- `docs/claude-strategy.md` — three-tier docs strategy and Active vs. Archive directory conventions.

> **Archiving is a human-triggered event.** NEVER move files into `docs/archive/` autonomously. Only execute an archive sequence when the user explicitly instructs you to do so in that session.

## Versioning Policy

### Era: v0.0.y — Patch-Only Development

The project is in early development. **All releases increment the PATCH version only.**
This applies regardless of change type — bugfixes, new features, and breaking changes
all bump `v0.0.y` while this era is active.

**Rules for AI agents (non-negotiable):**

1. **Never modify `package.json` version autonomously.** Version increments are
   BDFL-only decisions, announced explicitly in the session that releases.
2. **Never write specific future version targets** in code, comments, documentation,
   or PRD/epic files. Use "a future version", "a future release", or "see ROADMAP"
   instead of `v0.1.0`, `v1.0.0`, etc. Specific targets create false timeline pressure.
3. **Never plan a sprint around a named future version.** Sprint PRDs target
   "the next patch release." The BDFL names the version number at release time.
4. **The jump from v0.0.y to v0.1.0 is a BDFL-only decision.** Do not assume,
   suggest, or plan for it.

## Session Workflow

**Every session must follow this protocol:**

1. **Read `docs/PROGRESS.md` first.** It tells you exactly what has been done, what is in progress, what is blocked, and where the last session left off. Never start implementation work without reading it.
2. **Check if a development cycle is active.** If the Task Registry is empty or the active version is `None`, stop — do not begin implementation. Wait for the user to populate `docs/PRD.md` and `docs/epics/` to start the next cycle.
3. **Find the next task.** The Task Registry lists all tasks with their current status. Pick up from the first `[ ]` (not started) or `[~]` (in progress) task.
4. **Read the epic file for that task.** Epic files are in `docs/epics/`. They contain the full work spec, PRD references, and done-when criteria for every task.
5. **Cross-reference the PRD.** `docs/PRD.md` is the canonical authority. Epic files cite specific PRD sections — go there for algorithm details and acceptance criteria.
6. **Update `docs/PROGRESS.md` when done.** Before closing a session: mark completed tasks `[x]`, mark any blocked task `[!]`, append a Session Log entry (date, tasks touched, outcome, decisions made, where you left off), and add any non-obvious discoveries to Lessons Learned.
