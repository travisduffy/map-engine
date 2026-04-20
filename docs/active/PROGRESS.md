# Project Progress

> **This file is the single source of truth for implementation state.**
> Every AI session working on this project must read this file first and update it before closing the session. It is the handoff document between sessions.

---

## How to Use This File

**At the start of a session:**

1. Read this file in full.
2. Check **Current Status** — if it reads `NO ACTIVE SPRINT`, do not begin implementation work. Wait for the user to define the next version.
3. If a sprint is active, find the next incomplete task in the Task Registry.
4. Cross-reference the task's epic file (`docs/active/epics/`) for the full work spec.
5. Cross-reference `docs/active/PRD.md` for acceptance criteria and algorithm details.

**During a session:**

- Update the task's status to `[~]` (in progress) when you begin it.
- Append a Session Log entry with what you're doing and any notable decisions.

**At the end of a session:**

- Mark completed tasks `[x]`.
- If a task is blocked, mark it `[!]` and note the blocker.
- Append a Session Log entry summarizing what was completed, decisions made, and where you left off.
- Capture anything non-obvious in Lessons Learned.

**Status legend:**

| Symbol | Meaning                       |
| ------ | ----------------------------- |
| `[ ]`  | Not started                   |
| `[~]`  | In progress                   |
| `[x]`  | Complete                      |
| `[!]`  | Blocked — see log for details |

---

## Current Status

**Phase:** Active — v0.0.2 development in progress
**Active version:** v0.0.2
**Next task:** Task 1.1 — Shared Color Utility and Test Infrastructure
**Blocking issues:** None

---

## Task Registry

### Epic 1: The Frame Hook

> Full spec: `docs/active/epics/epic-1-frame-hook.md`

| Status | Task    | Description |
| ------ | ------- | ----------- |
| `[ ]`  | **1.1** | Shared Color Utility and Test Infrastructure |
| `[ ]`  | **1.2** | `MapRenderer` Batching Internals |
| `[ ]`  | **1.3** | `MapEngine` Hook Wiring, Dispatch, and Destroy |
| `[ ]`  | **1.4** | Epic 1 Tests and Example App |

### Epic 2: The Game Clock

> Full spec: `docs/active/epics/epic-2-game-clock.md`

| Status | Task    | Description |
| ------ | ------- | ----------- |
| `[ ]`  | **2.1** | `GameClock` Implementation |
| `[ ]`  | **2.2** | Epic 2 Tests and Example App |

### Epic 3: The Adjacency Graph

> Full spec: `docs/active/epics/epic-3-adjacency-graph.md`

| Status | Task    | Description |
| ------ | ------- | ----------- |
| `[ ]`  | **3.1** | `SectorRegistry.adjacency` and Deprecations |
| `[ ]`  | **3.2** | `MapEngine.getNeighbors` |
| `[ ]`  | **3.3** | Epic 3 Tests and Example App |

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
