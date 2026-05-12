# Epic 2: Phase 1 Momentum Extraction

**Objective:** Eliminate obvious waste and harden the rendering pipeline by unifying input handling and gating GPU submits.
**Scope:** Incorporates PRD §"Epic 2: Phase 1 Momentum Extraction".

**Verifiable & Measurable Success Criteria:**

- **Structural Unification (A1.5):** `git grep` asserts zero hits for DOM pointer/event listeners in `MapRenderer` or `MapEngine`. All modules moved to canonical §12.5 paths.
- **Render Gating (A1):** `renderer.render` is called exactly zero times during no-op ticks after the initial frame (verified via Vitest spy).
- **Phase 1 Integrity:** `bin/check-*` consistency suite passes after all modifications.

---

## Tasks

### Task 2.1 — CA-3 Structural Unification (A1.5)

**PRD Reference:** §"A1.5: CA-3 Structural Unification"

Consolidate input state and listeners into a unified `InputController`. Relocate existing modules to their canonical roadmap paths to ensure a clean starting state for Phase 2.

**Work:**

- **A1.5.0 (Pre-flight):** Verify `npm run typecheck` and `npm run bench:registry-alloc` pass on `main`.
- **A1.5.1 (Path Migration):** 
  - Move `src/SectorRegistry.ts` to `src/registry/SectorRegistry.ts` (if path changes required by §12.5).
  - Move `src/SectorBitmapParser.ts` to `src/parser/SectorBitmapParser.ts`.
  - Update all imports across `src/` and `test/`.
  - Re-run `typecheck` and benchmarks; must pass with no regression > 5%.
- **A1.5.2 (InputController):**
  - Create `src/input/InputController.ts`.
  - Implement `InputController` accepting an `onDirty: () => void` callback.
  - Expose `onPan(delta: Vector2)` and `onZoom(zoom: number, point: Vector2)`.
  - Migrated logic from `MapEngine`/`MapRenderer` into the controller.
- **A1.5.3 (Integration):**
  - Update `MapEngine`/`MapRenderer` to instantiate and use `InputController`.
  - Ensure `MapRenderer` passes `() => { this._dirty = true; }` as the `onDirty` callback.

**Done when:** `git grep -E '\\b(addEventListener|removeEventListener|PointerEvent|MouseEvent|KeyboardEvent|WheelEvent|TouchEvent|DragEvent|: Event\\b)'` returns zero hits outside `src/input/InputController.ts`.

---

### Task 2.2 — Render Gating (A1)

**PRD Reference:** §"A1: Render Gating"

Implement a dirty-flag system to prevent `MapRenderer` from performing expensive and redundant `renderer.render()` calls when the scene hasn't changed.

**Work:**

- **Internal State:** Add `private _dirty: boolean = true` to `MapRenderer`.
- **Mutation Hooks:**
  - Set `_dirty = true` inside `_flushPendingDirty`.
  - Set `_dirty = true` when immediate colors are updated.
  - Set `_dirty = true` on canvas resize.
- **Render Loop Modification:**
  - In the rAF callback, call `_preRenderHook()`.
  - Immediately following `_preRenderHook()`, check `if (this._dirty)`.
  - If dirty: call `renderer.render()`, then set `this._dirty = false`.
  - If not dirty: skip `renderer.render()`.
- **Verification:**
  - Create `test/RenderGating.test.ts`.
  - Mock the Three.js renderer.
  - Assert `render` is called exactly once initially.
  - Assert `render` is called zero times over 10 no-op ticks.
  - Assert `render` is called when a "dirty" event (pan/zoom) is simulated.

**Done when:** Vitest suite for render gating passes with 100% coverage on the gating logic.

---

### Task 2.3 — Phase 1 Exit Audit

**PRD Reference:** §"Phase 1 Exit Gate"

Perform a formal compliance check against Phase 1 engineering mandates and roadmap fidelity.

**Work:**

- Complete the `docs/audits/phase-1-audit.md` report.
- Verify PR-1 through PR-5 compliance.
- Run all mechanical consistency scripts (`bin/check-*`).
- Set audit status to `[PASS]` upon completion.

**Done when:** `docs/audits/phase-1-audit.md` is updated with `Status: [PASS]` and merged.
