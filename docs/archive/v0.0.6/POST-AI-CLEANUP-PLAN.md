# Post-AI Cleanup Plan — Taste-Driven, Functionality-Preserving Refactor

```
artifact_readiness: implementation-ready
tier: Deep
mode: software (technical)
produced: 2026-07-13
deepened: 2026-07-13
doc_reviewed: 2026-07-13 (ce-doc-review: coherence + feasibility + scope-guardian + adversarial; 3 HIGH, 8 MED, folds applied)
guardrail: existing test suite (~6.4k lines, ~1.5:1 vs source)
```

**North Star:** map-engine's MVP is complete, but `src/` was AI-generated with no consistent authorial taste. Make the repo read as deliberately designed (modular, extendable, maintainable) by applying the maintainer's conventions and **codifying** them so future humans and agents inherit the taste. Strictly functionality-preserving. Deliverables: (a) restyled codebase, (b) durable style codex governing future work.

**Governing insight:** the codebase's existing inconsistency IS the spec — audit what the repo actually mixes, decide only those real forks, apply. Conventions the repo never exercises are not invented.

---

## 1. Decisions Made

- **D1 — Audit-first sequencing (Approach C):** audit → codex → pilot → propagate. Grounds every convention decision in a real divergence found in THIS repo; avoids generic style guides and cross-file drift.
- **D2 — Depth ceiling: Deep.** Decomposition/seams may be reshaped where structure fights extensibility, strictly behavior-preserving. Guardrail is the existing test suite (~6.4k lines, ~1.5:1 vs source).
- **D3 — Codex split by concern:** new `.claude/rules/code-style.md` owns in-file conventions (naming, booleans, private members, comments/JSDoc, imports, member ordering, type-vs-interface); folder/module-layout conventions live in the EXISTING `.claude/rules/architecture.md` Module-layout table. No new tooling.
- **D4 — Rulings deferred to execution:** the maintainer's per-convention rulings happen at execution time in the U2 decision loop, with real code samples as the options — not pre-decided in this plan.
- **D5 — Agent-read enforcement only:** no CI, no ESLint, no pre-commit, no editorconfig, no Husky. (Hard user constraint.)
- **D6 — Structural churn isolated from in-file style:** dedicated typecheck-gated units for renames/folder-regroup (U5) and module splits (U6), THEN separate style-propagation units per subsystem (U7–U9). Pure renames/moves are verifiable by `tsc` + `npm run build` (the build catches worker `new URL(...)` string paths tsc ignores) and cleanly revertable; keeping them out of cosmetic diffs makes review and rollback tractable.
- **D7 — MapEngine.ts IS decomposed** in this effort (787 lines, 31 private members), in its own high-review unit (U6), public API unchanged.
- **D8 — Scratch artifacts live in `/tmp`, never committed:** the U1 divergence report and U2 decision record are working documents only. CLAUDE.md forbids machine-local/external persistence inside the repo; the only durable outputs are the codex, the `architecture.md` layout edits, and the refactored code.

---

## 2. Product Contract

### Actors

- **A1 — Maintainer:** owns taste; rules on each convention fork.
- **A2 — Future human contributors:** read the code cold; it should feel intentionally designed.
- **A3 — Future AI agents:** read `.claude/rules` before editing; must be BOUND by the codex; the primary enforcement audience.

### Requirements

- **R1** — All `src/**` and `test/**` conform to a single documented set of conventions (file naming, folder placement, variable/boolean naming, private-member style, type-vs-interface, comment/JSDoc density, import & member ordering).
- **R2** — Durable style codex at `.claude/rules/code-style.md` capturing every in-file convention, with one-line rationale on divisive calls.
- **R3** — Folder/module-layout conventions documented by updating the existing `.claude/rules/architecture.md` Module-layout table (not duplicated in the codex).
- **R4** — Every convention decision grounded in an actual divergence found by the audit; conventions the repo never exercises are not invented.
- **R5** — Strictly behavior-preserving; full green batch (typecheck + typecheck:example + test + build + size) on EVERY propagation batch, not just at the end.
- **R6** — Deep structural reshaping permitted (split oversized modules e.g. MapEngine.ts, regroup `src/` root, extract interfaces) only where decomposition fights extensibility, only behavior-preserving.
- **R7** — Codex written as enforceable agent directives (imperative, path-scoped auto-load on src/test edits), reconciled with existing CLAUDE.md + rules with zero contradictions.
- **R8** — Already-consistent conventions codified as-is, not "fixed" (e.g. named-only exports internally).
- **R9** — Out-of-scope trees provably untouched: README.md, CLAUDE.md prose body, `docs/**` (incl. frozen `docs/archive`), all tooling config. Only additive non-code files: the codex + architecture.md layout edits.
- **R10** — Example workspace still builds/typechecks/demonstrates the current API; `src/index.ts` keeps the same exported names; internal renames must not alter the public surface; test/example internal-path imports updated in lockstep.
- **R11** — Engineering constraints survive: ESM-only; SectorRegistry zero Three.js imports; Parser + Registry zero DOM; <15 KB gzip; no new deps.

