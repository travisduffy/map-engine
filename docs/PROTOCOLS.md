# Project Protocols

> **Document Type:** Shared Agent Communication & Workflow Protocols
> **Status:** Normative Authority for Gemini (Auditor) and Claude (Engineer)

This document defines the strict communication and operational protocols required to maintain strategic integrity between the Project Manager/Auditor (Gemini) and the Engineer (Claude).

---

## 1. Agent-to-Agent Handoff Protocol (The Handshake)

This protocol governs the deterministic transfer of execution authority and strategic context between agents.

### 1.1 The Communication Channel: `docs/HANDOFF.md`

- **Primary Inbox:** All cross-agent directives, strategic briefings, and state-transfer messages MUST pass through this file.
- **Passive Inbox Rule:** Agents are strictly prohibited from reading `docs/HANDOFF.md` autonomously on boot. They may only read it when the BDFL (User) explicitly commands them to (e.g., "Gemini, check your inbox").
- **Rolling History (The "Rule of Three"):** The file MUST maintain a rolling history of exactly the **three most recent handoff messages**.
- **Timestamps:** Every message MUST be prefixed with a ISO-8601-like timestamp in the header (e.g., `# [2026-05-07 14:30] Message Title`).
- **Pruning:** When writing a new handoff, the sender MUST shift the existing messages down, discarding the oldest (fourth) message to ensure only the three most recent remain.

### 1.2 The Token System (Locking Mechanism)

The first line of `docs/HANDOFF.md` MUST contain a recipient token, which acts as a semaphore for execution authority:

- `Token: CLAUDE` — Authority transferred to the Engineer.
- `Token: GEMINI` — Authority transferred to the Project Manager/Auditor.

### 1.3 Writing a Handoff

When an agent completes its tasks and passes control:

1. **Prune & Shift:** Retrieve the current contents of `docs/HANDOFF.md`. Shift the existing two most recent messages down and discard the oldest.
2. **Timestamping:** Create a new header with the current date and time.
3. **State Synthesis:** Summarize the work completed, any strategic shifts, and the exact "North Star" state.
4. **Directives:** Provide clear, high-fidelity instructions for the next agent.
5. **Token Placement:** Set the correct `Token: <RECIPIENT>` as the first line of the file.
6. **Session Termination:** The sender MUST immediately terminate its session after writing the handoff. Authority is considered "Sent."

### 1.4 Receiving a Handoff

Upon BDFL instruction:

1. **Verification:** Read `docs/HANDOFF.md` and verify the `Token` matches your identity.
2. **Context Absorption:** Absorb the briefing as the primary strategic directive for the upcoming session.
3. **Registry Update:** Update `docs/active/PROGRESS.md` to reflect the transition and current task status.

---

## 2. Phase Exit Audit Protocol (The Gatekeeper)

This protocol ensures that strategic goals are met and principles (PR-1 to PR-5) are upheld at phase boundaries.

### 2.1 The Audit Cycle

1. **Phase Completion (Engineer):** When all milestones in a Phase are marked `[x]`, the Engineer commits a summary to the relevant `docs/audits/phase-<N>-audit.md` file and emits a `PHASE_EXIT_AWAITING_AUDIT` signal.
2. **Audit Execution (Auditor):** Upon BDFL instruction, the Auditor performs a formal compliance check using the `docs/processes/audit-only.md` template.
3. **Audit Artifact:** The Auditor updates the same `phase-<N>-audit.md` file with an updated status field: `[PENDING]`, `[FAIL]`, or `[PASS]`.
4. **Phase Closure:** A phase is considered closed ONLY when the final `[PASS]` audit report is merged to `main`. No work on the next Phase may begin until this merge occurs.

### 2.2 Strategic Drift Correction

If an audit results in `[FAIL]`, the Auditor must provide a "Proposed Revision Plan" in the audit report. The Engineer then re-opens the failing milestone and iterates until compliance is achieved.

---

## 3. Consistency Maintenance

To prevent documentation decay and "hallucinations," both agents MUST use the following mechanical consistency tools in `bin/` before any handoff or phase exit:

- `./bin/check-finding-codes.sh`
- `./bin/check-roadmap-cross-refs.sh`
- `./bin/check-matrix-vs-roadmap.sh`
- `./bin/check-roadmap-consistency.sh`
