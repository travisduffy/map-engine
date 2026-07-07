# CLAUDE.md

## Documentation Architecture — Read Before Anything Else

This repo uses a strict three-tier documentation system. **All persistent AI context lives inside the repo, version-controlled, in one of exactly three places:**

1. `CLAUDE.md` — global directives, loaded every session
2. `.claude/rules/*.md` — path-scoped domain rules
3. `docs/` — project docs (active sprint workspace, ROADMAP, templates, archive)

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

Before concluding any task, run in two parallel batches then update state:

**Batch 1 (parallel):** `npm run typecheck` + `npm run typecheck:example`

**Batch 2 (parallel, after Batch 1 passes):** `npm run test` + `npm run build`

`npm run test` operates on source via the Vite alias — it does not depend on `npm run build`. Always run them together in Batch 2, not sequentially.

**State + format (once, at end of session — not after each individual task):**

- Update relevant `.claude/rules/*.md` files if domain patterns changed.
- Write `docs/active/PROGRESS.md` (see Efficiency Directives below).
- `npm run format`

**Before any phase exit**, also run the consistency scripts (see `.claude/rules/roadmap-governance.md`):

```bash
./bin/check-finding-codes.sh
./bin/check-roadmap-cross-refs.sh
./bin/check-matrix-vs-roadmap.sh
./bin/check-roadmap-consistency.sh
```

All four must exit 0 before closing the phase.

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
- Do not implement anything in the "explicitly does not include" list (see `docs/active/PRD.md` §"What This Version Explicitly Does Not Include")

## Documentation

- `docs/active/PROGRESS.md` — **read this first at the start of every session**; tracks task completion status, session logs, and lessons learned. If the Task Registry is empty or the active version is `None`, do not begin implementation — wait for the user to start a new cycle.
- `docs/active/PRD.md` — full implementation spec for the active version. If the Status is `DRAFT` or the Overview section is empty or marked `TODO`, do not infer requirements — stop and ask.
- `docs/active/epics/` — epic files for the active version; each task has a full work spec and done-when criteria. Empty between development cycles.
- `docs/archive/` — completed versions organized by SemVer tag (e.g., `v0.0.1/`). Treat as read-only historical reference; never modify archive contents.
- `docs/templates/` — blank starter templates (`PRD_TEMPLATE.md`, `PROGRESS_TEMPLATE.md`) used to initialize a new sprint's `docs/active/` workspace.
- `.claude/rules/roadmap-governance.md` — roadmap stewardship, the Phase Exit Self-Audit Protocol, and the process registry. Read this before any phase exit.

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
5. **Each archived phase locks in its own version.** When a sprint's phase is split
   out and archived mid-sprint, that archive gets a new, distinct SemVer patch
   version — never a `-phase-N` suffix on a version already used elsewhere. See
   `docs/processes/version-archive-split.md` for the full procedure.

## Operational Efficiency

These directives are derived from measured session overhead. Apply them on every task.

### 1. State files: Read once, Write once

`docs/active/PROGRESS.md` routinely needs 2–3 changes per session (status field, task table, session log). **Determine all changes before touching the file, then do one Read → one Write.** Never make multiple Edit calls to the same file in one session — each extra Edit call is pure overhead with no benefit over a full Write. When compressing a Session Log or audit entry, cut conversational filler but keep every decision, discrepancy, and technical rationale — that detail costs more to reconstruct next session than it costs to keep now.

### 2. Test research: Grep before broad reads

Never load a full test file to find setup patterns. Grep first:

```bash
grep -n 'beforeEach\|describe\|make.*Buffer\|requestAnimationFrame\|advanceFrame' test/Target.test.ts
```

Only escalate to a full Read if the grep result is insufficient. Test files in this repo run 400–900 lines; the useful setup surface is typically 30–50.

A specific signal: if a `beforeEach` in an existing test does `cancelAnimationFrame(renderer['_animFrameId'])`, the test harness bypasses the rAF loop entirely and calls `_preRenderHook` directly. This means it **cannot** test logic inside the loop body (e.g., render gating). Recognize this pattern immediately rather than reading `testUtils.ts` to confirm it.

### 3. Verification: maximize parallelism

The post-task checklist explicitly requires two parallel batches. The additional rule for phase exit:

```bash
# Run these three in parallel (one shell message, three calls):
npm run test
npm run build && ./bin/check-finding-codes.sh && ./bin/check-roadmap-cross-refs.sh && ./bin/check-matrix-vs-roadmap.sh && ./bin/check-roadmap-consistency.sh
npm run typecheck && npm run typecheck:example
```

`npm run test` runs against source (no build dependency). `npm run build` is independent of tests. There is no reason these ever run sequentially.

### 4. Trust CLAUDE.md; do not verify via config reads

If CLAUDE.md documents a behavior, treat it as authoritative. Do **not** read `vite.config.ts`, `tsconfig.json`, or `package.json` to verify information already stated here. Concretely: the test runner is Vitest browser mode (Playwright/Chromium), `vi.spyOn` works on window-level globals, `three` is external in the build — these are all stated here and do not require config file confirmation.

### 5. System-reminder preloads are live context

Files shown in system-reminder `Read` results at session start are already in your context window. Check what is preloaded before issuing any Read call. Re-reading a preloaded file costs a full round-trip for zero new information.

### 6. Targeted reads for known sections

When only a named section of a large file is needed (e.g., PRD §A1, ROADMAP §2.1, a specific audit section), use `offset` + `limit` parameters. Thirty lines around the target is almost always sufficient. Reading a full 80-line PRD to extract a 10-line section wastes 70 lines of context budget every time.

---

## Session Workflow

**Every session must follow this protocol:**

1. **Read `docs/active/PROGRESS.md` first.** It tells you exactly what has been done, what is in progress, what is blocked, and where the last session left off. Never start implementation work without reading it.
2. **Check if a development cycle is active.** If the Task Registry is empty or the active version is `None`, stop — do not begin implementation. Wait for the user to explicitly start the sprint (see Sprint Activation rule below).
3. **Find the next task.** The Task Registry lists all tasks with their current status. Pick up from the first `[ ]` (not started) or `[~]` (in progress) task.
4. **Read the epic file for that task.** Epic files are in `docs/active/epics/`. They contain the full work spec, PRD references, and done-when criteria for every task.
5. **Cross-reference the PRD.** `docs/active/PRD.md` is the canonical authority. Epic files cite specific PRD sections — go there for algorithm details and acceptance criteria.
6. **Update `docs/active/PROGRESS.md` when done.** Before closing a session: mark completed tasks `[x]`, mark any blocked task `[!]`, append a Session Log entry (date, tasks touched, outcome, decisions made, where you left off), and add any non-obvious discoveries to Lessons Learned.

### Sprint Activation — BDFL-Only, Non-Negotiable

**The BDFL (user) is the sole authority on when a sprint starts. This rule has no exceptions.**

- **Epic files existing in `docs/active/epics/` does NOT mean a sprint is active.** They are preparation artifacts — written ahead of time so the sprint is ready to start, not a signal that it has started.
- **Never autonomously populate the Task Registry** in `docs/active/PROGRESS.md` or change the Current Status from `NO ACTIVE SPRINT` to active. These edits must only happen when the BDFL gives explicit, intentional instruction to start the sprint in the current session.
- **Never infer sprint start from context.** The presence of epic files, a finalized PRD, or any other preparation work is not authorization to begin. Wait for the explicit "start the sprint" instruction.
- When the BDFL does start the sprint, the activation sequence is: update Current Status, populate the Task Registry with all epics and tasks, then begin Task 1.1 of Epic 1.
