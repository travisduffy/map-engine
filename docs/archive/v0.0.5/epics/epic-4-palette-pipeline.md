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

- Replace the `CanvasTexture` display path with a `ShaderMaterial` (or `RawShaderMaterial`): vertex passthrough; fragment samples the R32UI index texture (Epic 1 Task 1.3) with `usampler2D`, indexes a palette LUT (a `sectorCount×1` RGBA `DataTexture` — LUT texture rather than uniform array, since `sectorCount` can reach 65,535 and uniform arrays cap far lower), outputs the palette color. ID `0xFFFF`/void renders the conventional void color. Set `NearestFilter` (min + mag) and `generateMipmaps = false` on the LUT `DataTexture` — same convention as the existing `CanvasTexture` setup (`src/render/ThreeRenderBackend.ts`) — since linear filtering or mipmapping would blend adjacent palette entries into incorrect colors. **Texture-width guard:** at construction, check `gl.getParameter(gl.MAX_TEXTURE_SIZE)`; a `sectorCount` (up to 65,535) may exceed this limit on many GPUs (integrated/mobile parts commonly cap at 8,192–16,384, and even high-end desktop parts are not guaranteed ≥ 65,536). If `sectorCount > MAX_TEXTURE_SIZE`, wrap the LUT into a 2D layout (`width = min(sectorCount, MAX_TEXTURE_SIZE)`, `height = ceil(sectorCount / width)`, fragment shader computes `(id % width, floor(id / width))`) rather than assuming a flat `sectorCount×1` row always fits.
- Implement private `_writePaletteUniform(colors: Uint32Array)` in `ThreeRenderBackend` — the single write path that updates the LUT texture and flags it for upload.
- Add `@internal _setPaletteUniformDirect(colors: Uint32Array)` wrapping `_writePaletteUniform` for the benchmark harness (F-3.4 "API Relationship").
- Route `updateUniforms({palette})` to `_writePaletteUniform`.
- Preserve `setSectorColor`/`resetSectorColor` behavior on top of the palette path (patch the LUT entry for that sector) so the existing public API and example keep working; default palette = each sector's identity color. **This spans `MapRenderer.ts`, not only `ThreeRenderBackend.ts`:** the current pixel-iteration implementation (`displayImageData`, `displayCtx`, `_texture`, and the public `setSectorColor`/`resetSectorColor` methods) lives entirely in `MapRenderer.ts`, along with the `_inTick` fast path `MapEngine.setSectorColor`/`resetSectorColor` route through (`_patchSectorPixels`, `_patchSectorPixelsFromSource`, `_pendingDirtyRect`, `_flushPendingDirty` — see `MapEngine.ts` `_inTick` branch). All of these must be migrated to LUT-entry patches (or removed, since an O(1) LUT write needs no bbox/dirty-rect batching); leaving the `_inTick` path untouched would silently no-op sector color changes made from inside an `onFrame` callback once the CanvasTexture is gone. Since a single-sector LUT write is already O(1), same-tick calls only need the write batched behind one texture upload — set the dirty flag at the point of mutation (ROADMAP §2 A1 forward-looking contract: "future milestones that mutate render state MUST set the dirty flag at the point of mutation") and flush the LUT upload once per tick (reuse the existing `_flushPendingDirty` hook point), not once per call.
- `NullRenderBackend`: no-op implementations retaining the last-written palette for assertions (F-2.8).

**Done when:** `*.gl.spec.ts` renders the 4×4 fixture, swaps a palette, and asserts via `gl.readPixels` that all sector pixels change in one frame; spy test asserts zero index-texture re-uploads across 10 palette swaps; existing `setSectorColor` tests pass (including the `_inTick`/`onFrame` code path); a synthetic-`sectorCount`-above-`MAX_TEXTURE_SIZE` test (or a mocked `gl.getParameter`) proves the 2D-wrap fallback is exercised, not just the flat-row layout.

---

### Task 4.2 — B2 performance gate

**PRD Reference:** §"Acceptance Criteria — Epic 4"; ROADMAP §8 B2 Acceptance, §12.2 Performance Gates.

**Work:**

- Playwright spec (pattern: `bench/` or `*.gl.spec.ts`) against `test/fixtures/maps/large.png`: bracket `_setPaletteUniformDirect` + forced render with `performance.now()`; median of 10 swaps < 1 ms on reference hardware.
- Commit the output JSON, per ROADMAP §12.2 (perf gates run locally before merge or on the GPU runner; CI gets 5.0× tolerance).
- **Non-reference-hardware fallback:** if the executing session's hardware/GPU is not reference-grade (e.g., no dedicated recent GPU, or WebGL2 falls back to software rendering — check `gl.getParameter(gl.RENDERER)`), do not block on inaccessible reference hardware. Instead, run the measurement locally, record the actual renderer string and measured median in the checked-in JSON, apply the same 5.0× tolerance the ROADMAP grants CI's software-rendered path, and note in PROGRESS.md that the result is unverified against reference hardware pending a GPU-runner or reference-hardware re-run.

**Done when:** measured median recorded in the checked-in JSON and in PROGRESS.md; gate passes on reference hardware (or documented 5.0×-tolerance pass — CI or local non-reference hardware — with the renderer string and fallback rationale noted).

---

