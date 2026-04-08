# Project Progress

> **This file is the single source of truth for implementation state.**
> Every AI session working on this project must read this file first and update it before closing the session. It is the handoff document between sessions.

---

## How to Use This File

**At the start of a session:**

1. Read this file in full.
2. Check the Task Registry below to find the next incomplete task.
3. Cross-reference the task's epic file (`docs/epics/`) for full work spec.
4. Cross-reference `docs/PRD.md` for acceptance criteria and algorithm details.

**During a session:**

- Update the task's status to `[~]` (in progress) when you begin it.
- Append a Session Log entry with what you're doing and any notable decisions.

**At the end of a session:**

- Mark completed tasks `[x]`.
- If a task is blocked, mark it `[!]` and note the blocker.
- Append a Session Log entry summarizing what was completed.
- Capture anything non-obvious in Lessons Learned.

**Status legend:**
| Symbol | Meaning |
|--------|---------|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Complete |
| `[!]` | Blocked — see log for details |

---

## Current Status

**Phase:** Not started — no implementation tasks have begun.
**Next task:** Task 1.1 — Toolchain and Build Configuration.
**Blocking issues:** None.

---

## Task Registry

### Epic 1: Core Infrastructure and Spatial Data Parsing

> Full spec: `docs/epics/epic-1-core-infrastructure.md`

| Status | Task    | Description                                                                     |
| ------ | ------- | ------------------------------------------------------------------------------- |
| `[ ]`  | **1.1** | Toolchain and Build Configuration                                               |
| `[ ]`  | **1.2** | Shared Types, Utilities, Module Stubs, and Test Fixtures                        |
| `[ ]`  | **1.3** | `SectorBitmapParser`: Core Decode Pipeline                                      |
| `[ ]`  | **1.4** | `SectorBitmapParser`: Error Handling and Tests                                  |
| `[ ]`  | **1.5** | `SectorRegistry`: Single Scan Pass and Spatial Structures                       |
| `[ ]`  | **1.6** | `SectorRegistry`: Border Edges, Load-Time Validation, Public Methods, and Tests |

### Epic 2: WebGL Rendering and Camera Architecture

> Full spec: `docs/epics/epic-2-webgl-rendering.md`

| Status | Task    | Description                                                                 |
| ------ | ------- | --------------------------------------------------------------------------- |
| `[ ]`  | **2.1** | Three.js Scene, Renderer, Camera, Geometry, and Render Loop                 |
| `[ ]`  | **2.2** | Display Canvas, `displayImageData`, `CanvasTexture`, and Color Parser Setup |
| `[ ]`  | **2.3** | `setSectorColor`: CSS Color Parsing and Pixel Write                         |
| `[ ]`  | **2.4** | `resetSectorColor`, Edge Cases, and Color Mutation Tests                    |
| `[ ]`  | **2.5** | Pointer-Drag Pan and `clampPan()`                                           |
| `[ ]`  | **2.6** | Scroll-Wheel Zoom, `destroy()` Teardown, and Full Camera/Navigation Tests   |

### Epic 3: Interaction, Public API Facade, and Distribution

> Full spec: `docs/epics/epic-3-interaction-api-distribution.md`

| Status | Task    | Description                                                                           |
| ------ | ------- | ------------------------------------------------------------------------------------- |
| `[ ]`  | **3.1** | `MapEngine` Constructor and Event Subscription System (`on` / `off`)                  |
| `[ ]`  | **3.2** | `loadMap()`, Lifecycle Guards, `destroy()`, and Pass-Through Methods                  |
| `[ ]`  | **3.3** | Picking Pipeline: NDC Conversion, Raycasting, and UV-to-Pixel Mapping                 |
| `[ ]`  | **3.4** | Sector Resolution, `PickResult` Construction, and Event Emission                      |
| `[ ]`  | **3.5** | Core API Documentation: Quickstart, API Reference, and Asset Contracts                |
| `[ ]`  | **3.6** | Known Limitations, Web Worker Opt-In, Out-of-Scope List, and Bundle Size Verification |

---

## Session Log

> Entries are prepended (newest first). Each entry records the date, what was attempted, what was completed, and any decisions made that aren't captured elsewhere.

<!-- SESSION ENTRY TEMPLATE — copy and fill in:

### YYYY-MM-DD — [brief title]

**Tasks touched:** X.Y, X.Z
**Outcome:** completed / partial / blocked

**What happened:**
[What was done, in plain language. Include any approaches tried that didn't work.]

**Decisions made:**
[Any implementation choices not fully specified by the PRD, or PRD ambiguities resolved.]

**Left off at:**
[Exact task and step where the session ended, so the next session can resume without re-reading everything.]

-->

_(No sessions logged yet.)_

---

## Lessons Learned

> Non-obvious things discovered during implementation that future sessions should know. Append entries; do not delete old ones.

_(None yet — populated as implementation proceeds.)_
