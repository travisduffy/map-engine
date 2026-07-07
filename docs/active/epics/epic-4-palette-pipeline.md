# Epic 4: GPU Palette Pipeline & Map Modes (B2 + CA-7) — Phase 3 Exit

**Objective:** Replace CPU pixel-iteration recoloring with a fragment-LUT palette shader (< 1 ms full-map recolor) and expose the public `registerMapMode`/`setMapMode` API, then close Phase 3 through the audit gate.
**Scope:** Incorporates PRD §"Acceptance Criteria — Epic 4", §"GPU pipeline". Normative detail: ROADMAP §8 (B2, CA-7, F-3.4, F-3.6), §3 (Phase Exit Gates).

**Verifiable & Measurable Success Criteria:**

- **Recolor latency:** full-map palette swap completes < 1 ms on reference hardware (Playwright + real Chromium WebGL2, `performance.now()` bracketing; 5.0× CI tolerance on software rendering).
- **Upload discipline:** palette swaps write only the palette uniform/LUT texture — zero `texImage2D`/`texSubImage2D` calls against the index texture (spy-asserted).
- **Render economy:** `setMapMode(id)` → exactly one render submit on the next rAF; consecutive `setMapMode(currentId)` → zero submits, zero uniform writes.
- **Phase 3 exit:** integrity suites green, Hobbyist Quickstart verified, `docs/audits/phase-3-audit.md` summary committed, `PHASE_EXIT_AWAITING_AUDIT` emitted, session terminated.

---

## Tasks

### Task 4.1 — Fragment LUT shader in `ThreeRenderBackend` (B2)

**PRD Reference:** §"GPU pipeline".

**Work:**

- Replace the `CanvasTexture` display path with a `ShaderMaterial` (or `RawShaderMaterial`): vertex passthrough; fragment samples the R32UI index texture (Epic 1 Task 1.3) with `usampler2D`, indexes a palette LUT (a `sectorCount×1` RGBA `DataTexture` — LUT texture rather than uniform array, since `sectorCount` can reach 65,535 and uniform arrays cap far lower), outputs the palette color. ID `0xFFFF`/void renders the conventional void color.
- Implement private `_writePaletteUniform(colors: Uint32Array)` in `ThreeRenderBackend` — the single write path that updates the LUT texture and flags it for upload.
- Add `@internal _setPaletteUniformDirect(colors: Uint32Array)` wrapping `_writePaletteUniform` for the benchmark harness (F-3.4 "API Relationship").
- Route `updateUniforms({palette})` to `_writePaletteUniform`.
- Preserve `setSectorColor`/`resetSectorColor` behavior on top of the palette path (patch the LUT entry for that sector) so the existing public API and example keep working; default palette = each sector's identity color.
- `NullRenderBackend`: no-op implementations retaining the last-written palette for assertions (F-2.8).

**Done when:** `*.gl.spec.ts` renders the 4×4 fixture, swaps a palette, and asserts via `gl.readPixels` that all sector pixels change in one frame; spy test asserts zero index-texture re-uploads across 10 palette swaps; existing `setSectorColor` tests pass.

---

### Task 4.2 — B2 performance gate

**PRD Reference:** §"Acceptance Criteria — Epic 4"; ROADMAP §8 B2 Acceptance, §12.2 Performance Gates.

**Work:**

- Playwright spec (pattern: `bench/` or `*.gl.spec.ts`) against `test/fixtures/maps/large.png`: bracket `_setPaletteUniformDirect` + forced render with `performance.now()`; median of 10 swaps < 1 ms on reference hardware.
- Check the output JSON in per ROADMAP §12.2 (perf gates run locally before merge or on the GPU runner; CI gets 5.0× tolerance).

**Done when:** measured median recorded in the checked-in JSON and in PROGRESS.md; gate passes on reference hardware (or documented 5.0×-tolerance CI pass with local verification noted).

---

### Task 4.3 — CA-7 public map-mode API

**PRD Reference:** §"Acceptance Criteria — Epic 4"; ROADMAP §8 CA-7 (normative state machine, F-3.6).

**Work:**

- `MapEngine.registerMapMode(id: string, colors: Uint32Array): void` — synchronous validation: duplicate `id` throws; `colors.length !== sectorCount` throws. Palettes stored in a Main-side `Map<string, Uint32Array>`.
- `MapEngine.setMapMode(id: string): void` — synchronous: unknown id throws `Error('Unknown map mode: <id>')`; already-active id no-ops (zero uniform writes, zero dirty mutations); otherwise sets dirty flag and calls `updateUniforms({palette})` immediately. No Worker message.
- F-3.6 in-flight buffering: `pendingMapMode: string | null`, resolve/drop/clear semantics and `'mapModeRegistrationFailed'` emission exactly per ROADMAP §8 CA-7 step 4.
- Lifecycle: `loadMap()`/`dispose()` discard buffered calls and the palette registry (interlocks with Epic 3 Task 3.3).
- Add `MapModeId` type to `src/types.ts`; export errors/types from `src/index.ts`; update `example/src/main.ts` to register and toggle at least two map modes (this becomes the Quickstart demo surface).

**Done when:** deterministic single-frame rAF-hook test proves one submit per mode change and zero for repeat-id; validation-throw tests pass; lifecycle test proves palettes are gone after `loadMap`.

---

### Task 4.4 — Hobbyist Quickstart verification

**PRD Reference:** §"Acceptance Criteria — Epic 4" (Phase 3 exit gate); ROADMAP §8 Phase Exit Gate.

**Work:**

- Verify a developer can build a working sample in ≤ 1 hour using only the public API on a zero-config static host: build the example (`npm run build:example`), serve `example/dist` statically (no COOP/COEP headers), confirm load/pan/zoom/pick/map-mode all function.
- Write the verification narrative (steps, timing, host used) into the phase-3 audit summary (Task 4.5).

**Done when:** static-host smoke test passes with the built example; narrative captured.

---

### Task 4.5 — Phase 3 exit: audit summary + halt

**PRD Reference:** §"Process constraints"; ROADMAP §3 Phase Exit Gates; `.claude/rules/roadmap-governance.md`.

**Work:**

- Run the full verification matrix in parallel per CLAUDE.md §Operational Efficiency 3: `npm run test` ∥ `npm run build` + all four `bin/check-*.sh` ∥ both typechecks. All must pass; `npm run size` < 15 KB.
- Write the engineer summary to `docs/audits/phase-3-audit.md` (milestone table B3.a/B3.b/B3.c/B2/CA-7, PR-1..PR-5 compliance notes, **explicit restatement of PRD Documented Deviation 1 with the PR-3 byte-count rationale**, Quickstart narrative) with `Status: [PENDING]`.
- Update PROGRESS.md (Epics 1–4 `[x]`, session log), run `npm run format`, emit `PHASE_EXIT_AWAITING_AUDIT` to the operator, and **terminate the session**. Epic 5 must not begin until the audit `[PASS]` is merged to `main`.

**Done when:** audit file committed with `Status: [PENDING]`; signal emitted; session ended without starting Phase 4 work.