### Task 4.3 — CA-7 public map-mode API

**PRD Reference:** §"Acceptance Criteria — Epic 4"; ROADMAP §8 CA-7 (normative state machine, F-3.6).

**Work:**

- `MapEngine.registerMapMode(id: string, colors: Uint32Array): void` — synchronous validation: duplicate `id` throws; `colors.length !== sectorCount` throws. Palettes stored in a Main-side `Map<string, Uint32Array>`.
- `MapEngine.setMapMode(id: string): void` — synchronous: unknown id throws `Error('Unknown map mode: <id>')`; already-active id no-ops (zero uniform writes, zero dirty mutations); otherwise sets dirty flag and calls `updateUniforms({palette})` immediately. No Worker message. **`ModeNotReadyError` (`src/errors.ts`, created in Epic 1 Task 1.2; ROADMAP §12.5 now specifies: "Thrown if `registerMapMode`/`setMapMode` called before `loadMap()` resolves" — Hardening Sync):** both methods throw it pre-`loadMap` (mirrors the existing `!this._loaded` guard pattern used by `getSector`/`setSectorColor`/etc. in `MapEngine.ts`, but with this dedicated error type since a palette registry/backend doesn't exist yet to validate against).
- F-3.6 Registration Atomicity (**resolved by BDFL ruling — ROADMAP §8 CA-7 step 4, Hardening Sync**): `registerMapMode` is fully synchronous (validate → persist, no awaited work), so no "in-flight" window exists. Do **not** implement `pendingMapMode`, buffering fields, or the `'mapModeRegistrationFailed'` event — the former F-3.6 buffering prose described unreachable states presuming an async registration path that does not exist, and has been removed from the roadmap (PR-4: no API surface for impossible conditions). If a future task genuinely requires an async registration gap, stop and escalate rather than silently designing one in.
- Lifecycle: `loadMap()`/`dispose()` discard the palette registry (interlocks with Epic 3 Task 3.3; no buffered-call state exists).
- Add `MapModeId` type to `src/types.ts`; export errors/types from `src/index.ts`; update `example/src/main.ts` to register and toggle at least two map modes (this becomes the Quickstart demo surface).

**Done when:** deterministic single-frame rAF-hook test proves one submit per mode change and zero for repeat-id; validation-throw tests pass, including `ModeNotReadyError` on pre-`loadMap` calls to `registerMapMode`/`setMapMode`; lifecycle test proves palettes are gone after `loadMap`.

---

### Task 4.4 — Hobbyist Quickstart verification

**PRD Reference:** §"Acceptance Criteria — Epic 4" (Phase 3 exit gate); ROADMAP §8 Phase Exit Gate.

**Work:**

- Verify a developer can build a working sample in ≤ 1 hour using only the public API on a zero-config static host: build the example (`npm run build:example`), serve `example/dist` statically (no COOP/COEP headers), confirm load/pan/zoom/pick/map-mode all function.
- **Serve from a non-root subpath, not just the directory root.** ROADMAP/PRD name GH Pages project sites specifically (e.g., `https://user.github.io/map-engine/`), which are subpath deployments, not domain-root. `example/index.html` currently references `/src/style.css` with a leading slash and `example/vite.config.ts` sets no `base`, so a root-relative smoke test (serving `example/dist` as the webroot) will pass trivially but does not verify the actual GH Pages case. Serve the built `example/dist` under a nested path (e.g., `npx serve .` from a parent directory, hitting `/example/dist/index.html`) to confirm assets still resolve; if they 404, that is a real config gap in `example/vite.config.ts` (missing `base`) to flag for a follow-up task rather than a false pass.
- Write the verification narrative (steps, timing, host used) into the phase-3 audit summary (Task 4.5).

**Done when:** static-host smoke test passes with the built example under both a root path and a simulated GH-Pages-style subpath; narrative captured.

---

### Task 4.5 — Phase 3 exit: audit summary + halt

**PRD Reference:** §"Process constraints"; ROADMAP §3 Phase Exit Gates; `.claude/rules/roadmap-governance.md`.

**Work:**

- Run the full verification matrix in parallel per CLAUDE.md §Operational Efficiency 3: `npm run test` ∥ `npm run build` + all four `bin/check-*.sh` ∥ both typechecks. All must pass; `npm run size` < 15 KB. Note: `npm run size` (`vite build && gzip -c dist/index.js | wc -c`) only prints a byte count — it has no built-in pass/fail threshold — so the 15 KB (15,360-byte) comparison must be done manually against the printed number when writing the audit summary, not assumed to fail the command automatically.
- Write the engineer summary to `docs/audits/phase-3-audit.md` (milestone table B3.a/B3.b/B3.c/B2/CA-7, PR-1..PR-5 compliance notes, **explicit restatement of PRD Documented Deviation 1 with the PR-3 byte-count rationale**, Quickstart narrative) with `Status: [PENDING]`.
- Update PROGRESS.md (Epics 1–4 `[x]`, session log), run `npm run format`, emit `PHASE_EXIT_AWAITING_AUDIT` to the operator, and **terminate the session**. Epic 5 must not begin until the audit `[PASS]` is merged to `main`.

**Done when:** audit file committed with `Status: [PENDING]`; signal emitted; session ended without starting Phase 4 work.
