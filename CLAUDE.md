# CLAUDE.md

## Where persistent context lives

All persistent AI context for this project lives inside the repo, version-controlled, in
one of exactly two places:

1. `CLAUDE.md` — global directives, loaded every session
2. `.claude/rules/*.md` — path-scoped domain rules

Project documentation lives in `docs/` (see the Documentation section below).

**Never create any external or machine-local persistence for this project.** No `memory/`
directory anywhere in the repo, no harness memory files (e.g., `~/.claude/projects/*/memory/`),
no notes, scratchpads, or state files outside the repo. If a convention is worth preserving,
it goes in `CLAUDE.md` (global) or `.claude/rules/*.md` (domain-scoped). If it is not worth
encoding in one of those two places, it is not worth preserving at all.

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

See `.claude/rules/architecture.md` for the module breakdown, data flow, sector identity system, color overlay strategy, picking pipeline, resize strategy, build configuration, and test fixtures.

### Post-task checklist

Before concluding any task, run in two parallel batches then update state:

**Batch 1 (parallel):** `npm run typecheck` + `npm run typecheck:example`

**Batch 2 (parallel, after Batch 1 passes):** `npm run test` + `npm run build`

`npm run test` operates on source via the Vite alias — it does not depend on `npm run build`. Always run them together in Batch 2, not sequentially.

**State + format (once, at end of session — not after each individual task):**

- Update relevant `.claude/rules/*.md` files if domain patterns changed.
- `npm run format`

**When modifying the public API:** also update `example/src/main.ts` to reflect the change — the example must always demonstrate the current, accurate API surface.

**When adding a new module file under `src/worker/` or `src/render/`:** also add its row to `.claude/rules/architecture.md`'s Module layout table in the same session. A vaguer version of this rule ("update relevant `.claude/rules/*.md` files if domain patterns changed") is not concrete enough to fire reliably — several `src/render/` modules once went undocumented in that table for a long stretch before a later pass caught the gap, so treat the concrete rule as the operative one.

## Dev dependencies (when installing)

```
three@^0.160.0          # peer dep — external in build
vitest@^3.2.0
@vitest/browser@^3.2.0
playwright@^1.59.0
sharp@^0.33.0           # fixture generation only
```

## Engineering Constraints

- **ESM only** — no UMD/CJS bundles
- `SectorRegistry` must have **zero Three.js imports** (enforced by static analysis)
- `SectorBitmapParser` and `SectorRegistry` must be **Worker-compatible** (zero DOM access)
- `MapRenderer` and `MapEngine` are **main-thread only**
- JSON hex keys are **not** normalized — `"FF0000"` ≠ `"ff0000"`; consumer's responsibility
- `createImageBitmap` called without options (safe because bitmap guarantees alpha=255)
- Do not implement anything in the current release's out-of-scope list (see README.md §"What this version does not include")

## Documentation

- `docs/vision.md` — the project's design charter: North Star, the veto-bearing First-Class Principles, architectural invariants, current capability surface, settled non-goals, and uncommitted future directions. Read this to keep new work on-track; a change that conflicts with a First-Class Principle is wrong by default.
- `.claude/rules/architecture.md` — module breakdown, data flow, sector identity, rendering, and resize implementation details. Loads automatically when touching `src/`, `example/`, or `test/` TypeScript files.
- `docs/research/` — architecture/engineering reference PDFs (RGB index-map rendering, GSG engine architecture, WASM/UI binding, etc.), indexed by `docs/research/README.md`.
- `docs/archive/` — **frozen, read-only** historical record of the retired sprint/phase project-management system (per-version snapshots, the former roadmap, traceability matrix, and phase audits). Not governed or updated; kept for provenance. See `docs/archive/README.md`.

## Operational Efficiency

These directives are derived from measured session overhead. Apply them on every task.

### 1. Test research: Grep before broad reads

Never load a full test file to find setup patterns. Grep first:

```bash
grep -n 'beforeEach\|describe\|make.*Buffer\|requestAnimationFrame\|advanceFrame' test/Target.test.ts
```

Only escalate to a full Read if the grep result is insufficient. Test files in this repo run 400–900 lines; the useful setup surface is typically 30–50.

A specific signal: if a `beforeEach` in an existing test does `cancelAnimationFrame(renderer['_animFrameId'])`, the test harness bypasses the rAF loop entirely and calls `_preRenderHook` directly. This means it **cannot** test logic inside the loop body (e.g., render gating). Recognize this pattern immediately rather than reading `testUtils.ts` to confirm it.

### 2. Verification: maximize parallelism

The post-task checklist requires two parallel batches. `npm run test` runs against source (no build dependency) and `npm run build` is independent of tests, so typecheck, test, and build never need to run sequentially — batch them per the checklist above.

Anchor every `grep` exclusion pattern to a real boundary, or it silently under- or over-matches. Path filters anchor on `(^|/)`, not `\./` — recursive grep emits paths with no leading `./`, so a `\./`-anchored `grep -v` matches nothing and leaks the whole result. Verb/prefix filters (e.g. excluding already-conforming booleans) anchor on the identifier start — `_?(is|has|are|can|should)[A-Z_]`, not a bare `is`, which also matches the substring inside `visible` and silently drops real violations.

### 3. Trust CLAUDE.md; do not verify via config reads

If CLAUDE.md documents a behavior, treat it as authoritative. Do **not** read `vite.config.ts`, `tsconfig.json`, or `package.json` to verify information already stated here. Concretely: the test runner is Vitest browser mode (Playwright/Chromium), `vi.spyOn` works on window-level globals, `three` is external in the build — these are all stated here and do not require config file confirmation.

### 4. System-reminder preloads are live context

Files shown in system-reminder `Read` results at session start are already in your context window. Check what is preloaded before issuing any Read call. Re-reading a preloaded file costs a full round-trip for zero new information.

### 5. Targeted reads for known sections

When only a named section of a large file is needed, use `offset` + `limit` parameters. Thirty lines around the target is almost always sufficient. Reading a full file to extract a 10-line section wastes context budget every time.

When editing a single row of a prettier-formatted markdown table, anchor the `Edit` on a short unique fragment rather than the full copied line — column-alignment padding often doesn't match what gets typed manually, and a full-line `old_string` fails on that whitespace mismatch. When that same edit expands one row into several (or merges several into one), emit every resulting row in `new_string` — the short anchor shrinks only what you match, not what you must output, so a replacement that names one row while the source covered three silently drops the other two and costs a follow-up edit to restore them.

### 6. Plan Mode: verify before exiting

Before calling `ExitPlanMode` on a non-trivial plan, re-read the exact source lines the plan depends on (method signatures, field names, call sites) instead of trusting Explore/Plan subagent summaries at face value — a first draft should be treated as needing a dedicated verification pass without being asked. Make the pass produce a visible artifact instead of a private mental step: before the first `ExitPlanMode` call, add a short "Verified against source" note to the plan file itself, listing the specific file:line locations re-read and confirming each still matches the plan's key assumptions. A plan file with no such note is a visible signal — to you and to the user — that the pass was skipped.
