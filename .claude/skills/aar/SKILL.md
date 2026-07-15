---
name: aar
description: Runs an After-Action Review (AAR) to analyze session history and safely update the agent's own instruction files. Compounds knowledge internally without creating new project codebase artifacts.
argument-hint: '[mode:headless]'
---

# After-Action Review (AAR) Skill

A structural logic-modifier that turns completed tasks or sessions into durable, compounding improvements to the agent's own instruction files. Each pass updates instructions based strictly on session evidence, ensuring the system grows smarter over time without bloating context.

## Canon & Operating Principles

1. **Invert entropy:** Instruction files get smarter, not heavier. Prefer additive learning and strict compression over lossy rewriting.
2. **Anchor to evidence:** Every proposed edit requires a concrete, traceable signal from the current session (an error, user correction, failed check, or measured inefficiency). No signal, no change. Self-judgment alone is never a valid signal.
3. **Progressive Context:** Treat context as a scarce resource. Offload heavy, domain-specific logic into separate modular skill files, leaving only conditional routing "shims" in the main instruction file.
4. **Treat context as code:** Guard instruction files with production-grade rigor: propose diffs, preserve history, enforce gates, and keep everything reversible.

## Terminology

| Term                | Meaning                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `AGENT_FILE`        | The master always-loaded instruction file (e.g., CLAUDE.md, .cursorrules). |
| `SKILL_FILE`        | A modular, on-demand capability file (e.g., SKILL.md format).              |
| `INSTRUCTION_FILES` | Every instruction file in scope (AGENT_FILE + all SKILL_FILEs).            |
| `ARCHIVE`           | A quarantine/deprecation area where retired-but-recoverable content lives. |

## Execution Modes

Enter headless mode when invoked with the `mode:headless` token. Otherwise, default to Interactive mode.

| Mode                           | Behavior                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Interactive** (Default)      | Halts at Phase 2. Presents a structured diff table of proposed changes. Strictly waits for the user to reply with "Approve", "Revise", or "Reject" before proceeding to Phase 3.                       |
| **Headless** (`mode:headless`) | Auto-approves `ADD` and `EDIT` actions that expand coverage or execute compressions. Hard-skips any `QUARANTINE` or `DELETE` actions. Outputs a structured terminal report and exits without blocking. |

---

## Workflow

### Phase 1: Analysis via Scratch Artifacts

To prevent context-collapse on long sessions, the orchestrator routes analysis into distinct filesystem artifacts before compiling the final ledgers. Do not edit any product or instruction files during this phase.

1. **Initialize Run Context:** Generate a `$RUN_ID` and create a scratch directory.

   ```bash
   RUN_ID=$(date +%Y%m%d-%H%M%S)-$(head -c4 /dev/urandom | od -An -tx1 | tr -d ' ')
   mkdir -p "/tmp/aar-$RUN_ID"
   ```

2. **Execute Analysis:** Analyze the session ground truth to answer the core AAR questions. Write the findings directly to `/tmp/aar-$RUN_ID/analysis.md`:

- **Expected vs. Actual:** What was the work meant to achieve vs. what actually happened?
- **Delta:** Cite concrete evidence (errors, corrections, retries) explaining the difference.
- **Rule Overlap:** Grep the current `INSTRUCTION_FILES` for existing rules touching the same domain.

3. **Compile Ledgers:** Read back the scratch analysis and compile two ledgers, written to `/tmp/aar-$RUN_ID/ledgers.json`:

- **SUSTAINS (Protected):** Behaviors/rules that contributed to success. Cannot be weakened later.
- **IMPROVES (Candidates):** Specific changes mapping a concrete `signal` to a `type` (ADD, EDIT, QUARANTINE), an `objective` (Coverage, Context-Economy, Runtime-Efficiency), a target file, and a one-line rationale.

### Phase 2: Plan & Route

Compile the `IMPROVES` ledger into an actionable plan.

1. **Route Diffs:**

- Global rules, cross-cutting behaviors, and routing shims → `AGENT_FILE`
- Domain-specific behaviors or heavy logic → relevant `SKILL_FILE`
- Lessons from ad-hoc work with no existing home → Create a new standard or `SKILL_FILE` stub.

2. **Execute the Mode Gate:**

- **If Headless:** Auto-filter the plan. Approve `ADD`/`EDIT` actions. Drop any `QUARANTINE` or `DELETE` actions. Proceed immediately to Phase 3.
- **If Interactive:** Present the proposed plan as a table:

| #   | File / Section | Type | Change (One-line) | Signal | Reversible? |
| --- | -------------- | ---- | ----------------- | ------ | ----------- |

_Then explicitly ask:_ `Approve all, approve a subset (list numbers), or revise/reject?`
**HALT execution and wait for the user's explicit reply.** Treat silence as rejected.

### Phase 3: Apply & The Validation Gates

Apply the approved diffs as version-controlled code. Before modifying any file, the changes must strictly pass two operational gates:

#### Gate 1: The Compression Gate (Fixes Context Bloat)

Before applying a new "One-strike bug rule" (never let an error happen twice), check for semantic overlap in the target file.

- **The Check:** Does this new rule cluster with 2 or more existing rules in the same domain?
- **The Compression:** If yes, you must NOT append a third isolated rule. Instead, compress the cluster into a single, broader heuristic.
- **The Preservation:** Move the specific triggers/edge-cases from the original rules into the new heuristic's one-line rationale. Context must decrease or stay neutral while coverage expands.

#### Gate 2: The Fence Gate (Fixes Destructive Optimization)

Never perform a hard deletion of an instruction.

- **The Check:** Is an instruction proven entirely dead across the entire task distribution (not just unused in this current session)?
- **The Execution:** If proven dead, move the instruction to the `ARCHIVE` section (or file) with its intent, the date, and the rationale for removal preserved. If you cannot reconstruct why the rule was originally added, you may not quarantine it.

### Final Output

Apply the diffs cleanly. Once written, output a closing terminal report matching the active mode:

**Interactive Report:**

```text
✓ AAR Complete

Files updated:
- [File Name] (Net change: +N added / M compressed / K quarantined)

Compounding Check:
- Repeat-error guard added? (y/n + target)
- Compression Gate triggered? (y/n + lines saved)
- Fence Gate respected? (0 hard-deleted)

```

**Headless Report:**

```text
✓ AAR Complete (headless mode)

Mode: Headless (Quarantine/Deletes skipped)
Updates applied: N additions, M edits.
Compression Gate triggered: [y/n]

AAR complete

```
