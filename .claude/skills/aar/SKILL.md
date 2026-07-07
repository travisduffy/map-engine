---
description: Runs a single-invocation after-action review that turns a completed task or session into durable, compounding improvements to the agent's own instruction files (CLAUDE.md, rules, skills). Use when the user asks for an AAR, a retrospective, to capture lessons learned, or to update instruction files based on what just happened.
---

# After-Action Review (AAR) Skill

A single-invocation cycle that turns whatever just ran into durable, compounding improvements to the agent's own instruction files. Each pass leaves the system equal or better — growth is additive; removal is rare, gated, and reversible.

## Canon (highest authority — never override)

1. **Invert entropy.** Every completed task accelerates the next. Instruction files get smarter, not heavier. Prefer additive learning over lossy rewriting.
2. **Teach, don't type.** Capture reusable context, rules, and constraints rather than redoing manual work.
3. **One-strike bug rule.** Never let the same error happen twice. A squashed bug becomes a permanent preventative rule.
4. **Systematize taste.** Convert subjective preferences into objective, checkable constraints.
5. **Treat context as code.** Guard instruction files with production-grade rigor: propose diffs, preserve history, review before applying, keep everything reversible.

## Terminology (vendor-agnostic)

| Term                | Meaning                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `AGENT_FILE`        | The master always-loaded instruction file (e.g. CLAUDE.md, AGENTS.md, GEMINI.md, .cursorrules, a system prompt).         |
| `SKILL_FILE`        | A modular, on-demand capability file in the open SKILL.md format.                                                        |
| `INSTRUCTION_FILES` | Every file in scope: the AGENT_FILE plus all SKILL_FILEs.                                                                |
| `ARCHIVE`           | A quarantine/deprecation area (a clearly marked section or a separate file) where retired-but-recoverable content lives. |

Resolve these to the host tool's real paths at runtime. If unsure which files exist, list them before proceeding.

## Operating principles (read before acting)

These resolve the one failure this skill exists to prevent: aggressive optimization deleting load-bearing content because it was unused in one session.

- **Reason over the task distribution, not this one session.** A single session is one sample, not the population. "Unused this time" is never evidence that something is dead. Optional, conditional, and fallback content is _designed_ to be skipped on most runs.
- **Separate three objectives; protect the first.**
  - _Coverage_ — the range of situations handled. Near-inviolable; see invariants.
  - _Context economy_ — token weight of loaded instructions. Optimize only within edits that keep coverage intact; prefer progressive disclosure (move detail to referenced files) over deletion.
  - _Runtime efficiency_ — tool calls / steps per task. Improve via routing and structure, not by cutting capability.
- **Asymmetric burden of proof.** Adding is cheap (needs a real triggering signal + a rationale). Editing preserves original intent. Removing requires passing the Fence Gate below — otherwise quarantine.
- **Conservative, bounded updates.** Change at most 1–3 things per pass. Small reversible diffs compound safely; large rewrites regress.
- **Preserve the why.** Every rule added or edited carries a one-line rationale. Never strip an existing rationale — future passes need it to reason about removal.
- **Anchor to evidence.** Every proposed change traces to something observed: an error, a user correction, a failed check, a stated preference, or a measured inefficiency. No signal → not a candidate. Self-judgment alone ("looks tighter") is not a signal.

## The Fence Gate (required before any removal)

Named for Chesterton's Fence: do not remove what you cannot explain. Quarantine instead of deleting unless all four hold:

1. **Intent reconstructed.** State why the item was originally added. If you cannot, quarantine instead of removing it.
2. **Proof of deadness across the distribution.** Explain why no task in the class this file serves still needs it. "Unused this session" fails this test.
3. **No dependents.** Confirm nothing in SUSTAINS or elsewhere relies on it.
4. **Quarantine, not delete.** Move the full text + rationale + date + reason to `ARCHIVE` with status `quarantined`. It becomes eligible for hard deletion only after a probation window with no recurrence, and only on a separate explicit instruction.

## Workflow

### Phase 1 — After-Action Review (analysis only; edit nothing yet)

**0. Establish scope.** Identify what actually happened this session — the ad-hoc actions taken and any skill(s) invoked. This is the ground truth the review is anchored to; do not review from memory or assumption.

Then answer the four AAR questions:

1. **Expected** — what was the work meant to achieve, and against what standard?
2. **Actual** — what actually happened? Cite concrete evidence (errors, tool failures, retries, user corrections, passing/failing checks).
3. **Delta** — why the difference, positive or negative?
4. **Next** — what to SUSTAIN and what to IMPROVE.

