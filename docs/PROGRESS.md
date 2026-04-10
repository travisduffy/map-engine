# Project Progress

> **This file is the single source of truth for implementation state.**
> Every AI session working on this project must read this file first and update it before closing the session. It is the handoff document between sessions.

---

## How to Use This File

**At the start of a session:**

1. Read this file in full.
2. Check **Current Status** — if it reads `NO ACTIVE SPRINT`, do not begin implementation work. Wait for the user to define the next version.
3. If a sprint is active, find the next incomplete task in the Task Registry.
4. Cross-reference the task's epic file (`docs/epics/`) for the full work spec.
5. Cross-reference `docs/PRD.md` for acceptance criteria and algorithm details.

**During a session:**

- Update the task's status to `[~]` (in progress) when you begin it.
- Append a Session Log entry with what you're doing and any notable decisions.

**At the end of a session:**

- Mark completed tasks `[x]`.
- If a task is blocked, mark it `[!]` and note the blocker.
- Append a Session Log entry summarizing what was completed, decisions made, and where you left off.
- Capture anything non-obvious in Lessons Learned.

**Status legend:**

| Symbol | Meaning                       |
| ------ | ----------------------------- |
| `[ ]`  | Not started                   |
| `[~]`  | In progress                   |
| `[x]`  | Complete                      |
| `[!]`  | Blocked — see log for details |

---

## Current Status

**Phase:** IDLE — v1.0.0 shipped, awaiting next development cycle
**Active version:** None
**Next task:** None — Task Registry is empty; populate `docs/PRD.md` and `docs/epics/` to begin the next cycle
**Blocking issues:** None

---

## Task Registry

<!-- TODO: Populate with epics and tasks when a new development cycle begins. -->
<!-- Format each epic as shown below:

### Epic N: [Epic Title]

> Full spec: `docs/epics/epic-N-[slug].md`

| Status | Task    | Description |
| ------ | ------- | ----------- |
| `[ ]`  | **N.1** | ...         |

-->

_(No active tasks. Populate when the next development cycle begins.)_

---

## Session Log

> Entries are prepended (newest first). Each entry records the date, what was attempted, what was completed, and any decisions made that aren't captured elsewhere.

<!-- SESSION ENTRY TEMPLATE — copy and fill in:

### YYYY-MM-DD — [brief title]

**Tasks touched:** X.Y, X.Z
**Outcome:** completed / partial / blocked

**What happened:**
[What was done, in plain language. Include any approaches tried that didn't work.]

**Decisions made:**
[Any implementation choices not fully specified by the PRD, or PRD ambiguities resolved.]

**Left off at:**
[Exact task and step where the session ended, so the next session can resume without re-reading everything.]

-->

### 2026-04-10 — canonical example application + dev tooling cleanup

**Tasks touched:** (out-of-cycle — tooling work, no sprint active)
**Outcome:** completed

**What happened:**
Built `example/` as a permanent fixture of the repo: a vanilla TypeScript Vite app that exercises every public API surface of the library and doubles as the primary browser-based development tool.

Workspace setup: root `package.json` converted to an npm workspace (`"workspaces": ["example"]`). Added `typecheck:example` and `build:example` root scripts. Example's `vite.config.ts` aliases `map-engine → ../src/index.ts` so it runs against library source with HMR — no pre-build required.

Example asset generation: `example/generate-map.js` (uses `sharp`, hoisted from root devDeps) produces a 320×240 RGB bitmap with 8 adjacent sectors and `sectors.json` with rich `SectorData` fields (`population`, `capital`, `climate`). Assets committed to `example/public/`. Map has no void pixels or internal black borders — sectors tile the full canvas meeting at hard pixel edges, representative of real Paradox-style province bitmaps.

Example UI: two-panel layout (canvas + sidebar). Demonstrates `sectorHover` (transient highlight), `sectorClick` (persistent selection with toggle deselect), `setSectorColor`/`resetSectorColor`, `getSectorKeys`/`getSector`, `registry.bboxes`/`.centroids`/`.pixelIndices`, `on`/`off`, `destroy`/reload, and `toHexKey`. Fixed layout thrash in hover and selected panels using fixed-height skeleton rows. Removed color picker (redundant with selection highlight, caused confusing three-way state).

Dev tooling: dropped `concurrently`. Split the old combined `npm run dev` into two independent scripts: `npm run dev` (vitest watch mode) and `npm run example` (example Vite dev server at localhost:3000). Added `browser.headless: true` and `browser.screenshotFailures: false` to suppress the Playwright browser popup and `test/__screenshots__` artifact generation. Added `server.watch.usePolling: true` for reliable file-watch triggering.

**Decisions made:**

- `file:..` (not `"*"`) as the workspace version specifier — `"*"` hit the npm registry instead of resolving locally.
- `new URL('../src/index.ts', import.meta.url).pathname` in `vite.config.ts` instead of `path.resolve(__dirname, ...)` to avoid needing `@types/node` in the example.
- `tsconfig.json` `"paths"` entry in the example to mirror the Vite alias so `tsc --noEmit` resolves `map-engine` to source.
- Skeleton rows hardcoded to match the known SectorData shape (`population`, `capital`, `climate`) — acceptable because the example owns its own fixture data.
- Advanced panel (`bbox`, `centroid`, `pixels`) made permanently visible with skeleton, not hidden/shown, to eliminate a second layout thrash point.
- Dropped `concurrently` entirely rather than debugging watch mode interaction between two concurrent Vite servers.

**Left off at:**
All documentation updated (CLAUDE.md, README.md, PROGRESS.md). No active sprint. Example is complete and passes full typecheck + test suite.

---

## Lessons Learned

> Non-obvious things discovered during implementation that future sessions should know. Append entries; do not delete old ones.

_(None yet — populated as implementation proceeds.)_
