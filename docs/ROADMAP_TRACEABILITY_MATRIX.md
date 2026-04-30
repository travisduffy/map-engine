# ROADMAP_TRACEABILITY_MATRIX.md: Audit Revision Traceability Matrix

This document maps the findings from past audits to the specific sections and milestones in the revised `docs/ROADMAP.md` that resolve them.

| #   | Synthesis Finding                            | Revised Section / Milestone     | Note                                                          |
| --- | -------------------------------------------- | ------------------------------- | ------------------------------------------------------------- | ------ | --- |
| 1   | A3 duplicated across Phase 1 & 2             | Phase 2 (A3)                    | Removed from Phase 1 narrative and graph.                     |
| 2   | A4 conditional flag with no decider          | Phase 1 (A4)                    | A4 is now mandatory; conditional language removed.            |
| 3   | CA-8 has no polygon-ring producer            | Phase 2 (B1.e / CA-8a)          | Added contour extraction to the O(W×H) pass.                  |
| 4   | B6 signaling: mandatory but out-of-scope     | Phase 5 (B6.0)                  | Added in-process loopback signaling shim.                     |
| 5   | Phase 4 ordering (CA-6 requires CA-5)        | Phase 4 Header / Graph          | Explicit DAG defined in narrative and ASCII graph.            |
| 6   | B5.5 mis-categorized; gates Phase 5          | Phase 3 (B5.5)                  | Relocated to tail of Phase 3; tagged `[Critical Path -> B6]`. |
| 7   | No phase exit gates defined                  | Phase Headers (all)             | "Phase Exit Gate" block added to every phase.                 |
| 8   | A1.5 InputController has no API spec         | Phase 1 (A1.5)                  | API surface and dirty-flag interaction defined.               |
| 9   | B1.5 IRenderBackend has no signatures        | Phase 2 (B1.5)                  | Normative TS interface inlined.                               |
| 10  | B1 acceptance unmeasurable                   | Phase 2 (B1.a-e ACs)            | Baselined fixture + heap delta assertions added.              |
| 11  | A2 BigInt accumulator float-math leak        | Phase 1 (A2)                    | Contract changed to `stepMicros: bigint`.                     |
| 12  | CA-6 acceptance human-dependent              | Phase 4 (CA-6 ACs)              | Switched to fixture-based edge/endpoint comparison.           |
| 13  | B1 over-bundled (5+ work items)              | Phase 2 (B1.a-e)                | Split into 5 distinct sequential sub-deliverables.            |
| 14  | `borderEdges` layout/ownership               | Phase 2 (B1.c) / Phase 4 (CA-6) | Layout locked to `[x1,y1,x2,y2]`; B1 allocates, CA-6 owns.    |
| 15  | CA-6 signaling impossible as written         | Phase 4 (CA-6)                  | Replaced `Atomics.notify` on main with SAB counter polling.   |
| 16  | B4/B5/B3 protocols undefined                 | Phase 3 (B4, B5, B3)            | Wire formats and bootstrap protocols defined.                 |
| 17  | CA-7 named but never specified               | Phase 3 (B2 / CA-7)             | API sketch (`registerMapMode`) added to B2.                   |
| 18  | `packRgb` referenced but undefined           | Phase 2 (B1.d)                  | Definition locked to `(r<<16)                                 | (g<<8) | b`. |
| 19  | Production COOP/COEP / deployment            | Section 11.2                    | Production headers and runtime guard defined.                 |
| 20  | Pillar III (WASM) vs plan (SAB) substitution | Phase 6 (B7)                    | Added explicit WASM migration milestone.                      |
| 21  | CA-5 `parentMapping` origin                  | Phase 4 (CA-5)                  | Specified as consumer-supplied at construction.               |
| 22  | A4 ↔ B1.5 tension (escape hatch)             | Phase 2 (B1.5)                  | Added `ThreeRenderBackendInternalAccess` escape hatch.        |
| 23  | Three.js `0.160.0` pin lifecycle             | Phase 1 (A4)                    | Pin/unpin lifecycle explicitly documented.                    |
| 24  | `borderEdges` sizing formula re-derivation   | Phase 2 (B1.c)                  | Sizing re-derived against inter-group boundaries.             |
| 25  | B5 sequence-lock upgrade trigger             | Phase 3 (B5)                    | Upgrade to RWLock triggered by second concurrent reader.      |
| 26  | Mobile WebGL2 / SAB memory budget            | Section 11.4                    | 256MB runtime memory budget guard added.                      |
| 27  | Semver / pre-1.0 release policy              | Section 11.5                    | `0.x.y` policy defined (x=Phase, y=Milestone).                |
| 28  | Pillar stubs (WASM, Svelte, QuickJS)         | Phase 6 (B7, CA-10, CA-11)      | Stubs added with `[scope-pending]` and review gate.           |