Label every observation `[SESSION-SPECIFIC]` or `[GENERALIZES]`. Only `[GENERALIZES]` items may motivate durable edits.

Output the ledger in two halves:

**SUSTAINS (protected).** Behaviors, rules, and steps that contributed to success or prevented error. Note evidence and whether each generalizes. Later phases do not weaken or remove a SUSTAINS item without overturning the evidence recorded here.

**IMPROVES (candidates only).** For each candidate:

| Field       | Meaning                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------- |
| `signal`    | The evidence that triggered it — no signal, discard the candidate.                       |
| `type`      | ADD, EDIT, or QUARANTINE (never DELETE at this stage).                                   |
| `objective` | COVERAGE, CONTEXT-ECONOMY, or RUNTIME-EFFICIENCY — name one primary; flag any trade-off. |
| `target`    | Likely file or section.                                                                  |
| `rationale` | The why, to be preserved with the change.                                                |

If the session was clean, output a full SUSTAINS and an empty IMPROVES. A clean session is a valid outcome — do not manufacture changes.

### Phase 2 — Improvement plan (present, then stop for approval)

Convert the IMPROVES ledger into a concrete plan, then stop — do not edit any file until the user approves.

Route each change:

- Cross-cutting behavior, global rule, or safety invariant → `AGENT_FILE`
- Behavior specific to one capability → the relevant `SKILL_FILE` (usually the skill actually exercised this session)
- Both, when a global rule and a capability detail are both implicated
- A lesson from ad-hoc work with no existing home → capture it as a new standard: a new `AGENT_FILE` rule, or a new skill stub if it is a repeatable capability ("teach, don't type")
- A removal that passed the Fence Gate → `ARCHIVE`

Apply **standardize-then-improve**: if the relevant behavior is not yet written down anywhere, the first improvement is to capture it (an ADD), not to optimize. This skill may improve itself under the same gates.

Present the plan as a table the user can approve, amend, or reject:

| #   | File / section | Type | Objective | Change (one line) | Signal | Reversible? |
| --- | -------------- | ---- | --------- | ----------------- | ------ | ----------- |

Then ask explicitly: `Approve all, approve a subset (list numbers), or revise?` Wait for the answer. Treat silence or ambiguity as not-approved.

### Phase 3 — Apply (only the approved subset)

Edit `INSTRUCTION_FILES` as version-controlled code — propose diffs, not rewrites. For each approved change:

- Make the smallest edit that achieves it (bounded and reversible).
- Keep coverage intact. If a change would narrow the range of situations handled, stop and re-confirm before proceeding.
- Attach a one-line rationale to every added/edited rule. Never strip existing rationale.
- For removals: run the Fence Gate; on success, quarantine to `ARCHIVE` rather than hard-deleting.
- Phrase rules with the **explain-the-why** pattern — state the rule, then the reason — so the agent generalizes to cases the rule did not spell out. Reserve bare imperatives for genuinely fragile single steps.
- Write behavioral instructions as positive targets. For the few safety-critical prohibitions, phrase them as "do X instead of Y" — pair the prohibition with its positive alternative.

**One-strike bug rule (permanent, append-only).** If the session hit a bug with a generalizable fix, append a preventative rule to the relevant file using the format `date · error observed · preventative rule (positive framing) · one-line rationale`. Adapt the format to the target file's existing constraints — e.g., condense the rule to fit a file that mandates lossless compression or terse imperatives, rather than forcing the verbose log format. This section is exempt from context-economy pressure and is never edited away, quarantined, or deleted — pure additive compounding.

**Systematize taste.** When a change comes from a subjective preference, encode it as an objective, checkable constraint (a format spec, a numeric threshold, a lint-style rule), and record the preference's source so it counts as a valid signal.

After editing, output in your final response a closing three-line **compounding check**:

- Repeat-error guard added this pass? (y/n + which)
- Coverage preserved? (y/n; if n, justify via Fence Gate)
- Net change: +N added / M clarified / K quarantined / 0 hard-deleted

If `0 hard-deleted` is ever false without an explicit prior deletion instruction, the pass is invalid — revert it and report.

## Hard invariants

These are the deliberate safety-critical exceptions to explain-the-why above: bare imperatives by design, because each guards against a known, costly regression.

- Never delete content on the basis that it was unused this session.
- Never narrow coverage to save tokens; use progressive disclosure instead.
- Never apply Phase 3 edits without explicit Phase 2 approval.
- Never edit, quarantine, or delete a One-Strike rule.
- Never strip a rationale.
- When uncertain whether a change is safe, propose it in the plan and let the user decide rather than acting. Default to doing less.
