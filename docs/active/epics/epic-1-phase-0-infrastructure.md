# Epic 1: Phase 0 Infrastructure & Consistency

**Objective:** Establish the foundational infrastructure, benchmarks, and consistency-checking suite required to verify Roadmap Phase 0.
**Scope:** Incorporates PRD §"Epic 1: Phase 0 Infrastructure & Consistency".

**Verifiable & Measurable Success Criteria:**

- **Benchmark Infrastructure:** `npm run bench:registry-alloc` successfully captures memory baselines into `bench/baselines.json` with median-of-10 filtering.
- **Consistency Suite:** All four `bin/check-*` scripts are executable and return exit code 0 on a clean workspace.
- **Fixture Integrity:** `test/fixtures/anchor-shapes.json` contains the mandated 20+ shapes with verified `expectedAnchor` coordinates.

---

## Tasks

### Task 1.1 — Benchmark Infrastructure (A0.1)

**PRD Reference:** §A0.1: Benchmark Infrastructure

Implement the Playwright-driven memory benchmarking tool. This is critical for the Phase 2 entrance gate.

**Work:**
- Create `bench/SPEC.md` defining the benchmarking protocol.
- Implement `bench/registry-alloc.spec.ts` (Playwright) to measure `performance.measureUserAgentSpecificMemory()`.
- Implement `bin/capture-baseline.sh` to run the benchmark 10 times and compute the median.
- Initialize `bench/baselines.json` with the initial `b1.constructor_alloc_bytes` capture.

**Done when:** `npm run bench:registry-alloc test/fixtures/maps/large.png` produces a valid median entry in `bench/baselines.json`.

---

### Task 1.2 — Audit & Consistency Suite (A0.2, A0.4-A0.7)

**PRD Reference:** §A0.2, §A0.4-A0.7

Codify the "Project Manager & Master Auditor" protocols into executable scripts.

**Work:**
- Ensure `docs/prompts/audit-only.md` matches the template in `GEMINI.md`.
- Implement `bin/check-finding-codes.sh` (regex-based orphan detection).
- Implement `bin/check-roadmap-cross-refs.sh` (markdown link validation).
- Implement bin/check-matrix-vs-roadmap.sh (fidelity check between ROADMAP.md and ROADMAP_TRACEABILITY_MATRIX.md for Pass 8+ entries).
- Implement bin/check-roadmap-consistency.sh (§4 pool size and naming validation).

**Done when:** All five items (audit prompt and 4 scripts) are present and the scripts exit 0.

---

### Task 1.3 — Spatial Fixtures (A0.3)

**PRD Reference:** §A0.3: Anchor Fixtures

Produce the hand-verified fixtures required for Phase 3/4 validation.

**Work:**
- Author `test/fixtures/anchor-shapes.json`.
- Must include ≥2 of each shape class: convex, concave, annulus, spiral, off-centroid, narrow corridor, multi-pole.
- Author `test/fixtures/game-clock/drift-100tick.json` for temporal stability verification.
- Coordinate verification: Ensure `expectedAnchor` is strictly inside the polygon and matches the Pole of Inaccessibility for that shape.

**Done when:** `test/fixtures/anchor-shapes.json` contains ≥20 valid fixture objects and `drift-100tick.json` is present.

