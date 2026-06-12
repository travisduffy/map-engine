# Epic 2: Rendering Decoupling

**Objective:** Abstract the rendering backend into an interface to remove direct Three.js dependencies from the core `MapRenderer` logic.
**Scope:** Incorporates PRD §"Epic 2: IThreeRenderBackend Contract (B1.5)" and ROADMAP §7.

**Verifiable & Measurable Success Criteria:**

- **Zero Direct Imports:** `src/MapRenderer.ts` contains zero non-type imports from `'three'`.
- **Logic Isolation:** All rendering-agnostic logic (dirty gating, camera math) is verifiable in Vitest using a `NullRenderBackend`.
- **Implementation Fidelity:** `ThreeRenderBackend` correctly wraps Three.js calls and maintains visual parity.

---

## Tasks

### Task 2.1 — Define IThreeRenderBackend Interface

**PRD Reference:** §Architecture — IThreeRenderBackend
**Principles Compliance:** PR-4 (Conservative Surface), PR-5 (Reversibility).

Create the normative interface for all rendering operations.

**Work:**
- Create `src/render/IThreeRenderBackend.ts`.
- Define `IThreeRenderBackend` with `uploadTexture`, `uploadBorderEdges`, `updateUniforms`, `render`, and `dispose`.
- Define `ThreeRenderBackendInternalAccess` (F-2.6) with `getThreeScene`, `getThreeRenderer`, and `readSectorIdAt`.
- (Note: `THREE` types are permitted in the interface definition).

**Done when:** `src/render/IThreeRenderBackend.ts` exists and is correctly typed.

---

### Task 2.2 — Implement NullRenderBackend & Logic Tests

**PRD Reference:** §Acceptance Criteria — Epic 2
**Principles Compliance:** PR-4 (Conservative Surface).

Create a no-op backend for use in unit tests and logic verification.

**Work:**
- Create `src/render/NullRenderBackend.ts`.
- Implement all `IThreeRenderBackend` methods as no-ops.
- **Mandate (F-2.8):** `uploadTexture` MUST retain a reference to the source typed-array via `.slice()` to support Main-thread `pick()` lookups during unit tests.
- **Mandate (F-2.8):** `updateUniforms`, `render`, `uploadBorderEdges`, and `dispose` must be explicitly implemented as no-ops.
- **Disposal Mandate:** Ensure `dispose()` explicitly clears the sliced texture reference to prevent memory accumulation during long-running test sessions (Vitest watch mode).

**Done when:** `NullRenderBackend` is implemented and can be instantiated without errors; `dispose()` clears internal references.

---

### Task 2.3 — Decouple MapRenderer from Three.js

**PRD Reference:** §Acceptance Criteria — Epic 2
**Principles Compliance:** PR-4 (Conservative Surface), PR-5 (Reversibility).

Refactor `MapRenderer` to use the backend interface.

**Work:**
- Update `MapRenderer` constructor to accept an `IThreeRenderBackend`.
- Replace direct `THREE.WebGLRenderer` calls with calls to the backend.
- Move existing Three.js-specific rendering logic from `MapRenderer.ts` to a new `src/render/ThreeRenderBackend.ts`.
- Remove all `import { ... } from 'three'` statements from `MapRenderer.ts` (except `import type`).

**Done when:** `npm run typecheck` passes; `git grep -E '^import .* from .three.' src/MapRenderer.ts | grep -v 'import type'` returns zero hits.
