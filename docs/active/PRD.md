# Product Requirements Document

> **Status: ACTIVE**
> **Version:** v0.0.3
> **Roadmap Phase:** Phase 0 (Prep) & Phase 1 (Momentum)
> 
> This PRD defines the requirements for establishing the project's foundational "Truth" and infrastructure, as well as the initial codebase hardening through Phase 1. v0.0.3 ensures that the engine is built upon a verified baseline and initiates the elimination of rendering waste and structural fragmentation.

---

## Overview

v0.0.3 encompasses both "Phase 0: Prep" and "Phase 1: Momentum Extraction" of the `map-engine` roadmap. It implements mandatory benchmarking infrastructure and audit protocols while simultaneously initiating codebase modifications to unify input handling and gate the rendering pipeline. This phase transition marks the start of active feature development on a hardened, measurable foundation.

---

## Goals & Non-Goals

### Goals
- **Empirical Baseline:** Establish a measurable memory and performance baseline for the engine using Playwright-driven benchmarks.
- **Mechanical Consistency:** Automate the verification of finding codes, cross-references, and traceability between the Roadmap and the Matrix.
- **Structural Unification (Phase 1):** Consolidate fragmented input logic into a unified `InputController` and migrate modules to canonical paths.
- **Performance ROI (Phase 1):** Implement render gating to eliminate GPU submit waste on static frames.
- **Audit Integrity:** Codify and initialize the audit procedure for both Phase 0 and Phase 1.

### Non-Goals
- **Architecture Refactoring:** The V8-idiomatic object graph remains in place until Phase 2.
- **Worker Relocation:** Web Workers are not introduced in this release (reserved for Phase 3).
- **GPU Palette Swaps:** Fragment LUTs and palette shaders are reserved for Phase 3.

---

## Architecture

v0.0.3 introduces the following infrastructure components:
- **`bin/` Consistency Suite:** A set of shell scripts for Roadmap/Matrix integrity.
- **`bench/` Infrastructure:** Playwright-based memory measurement and a `baselines.json` registry.
- **`test/fixtures/` Expansion:** High-fidelity spatial data for anchor validation.

---

## Acceptance Criteria

### Epic 2: Phase 1 Momentum Extraction

#### A1.5: CA-3 Structural Unification
- All shipped modules must be relocated to canonical paths per Roadmap §12.5.
- `InputController` must be implemented as the sole DOM event consumer.
- `git grep` must assert zero raw pointer/DOM listeners in `MapRenderer` or `MapEngine`.
- `MapRenderer` must consume the `onDirty` callback from `InputController`.

#### A1: Render Gating
- `MapRenderer` must implement a `_dirty` flag.
- The flag must be checked *after* `_preRenderHook` returns.
- `renderer.render` must be called exactly once during 10 consecutive no-op ticks (the initial frame).
- GPU submit rate must match mutation-driven cadence.

#### Phase 1 Exit Gate
- All A1.5 and A1 acceptance criteria must be verified.
- A formal audit must be completed and logged in `docs/audits/phase-1-audit.md`.

---

## What This Version Explicitly Does Not Include
- SectorRegistry flattening (Reserved for Phase 2).
- Web Worker relocation (Reserved for Phase 3).
- Palette shaders / CA-7 Palette API (Reserved for Phase 3).

---

## Known Risks
- **Benchmarking Variance:** `measureUserAgentSpecificMemory()` can be noisy.
  - *Mitigation:* Median-of-10 filtering and reference hardware pinning.
- **Matrix Drift:** Maintaining manual string-match fidelity is brittle.
  - *Mitigation:* Automated enforcement via `bin/check-matrix-vs-roadmap.sh`.