### Key Flows

- **F1** — Divergence audit → finite grounded decision agenda.
- **F2** — Decision loop: maintainer rules each item; undecided items get a recommended default recorded as an explicit assumption.
- **F3** — Codify: write `code-style.md` + update `architecture.md` BEFORE bulk change.
- **F4** — Pilot refactor one cluster → calibrate → correct codex.
- **F5** — Propagate across remaining `src/**` and `test/**` in test-green batches.
- **F6** — Reconcile & verify: codex ↔ rules consistency, out-of-scope cleanliness, constraint check.

### Acceptance Examples

- **AE1** — Codex fixes file-naming → every src file matches, zero exceptions.
- **AE2** — Codex fixes boolean-naming → no violating boolean-typed variable remains.
- **AE3** — Each propagation batch → typecheck + typecheck:example + test + build + size all pass, gzip <15 KB.
- **AE4** — A fresh agent opens `code-style.md` → can determine file-naming/boolean/private-member/comment rules WITHOUT reading source.
- **AE5** — At done: `build:example` + `typecheck:example` pass unchanged, public API byte-identical.
- **AE6** — `git diff --stat` → README/docs/CLAUDE.md prose/tooling show NO changes; only `code-style.md` (new) + `architecture.md` (layout table) among non-code files.

---

## 3. Planning Contract — Atomic Units

Dependency order: **U1 → U2 → U3 → U4 → (U5 → U6) → (U7, U8, U9 parallel) → U10 → U11.** U4 may loop back to U3 (codex correction). U-IDs are stable and never renumbered.

Every unit below is gated by the full verification batch (`npm run typecheck` + `npm run typecheck:example`, then `npm run test` + `npm run build`, then `npm run size`) per R5/AE3. U5's structural correctness leans on `tsc` + `npm run build` (not `tsc` alone — see U5), and it still runs the full batch. Note: `build` and `size` both write `dist/`, so run `size` after `build`, never truly in parallel, or the size measurement races.

---

- U1. **Divergence audit & decision agenda**

  **Goal:** Mechanically inventory every convention the repo currently mixes — with real file:line examples and occurrence counts — and reduce it to a finite decision agenda. Nothing is decided here; the output is the agenda U2 consumes. Realizes F1. Serves R4.

  **Scope of the audit (minimum axes, seeded by known evidence — see §8):** file naming; folder placement (src root grab-bag); private-member style; boolean naming; type-vs-interface; comment/JSDoc density; import ordering; class-member ordering; export style (expected finding: already consistent → codify per R8); oversized-module candidates beyond MapEngine.ts (feeds U6) — a file becomes a candidate only if it exceeds a size threshold agreed at U2 AND exhibits a real cohesion seam; size alone never justifies a split (R6). Boolean-naming divergences are tagged public-vs-internal, since public members on exported classes (e.g. `MapRenderer.leftHasDragged`) are frozen by R10 and only internal booleans are ruled. The audit may surface additional mixed conventions; each becomes an agenda item. It must also flag conventions the repo does NOT mix, explicitly, so U3 does not invent rules for them (R4).

  **Files:** read-only over `src/**`, `test/**`. Output: divergence report + decision agenda written to `/tmp` (D8). No repo changes.

  **Dependencies:** none (entry unit).

  **Verification scenarios:**
  - Agenda completeness spot-check: every known evidence item from §8 appears as an agenda item with ≥2 real code examples and a count. (Covers the F1 exit criterion "finite grounded agenda.")
  - Grounding check: pick 3 random agenda items → each cites at least one real file:line pair per competing style; no agenda item exists that the repo doesn't actually exercise (enforces R4).
  - Repo cleanliness: `git status` after U1 shows zero repo modifications (report lives in `/tmp` only; enforces D8, R9).

---

