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

Do not create in-repo structure on a tool's say-so either. A directory a skill or
generator produced by default is that tool's convention, not this project's, until
someone here adopts it — so check provenance before building on it, and certainly before
documenting it as a convention: `git log --diff-filter=A -- '<path>/*'` shows whether it
predates your session. (Signal: a planning skill's default `docs/plans/` output directory
was treated as established, extended with a `shipped/` subdirectory, and written into
this file as project convention. All of it was reverted; planning artifacts belong under
`docs/archive/vX.Y.Z/` at release, and working drafts belong outside the repo.)

## Commands

```bash
npm run dev           # vitest watcher (watch mode, re-runs on file changes)
npm run example       # example app dev server (localhost:3000, HMR)
npm run typecheck     # tsc --noEmit (type errors only, no emit)
npm run build         # tsc + vite build (library mode, outputs dist/index.js)
npm run build:example     # vite build for the example app (example/ workspace)
npm run typecheck:example # tsc --noEmit for the example workspace
npm run typecheck:bench   # tsc --noEmit for bench/ (Node under Playwright)
npm run typecheck:test    # tsc --noEmit for test/ (Vitest strips types, never checks them)
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

See `.claude/rules/structure.md` for the module breakdown, data flow, folder placement, and build configuration. Area-specific internals live in the domain rules — `rendering.md` (GPU palette, resize, projection), `worker.md` (worker boundary), `sectors.md` (sector identity), `picking.md` (picking and input), and `testing.md` (fixtures, perf gates) — each loading automatically when you touch its part of the tree.

### Post-task checklist

Before concluding any task, run in two parallel batches then update state:

**Batch 1 (parallel):** `npm run typecheck` + `npm run typecheck:example` + `npm run typecheck:bench` + `npm run typecheck:test`

**Batch 2 (parallel, after Batch 1 passes):** `npm run test` + `npm run build`

`npm run test` operates on source via the Vite alias — it does not depend on `npm run build`. Always run them together in Batch 2, not sequentially.

**State + format (once, at end of session — not after each individual task):**

- Update relevant `.claude/rules/*.md` files if domain patterns changed.
- `npm run format`

**When modifying the public API:** also update the owning module(s) under `example/src/features/*` to reflect the change, and update `main.ts`'s header comment index of demonstrated symbols — the example must always demonstrate the current, accurate API surface.

**When adding a new module file under `src/worker/` or `src/render/`:** also add its row to `.claude/rules/structure.md`'s Module layout table in the same session. A vaguer version of this rule ("update relevant `.claude/rules/*.md` files if domain patterns changed") is not concrete enough to fire reliably — several `src/render/` modules once went undocumented in that table for a long stretch before a later pass caught the gap, so treat the concrete rule as the operative one.

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
- Root `tsconfig.json` (inherited by `example/`) enforces `erasableSyntaxOnly` (no constructor parameter properties, no enums — declare the field and assign in the constructor body), `verbatimModuleSyntax` (type-only imports require `import type`), and `noUnusedLocals`/`noUnusedParameters` — new code, including code embedded in plans, complies or `tsc` fails
- Do not implement anything in the current release's out-of-scope list (see README.md §"What this version does not include")

## Documentation

- `docs/vision.md` — the project's design charter: North Star, the veto-bearing First-Class Principles, architectural invariants, current capability surface, settled non-goals, and uncommitted future directions. Read this to keep new work on-track; a change that conflicts with a First-Class Principle is wrong by default.
- `.claude/rules/*.md` — domain-scoped rules loaded automatically by path: `structure.md` (module layout, data flow, folder placement, build config), plus `rendering.md`, `worker.md`, `sectors.md`, `picking.md`, and `testing.md` for area-specific internals.
- `docs/research/` — architecture/engineering reference PDFs (RGB index-map rendering, GSG engine architecture, WASM/UI binding, etc.), indexed by `docs/research/README.md`.
- `docs/archive/` — per-version completion records (`v0.0.1/` …), plus the **frozen, read-only** remains of the retired sprint/phase system (the former roadmap, traceability matrix, and phase audits). A release's planning artifact is filed under its `vX.Y.Z/` directory when the version ships; nothing there is updated afterwards. Working plans are not kept in the repo — write them wherever you like outside it, and archive the final one at release. See `docs/archive/README.md`.

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

Prettier owns markdown formatting, so anchor `Edit` calls on short unique fragments rather than full copied lines — column padding in tables never matches what you type, and a full-line `old_string` fails on that whitespace. Two follow-ons: when an edit expands one row into several (or merges several into one), emit every resulting row in `new_string`, since a short anchor shrinks what you match but not what you must output; and keep `**bold**` away from text containing `**` (a glob like `test/**`), which prettier reflows into unparseable output needing a scripted repair.

### 6. Verify claims against the world, not against the checks

Typecheck, tests, and build validate that an artifact is _well-formed_. None of them validate that what it _asserts_ is true. Any claim about something outside the artifact needs its own check against that thing before it ships:

- **A plan's claims about source** — re-read the exact `file:line` for every signature, field, call site, and tsconfig flag the plan depends on rather than trusting a subagent summary. Record a short "Verified against source" note listing what was re-read; a plan without one is a visible signal the pass was skipped.
- **A plan's claims about runtime semantics** — that an API means the same thing across threads or processes as it does in-process is an assumption. Test it in a scratch script before designing on it.
- **Hardcoded content's claims about data** — skeleton rows, mocked responses, and demo defaults get diffed against the real fixture.
- **Prose's claims about measurements** — a figure is only as scoped as what was actually executed. Say what was measured, not what it resembles.

(Signals: a plan shipped `erasableSyntaxOnly`-invalid code, caught in two tool calls. A sampler was designed on `process.memoryUsage()` heap fields that are per-V8-isolate and unreadable from another thread. An example app rendered `population`/`capital`/`climate` rows against a fixture holding only `name` — passing typecheck, the suite, the build, and a manual smoke test. A README attributed a `SectorRegistry`-constructor measurement to `loadMap()`, which retains a further 64 MiB the benchmark never saw.)

### 7. Plan Mode: specify for a weaker executor

When a plan will be carried out by a weaker model — a subagent handoff, or the implementation pass after `ExitPlanMode` — write it as exact operations from the first draft, not a description to be re-derived. Give exact `old_string`→`new_string` pairs for edits, full file contents or frontmatter for new files, and an explicit source→destination checklist for any content move. Prose like "repoint the references" or "move the section" forces the executor to reconstruct specifics it can get wrong; reserve prose for rationale.

### 8. Infra-outage backoff: canary before re-batching

A tool result of "temporarily unavailable, so auto mode cannot determine the safety" is a transient classifier outage, not a content rejection — the identical call may succeed seconds later. Do not re-issue a multi-call batch or a large-payload `Write` against it repeatedly; each failure re-sends the whole payload for zero progress. Probe with one minimal call first, and resume the full batch only after that canary succeeds. Read-only tools stay live during the outage — use them to stage and verify meanwhile.

### 9. Performance: let the measurement choose the target

When the goal is speed or footprint, build the measurement before committing to a target, then re-derive the target from what it shows rather than from the hypothesis that motivated the work. A well-argued target can be the wrong one by an order of magnitude, and a plausible story about where the cost sits is not evidence. (Signal: a plan named the retained per-sector pixel arrays as the prize; removing them recovered 64 MiB but moved wall-clock 4–6%. The same benchmark showed the real cost was per-pixel hex-string construction and a triple neighbour lookup — a change the plan never considered, worth 4–6×.)