- U2. **Convention decision loop**

  **Goal:** Walk the maintainer through the agenda one item at a time, presenting the repo's real competing samples as the options. Each item resolves to a ruling; items the maintainer declines to rule on get a recommended default recorded as an **explicit assumption** (flagged as such in the decision record and later in the codex). To bound the loop and avoid inconsistent calls, triage the agenda by **category** and rule per-category rather than per-instance (one casing ruling covers all files, not one-per-file). After all items are ruled, run a **consistency pass**: re-read the full rulings set for mutual contradiction (e.g. a casing rule a later folder rule implies differently) before U3 lifts them into the codex. Realizes F2. Serves R1.

  **Files:** decision record written to `/tmp` (D8). No repo changes.

  **Dependencies:** U1 (consumes its agenda).

  **Verification scenarios:**
  - Coverage: every U1 agenda item has exactly one disposition in the decision record — either a maintainer ruling or a flagged default-assumption. Zero unresolved items.
  - Traceability: each disposition names the winning style using a real repo sample (not an abstract description), so U3 can lift examples directly.
  - Consistency: the end-of-U2 pass confirms no two rulings mutually contradict before codex authoring.
  - Repo cleanliness: `git status` shows zero repo modifications.

---

- U3. **Author the style codex + update architecture layout table**

  **Goal:** Convert the U2 decision record into the two durable rule artifacts, BEFORE any bulk code change (F3 ordering). Realizes F3. Serves R2, R3, R7, R8.

  **Deliverable shape (directional):**
  - `.claude/rules/code-style.md` (new): imperative agent directives ("Name boolean state `isX`/`hasX`", not "we prefer…"); path-scoped frontmatter so it auto-loads when editing `src/**` or `test/**` TypeScript (matching how `architecture.md` is scoped); every rule illustrated with an example drawn from THIS repo; one-line rationale on divisive calls; default-assumption rules marked as such; already-consistent conventions codified as-is (R8) — notably the export convention: named exports only inside `src`, the `MapEngine as default` alias exists ONLY at the `src/index.ts` entry and is not to be churned. The comment/JSDoc rule (per U2/A8) **requires a JSDoc summary on every public/exported member — backfill included** — and reserves line comments for non-obvious internal privates; it authors no README or standalone docs. Both `code-style.md` and `architecture.md` open with a one-line **ownership-split header directive** — "Layout/placement conventions: architecture.md only. In-file conventions: code-style.md only. Adding a rule? Pick its home by this split." — so the boundary itself auto-loads on every edit (D3/R3 made durable, not a one-time sweep).
  - `.claude/rules/architecture.md`: Module-layout table updated to state the folder-placement/file-naming rulings (which subsystems exist, what belongs at root if anything, where new modules go). Layout conventions live here ONLY — the codex cross-references, never duplicates (R3). Note: the table also gets factual row updates later in U5/U6 when files actually move/split; this unit writes the _convention_, not the final file inventory.

  **Files:** `.claude/rules/code-style.md` (new), `.claude/rules/architecture.md` (edit).

  **Dependencies:** U2. May be re-entered from U4 (calibration loop).

  **Verification scenarios:**
  - Covers AE4: a reader with only `code-style.md` open can answer "what casing for a new file?", "how do I name a boolean?", "underscore or `private` keyword?", "when do I write JSDoc?" without opening any source file.
  - Enforces R7: sweep the codex against CLAUDE.md and every `.claude/rules/*.md` for contradictions (e.g. a codex rule that conflicts with an Engineering Constraint or with architecture.md) → zero found.
  - Enforces R3: no folder/layout rule text duplicated between the two files — codex references architecture.md for layout.
  - Enforces R4/R8: every codex rule maps back to a U1 agenda item; the "already consistent" items appear as codified rules, not TODOs.

---

- U4. **Pilot refactor & codex calibration**

  **Goal:** Apply the full codex to ONE representative cluster before mass propagation, so codex defects are found on a small blast radius. Recommended cluster: one `render/` file + one `worker/` file — e.g. `BorderRenderer` + `SpatialGraph` — plus their test files. Maintainer reviews the applied result; where the codified rule produces code that feels wrong in practice, correct the codex (loop back to U3) and re-apply to the pilot until the maintainer signs off. Realizes F4. Serves R5, R6.

  **Pilot scope constraint:** in-file style ONLY (the U5/U6 structural rules are exercised later on their own gates). If a rename rule would apply to a pilot file, note it for U5 rather than renaming here — keeps the pilot diff purely cosmetic and reviewable.

  **Files:** the two chosen source files + their tests; possibly `.claude/rules/code-style.md` (calibration edits via U3 loop).

  **Dependencies:** U3. Loops to U3 on calibration findings.

  **Verification scenarios:**
  - Covers AE3 (first instance): full verification batch green on the pilot diff; gzip size unchanged-or-smaller and <15 KB.
  - Behavior preservation (R5): zero test files gain/lose test cases; only style-level edits appear in the diff.
  - Calibration exit: maintainer explicitly approves the pilot diff; every codex correction made during the loop is reflected in `code-style.md` (no verbal-only rule changes).
  - Conformance: pilot files pass a manual sweep against every codex rule — they become the reference exemplars the codex may cite.

---

- U5. **Structural pass: renames + folder regroup**

  **Goal:** Apply the codex's file-naming and folder-placement rulings across `src/**` in one coherent batch: rename files to the ruled casing, regroup the `src/` root grab-bag (9 root files today: MapEngine, MapRenderer, SectorRegistry, SectorBitmapParser, RenderClock, types, utils, errors, index — of which 8 relocate; `index.ts` stays put per R10) into coherent subdirectories per the codex, and update ALL importers in the same batch. **NO in-file style edits, NO logic moves** — pure structure, so the diff is mechanically reviewable and `tsc` proves correctness (D6). Realizes F5. Serves R1, R10, R11.

  **Known ripple (from grounding):** `types.ts` and `errors.ts` are the only cross-subsystem import targets — moving/renaming them ripples across most of `src` plus ~13 test files. ~105 test import lines reference `src/`; all _import-specifier_ ripple is caught by `tsc`. **Non-tsc references `tsc` will NOT catch — hand-patch them in the same batch:** the worker-boot string literal in `MapEngine.ts` (`new Worker(new URL('./worker/index.ts', import.meta.url))`), the test worker URL in `PathfindingPerf.gl.spec.ts`, and any runtime fixture served-path strings (`'/test/fixtures/...'`) — all location-relative strings that break silently on a move. Grep `new URL(` / `new Worker(` / `/test/fixtures/` before and after the move; `npm run build` (Vite resolves the worker URL) is the real proof, not `tsc` alone. Test-side import fixes required for compilation happen here (mechanical path updates only); test _restyling_ waits for U10. `src/index.ts` stays at its path and keeps its exact export names (R10) — only its internal import specifiers may change.

  **Files:** `src/**` (renames/moves + import-specifier updates), `test/**` (import specifiers only), `example/src/main.ts` only if it imports internal paths (it should consume the `map-engine` alias; verify no internal-path imports break). Update `.claude/rules/architecture.md` Module-layout table rows to match the new reality in the same session (per CLAUDE.md's concrete rule for new/moved module files).

  **Dependencies:** U4 (codex is calibrated and signed off).

  **Verification scenarios:**
  - Covers AE1: post-batch listing of `src/**` filenames → every file matches the codex naming rule, zero exceptions; `src/` root contains only what the codex permits there.
  - Covers AE3: full verification batch green. The correctness proof is `tsc` (import specifiers) **plus `npm run build`** — Vite statically resolves the worker `new URL(...)` that tsc ignores — plus a grep confirming `new URL(` / `new Worker(` / `/test/fixtures/` string paths were updated.
  - Purity check (D6): the diff contains only renames/moves and import-specifier changes — no line-level edits inside function bodies. Spot-check via `git diff` with rename detection: content similarity ~100% on moved files.
  - Enforces R10: `src/index.ts` exported names byte-identical (diff the export statements); `npm run typecheck:example` green.
  - Enforces R11: constraint greps still hold post-move (SectorRegistry file — wherever it now lives — has zero `three` imports; Parser+Registry zero DOM API references).

---

- U6. **Module decomposition**

  **Goal:** Split `MapEngine.ts` (787 lines, 31 private members) along its real behavioral seams into cohesive, behavior-preserving units, with the public API (`src/index.ts` exports, including the `MapEngine as default` alias) unchanged (D7). MapEngine is the **only mandated** split (D7); any other split requires a U1-recorded cohesion-seam agenda item first. Candidates by size (SectorRegistry.ts 424, MapRenderer.ts 398, ThreeRenderBackend.ts 313) are split only where U1 found a real cohesion seam, per R6's "only where decomposition fights extensibility" — size alone is never sufficient. Highest review burden of the effort. Realizes F5. Serves R6, R10, R11.

  **Directional guidance (not choreography):** find seams by responsibility clusters among the 31 private members (e.g. lifecycle vs. input wiring vs. worker orchestration vs. overlay/state bookkeeping — the implementing agent identifies the actual clusters from the code). Extracted collaborators follow the codex's placement rules from U5 and stay internal (named exports, not re-exported from `src/index.ts`). MapEngine remains the facade; extraction must not convert private state into new public API. If a candidate split does not produce a clearly more cohesive unit, don't split — R6 permits, it does not mandate. Because the lifecycle methods (reset/destroy at `MapEngine.ts:228–252`, `loadMap`) touch every cluster at once, each extracted collaborator must expose a **narrow lifecycle method (e.g. `dispose()`)** that MapEngine coordinates — extraction must NOT introduce field-level getters/setters to reach a collaborator's internals (that is the private-state leak R6/D7 forbid). If a candidate seam cannot meet this, hold MapEngine intact rather than ship a leaky wrapper.

  **Files:** `MapEngine.ts` (post-U5 path) + new extracted modules; possibly other flagged oversized files + their extractions; `test/**` import updates if tests reach into split internals; `.claude/rules/architecture.md` Module-layout table rows for every new module file (same-session, per CLAUDE.md).

  **Dependencies:** U5 (splits land in the final folder structure, avoiding double-moves).

  **Verification scenarios:**
  - Covers AE3 + R5: full verification batch green. **Pre-step:** inventory every `test[...]['_x']` bracket-string reach-in into MapEngine privates (`['_backend']`×24, `['_registry']`, `['_worker']`, `['_proxy']`, `['_mapModes']`, …), classify each as behavioral vs structural, and rewrite structural reach-ins to behavioral assertions _before_ splitting — so the split is validated by behavior, not by preserved private layout. Test **access-path** edits for relocated privates are budgeted into U6 (not deferred to U10); no _behavioral_ assertion is weakened to make a test pass.
  - Covers AE5 / enforces R10: `src/index.ts` export list byte-identical, including `MapEngine as default`; `typecheck:example` + `build:example` green with no example-code change.
  - Enforces R11: `npm run size` <15 KB gzipped (single-entry ES lib bundle — splits must not regress `npm run size`; internal tree-shaking is not consumer-facing here); constraint greps re-run.
  - Cohesion check: each extracted module has a one-line statable responsibility, recorded as its architecture.md table row; no extracted module imports back into MapEngine (no cycles).
  - Leak check: no extracted collaborator exposes field-level getters/setters for MapEngine to reach its internals; reset/destroy/`loadMap` coordinate via narrow lifecycle methods only.
  - **Required example-app smoke gate:** `npm run example`, load a fixture map, confirm render + one pick interaction + a resize — exercising the rAF loop body, worker boot, and in-loop resize path that the unit suite (via `advanceFrame`) provably bypasses. Required for U6, not an optional fallback.
  - **Exit criterion:** loop-body / bootstrap-sequencing logic is _move-only_ — no reordering; any reordering of the rAF loop or worker handshake requires explicit manual rAF-path verification before U6 is green.

---

- U7. **Style propagation: core + render**

  **Goal:** Apply the in-file conventions (naming, booleans, private-member style, comment/JSDoc density, import ordering, member ordering, type-vs-interface) to the **core files at their final post-U5 paths** — the former src-root modules (MapEngine + its U6 extractions, MapRenderer, RenderClock, types, utils, errors, and anything still at the core location) plus all of `src/render/**`. A file's owning style-unit is fixed by its _final_ U5 location: any former-root file that U5 relocated into `worker/`, `input/`, or `internal/` (e.g. if Parser/Registry move under `worker/`) is styled by U8/U9, not U7 — keeping the U7/U8/U9 file sets genuinely disjoint. Realizes F5. Serves R1, R11.

  **Files:** core module files (at their post-U5 paths) + `src/render/**`. No test _restyling_ (that is U10), no renames (done), no logic changes — but since every unit is independently full-batch-gated, U7–U9 MAY make the minimal **mechanical identifier-sync** edits to tests that a renamed private forces (dotted or `['_x']` bracket-string reach-ins) to keep the gate green. Anything beyond identifier-sync waits for U10.

  **Dependencies:** U6. Runs in parallel with U8, U9 (disjoint file sets; the U5/U6 structure is frozen underneath them).

  **Verification scenarios:**
  - Covers AE2 (this subsystem's share): grep for boolean-typed declarations in the touched files → all conform to the ruled naming pattern.
  - Covers AE3: full verification batch green on the batch.
  - Conformance sweep: per-file check against each codex rule (private-member style, JSDoc density rule, import/member ordering) → zero exceptions in the touched set.
  - Enforces R5: diff review shows no behavioral edits — renamed identifiers are internal only; `src/index.ts` export names untouched (public renames are out of scope by R10). Note: per the U2/A8 maintainer override, U7–U9 **backfill** a JSDoc summary on every public/exported member; the conformance sweep asserts every public/exported member carries a JSDoc block (not that net-new count is ~0). Internal privates get line comments only where non-obvious.

---

- U8. **Style propagation: worker**

  **Goal:** Same in-file convention application for `src/worker/**`. Extra care: this subsystem carries the hard environment constraints — `SectorBitmapParser` + `SectorRegistry` + worker files must keep zero DOM access, and `SectorRegistry` zero Three.js imports (wherever those files live post-U5; the constraint follows the module, not the old path). Realizes F5. Serves R1, R11.

  **Files:** `src/worker/**` (post-U5 layout).

  **Dependencies:** U6. Parallel with U7, U9.

  **Verification scenarios:**
  - Covers AE2/AE3 for this file set (same pattern as U7).
  - Enforces R11: post-batch greps — zero `three` import specifiers in SectorRegistry's module; zero DOM/`window`/`document` references in Parser + Registry + worker modules. (Anchor any path-filtered greps on `(^|/)` per CLAUDE.md operational note.)
  - Conformance sweep as in U7, zero exceptions.

---

- U9. **Style propagation: input + internal**

  **Goal:** Same in-file convention application for `src/input/**` and `src/internal/**` — completing full `src/**` coverage together with U7/U8. (Boolean-naming rulings apply to _internal_ booleans only; public booleans on exported classes — e.g. `MapRenderer.leftHasDragged` — are frozen by R10 and recorded as explicit codex exemptions, not "fixed".) Realizes F5. Serves R1.

  **Files:** `src/input/**`, `src/internal/**` (post-U5 layout).

  **Dependencies:** U6. Parallel with U7, U8.

  **Verification scenarios:**
  - Covers AE2 for this file set — after U7+U8+U9 complete, a repo-wide boolean-naming grep over `src/**` finds zero violations (AE2 fully discharged).
  - Covers AE3: full verification batch green.
  - Conformance sweep as in U7, zero exceptions; combined with U7/U8 this closes R1 for `src/**`.

---

- U10. **Test suite restyle + import reconciliation**

  **Goal:** Apply the codex's conventions to `test/**` (the codex governs tests too, per R1 — though U2 may have ruled test-specific relaxations, which the codex states explicitly), and reconcile the ~105 test import lines referencing `src/` against the final U5/U6 paths. Tests are restyled, never added to or strengthened/weakened (identity boundary). **Exemption:** `test/fixtures/**` data files (PNG/JSON) and the four `.js` fixture generators are OUT of the naming/restyle sweep — they are referenced by runtime served-path strings (`'/test/fixtures/...'`) that `tsc` cannot see; if any fixture _is_ renamed, its served-path strings and generator output paths are updated by grep, not tsc. Realizes F5. Serves R1, R10.

  **Files:** `test/**` only.

  **Dependencies:** U7, U8, U9 (source names are final, so test-side identifier references restyle once, not twice).

  **Verification scenarios:**
  - Covers AE3: full verification batch green.
  - Behavior-guardrail integrity: test count (files and cases) identical before/after; no assertion logic altered — the suite must remain the same guardrail it was at U1 (`vitest run` reported test totals match).
  - Import reconciliation: zero test imports reference retired paths; grep for old module specifiers → no hits.
  - Conformance sweep over `test/**` against the codex (including any ruled test-specific relaxations) → zero exceptions. Closes R1.

---

- U11. **Final reconciliation & verification**

  **Goal:** End-to-end acceptance pass proving the whole contract, not just per-unit gates. Realizes F6. Enforces AE1–AE6, R7, R9, R11.

  **Files:** read-only, except final small codex/architecture.md consistency touch-ups if the sweep finds drift (e.g. a rule worded before a late U4-loop correction).

  **Dependencies:** U10 (everything landed).

  **Verification scenarios (the acceptance suite):**
  - Covers AE1: full `src/**` filename listing vs codex naming rule — zero exceptions.
  - Covers AE2: repo-wide boolean-declaration sweep over `src/**` + `test/**` — zero violations.
  - Covers AE3: one final full batch — typecheck, typecheck:example, test, build, size — all green, gzip <15 KB.
  - Covers AE4: fresh-reader test of `code-style.md` (can answer the four canonical questions without source access).
  - Covers AE5: `build:example` + `typecheck:example` pass with zero example changes beyond what R10 permitted; `src/index.ts` public export surface identical to pre-U1 baseline (diff against the recorded baseline export list: type re-exports from types module, the 7 named errors, `toHexKey`, `SectorBitmapParser`, `SectorRegistry`, `MapRenderer`, `MapEngine` + `as default`, `RenderClock`).
  - Covers AE6 / enforces R9: `git diff --stat` against the pre-effort baseline — README.md, CLAUDE.md, `docs/**`, and all tooling config show zero changes; the only non-code deltas are `code-style.md` (new) and `architecture.md` (layout table edits).
  - Enforces R7: final contradiction sweep codex ↔ CLAUDE.md ↔ all `.claude/rules/*.md` — zero conflicts; architecture.md Module-layout table matches the actual final file tree row-for-row.
  - Enforces R11: constraint greps (SectorRegistry zero `three`; Parser+Registry+worker zero DOM; no CJS/UMD artifacts in `dist/`; `package.json` dependency set unchanged).
  - Enforces D8: no `/tmp` scratch artifact (divergence report, decision record) was committed; `git log --stat` for the effort contains no such files.

---

## 4. High-Level Technical Design (directional)

**Pipeline shape.** The effort is a strict pipeline with one calibration loop: evidence (U1) → rulings (U2) → law (U3) → pilot (U4, loops to U3) → structure (U5→U6) → style fan-out (U7‖U8‖U9) → tests (U10) → acceptance (U11). The codex is finished and signed off before any mass edit; the pilot is the only place codex text and code change interleave.

**Why structure before style (D6).** Renames/moves/splits change file identity; style changes line content. Interleaving them produces diffs where `git` rename detection fails and review cost explodes. Sequencing structure first means: U5's diff is provable by `tsc` + `npm run build` (the build resolves the worker `new URL(...)` that tsc ignores) + rename-similarity; U6's diff is provable by the test suite backed by a required example-app smoke gate (the unit suite bypasses the rAF loop body); and U7–U10's diffs are pure content edits on stable paths.

**Highest-risk edges.**

- The `types.ts` / `errors.ts` move (U5): only cross-subsystem import targets in the repo → widest ripple, but 100% tsc-caught.
- The MapEngine split (U6): 787 lines / 31 private members of orchestration logic; the test suite is the safety net, and the split must not leak new public surface.
- Codex miscalibration discovered late: mitigated by U4's pilot gate — no propagation starts until the maintainer approves applied-in-anger output.

**Parallelism.** U7/U8/U9 touch disjoint trees over a frozen structure and may run in parallel (or as sequential batches if a single agent executes — each still individually batch-gated per R5). Each file's owning style-unit is fixed by its final U5 location, so the trees are genuinely disjoint even for former-root files U5 relocated.

**What the codex governs vs. architecture.md.** Codex: everything decidable while looking at one file. Architecture.md Module-layout table: everything decidable only by looking at the tree (which folder, which subsystem, what the file is named at creation). One rule, one home; cross-reference, never duplicate (R3).

---

## 5. Risks & Dependencies

| Risk                                                                                                          | Impact                                                                                       | Mitigation                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex rule reads well but produces ugly code at scale                                                         | Rework across all propagation units                                                          | U4 pilot gate with maintainer sign-off before any propagation; U4→U3 loop is expected, not exceptional                                                                                                          |
| MapEngine split breaks subtle rAF/worker orchestration behavior                                               | Regression the suite may only partially catch (harness bypasses rAF loop per CLAUDE.md note) | Keep U6 splits along state-cluster seams without reordering logic; loop-body logic is move-only; **required `npm run example` smoke gate per U6 batch** (worker boot + resize + pick), not an optional fallback |
| `types`/`errors` rename ripple misses a dynamic/non-tsc reference                                             | Runtime break tsc can't see                                                                  | Repo-wide grep for old specifier strings post-U5 in addition to tsc; ~105 test import lines are all static                                                                                                      |
| Tests coupled to internal names (private `_` members, e.g. `renderer['_animFrameId']`) break under U7 renames | Suite noise misread as behavior change                                                       | U10 sequenced after U7–U9; identifier-only test edits are expected and reviewed as mechanical                                                                                                                   |
| Splitting modules inflates bundle past 15 KB                                                                  | R11 violation                                                                                | `npm run size` in every unit's gate, not just U11                                                                                                                                                               |
| Maintainer unavailable mid-decision-loop                                                                      | U2 stalls the pipeline                                                                       | D4/F2 fallback: recommended default recorded as explicit assumption; assumption-flagged rules revisitable without re-running the effort                                                                         |
| Codex contradicts an existing rule/constraint                                                                 | Agents receive conflicting law                                                               | R7 contradiction sweep in both U3 and U11                                                                                                                                                                       |

**External dependencies:** none — no new tooling, no new packages (D5, R11). The only human dependency is maintainer availability for U2 rulings and the U4 review.

---

## 6. Scope Boundaries

**IN:** `src/**` and `test/**` in-file style + naming; repo structure (folder layout, file naming, src-root de-grab-bag); the codex + architecture.md layout edits; Deep behavior-preserving reshaping (module splits, root regroup, interface extraction where cohesion demands).

**OUT:** any behavior/API/feature change; documentation prose (README, CLAUDE.md body, `docs/vision.md`, `docs/research`); `docs/archive` (frozen); tooling of any kind (CI/CD, ESLint, pre-commit, editorconfig, Husky); dependency changes.

**Outside this product's identity:**

- NOT a hardening/robustness effort — no new error handling, defensive rewrites, or performance work.
- NOT a test-coverage effort — tests are restyled, not added to.
- NOT a broad documentation-writing effort — no README / `docs/` / CLAUDE.md prose. **Exception (maintainer override, U2/A8):** U7–U9 backfill a JSDoc summary on every public/exported member per the codex; this net-new prose lives only in code files. The codex (plus the `architecture.md` layout-table edits) remains the only _standalone_ prose artifact.
- NOT an enforcement-tooling effort — enforcement is agent-read rules only (D5).

---

## 7. Definition of Done

All of the following, verified in U11:

1. AE1–AE6 all pass as specified in §2.
2. R1–R11 each individually discharged (R1 via the U7–U10 conformance sweeps; R2/R3/R7/R8 via the codex artifacts; R4 via U1↔codex traceability; R5 via per-unit green batches; R6 via U6; R9 via the diff-stat check; R10 via the byte-identical export surface; R11 via constraint greps + size).
3. The codex and architecture.md are the ONLY durable non-code outputs; `/tmp` artifacts uncommitted (D8).
4. Maintainer has signed off on the U4 pilot and, implicitly through it, on the codex as applied law.

---

## 8. Evidence Appendix (grounding — sampled live, do not re-derive)

- **Scale:** `src` ~4,219 lines / 28 TS files; `test` ~6,355 lines. Biggest files: MapEngine.ts 787, SectorRegistry.ts 424, MapRenderer.ts 398, ThreeRenderBackend.ts 313.
- **File naming, three-way mix:** PascalCase class modules (MapEngine.ts, BorderRenderer.ts); camelCase handler modules (aggregationHandlers.ts, borderHandlers.ts, pathfindingHandlers.ts, anchorHandlers.ts, callHandlers.ts); lowercase utilities (color.ts, utils.ts, polylabel.ts, state.ts, yield.ts, types.ts, errors.ts). No kebab-case anywhere.
- **Private members, mixed:** heavy `_underscore` (719 refs) AND the `private` keyword (~10 files); zero `#private` fields.
- **Boolean naming, mixed:** `isPanning`/`isLeftDragging`/`isClick` vs bare `inside`/`seeded`.
- **Comment/JSDoc density, uneven:** MapEngine 23 JSDoc blocks, SectorRegistry 5, InputController 2.
- **type vs interface, mixed:** 17 `interface`, 8 `type`.
- **src/ root grab-bag:** 9 root files (MapEngine, MapRenderer, SectorRegistry, SectorBitmapParser, RenderClock, types, utils, errors, index) beside `render/`, `worker/`, `input/`, `internal/` subdirs — e.g. RenderClock.ts at root while ThreeRenderBackend.ts lives in `render/`.
- **Exports, already consistent (codify, don't churn — R8):** internal modules 100% named exports, zero `export default`; the package entry `src/index.ts` alone provides `export { MapEngine as default }`.
- **Import coupling:** cross-subsystem imports only ever target `../types` and `../errors` (both root files) → the two highest-fan-in rename targets (ripple across most of `src` + ~13 test files); `worker/`, `render/`, `input/` are otherwise mutually decoupled. 105 test import lines reference `src/`; all _import-specifier_ ripple is tsc-caught — but the worker-boot `new URL('./worker/index.ts', …)` string in MapEngine.ts, the test worker URL, and fixture served-path strings are NOT (caught by `npm run build` / a string grep instead).
- **Public surface (must stay stable):** `src/index.ts` exports: `type *` from types; the 7 named errors; `toHexKey`; `SectorBitmapParser`; `SectorRegistry`; `MapRenderer`; `MapEngine` (+ `as default`); `RenderClock`.
- **Verification batch:** `npm run typecheck` + `npm run typecheck:example` (parallel), then `npm run test` + `npm run build` (parallel), then `npm run size` (<15 KB gzipped). Gates every unit.
- **Engineering constraints that must survive:** ESM only; SectorRegistry zero Three.js imports; SectorBitmapParser + SectorRegistry zero DOM (worker-compatible); no new dependencies.

---

## 9. Handoff Notes for the Implementing Agent

- Start at U1; do not skip ahead — U5+ depends on a signed-off codex, and the codex depends on rulings that do not exist yet (D4).
- U2 is interactive: present real code samples as the options, one item per exchange; never batch-decide on the maintainer's behalf. Record declined items as assumption-flagged defaults and move on.
- Respect CLAUDE.md's operational directives during execution (grep-before-read on tests, parallel verification batches, `(^|/)`-anchored path filters, targeted reads).
- When U5/U6 create or move module files under `src/worker/` or `src/render/`, update the architecture.md Module-layout table in the same session — CLAUDE.md treats this as a hard rule.
- All scratch output (`U1` report, `U2` record) goes to `/tmp` and is never committed (D8). The repo's durable deltas are exactly: refactored `src/**` + `test/**`, `.claude/rules/code-style.md`, and `.claude/rules/architecture.md` layout edits.
- Capture the pre-effort baseline before U5 begins (the `src/index.ts` export list and a `git diff --stat` reference point) — U11's AE5/AE6 checks diff against it.
