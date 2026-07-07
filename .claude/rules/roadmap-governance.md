---
paths:
  - 'docs/ROADMAP.md'
  - 'docs/ROADMAP_TRACEABILITY_MATRIX.md'
  - 'docs/audits/**/*.md'
  - 'docs/processes/**/*.md'
  - 'docs/active/**/*.md'
---

## Hierarchy of Truth

Code is the source of truth. When documentation and implementation conflict, trust the codebase over the docs. Treat documentation drift as a defect: cross-reference docs against the actual source to find inaccuracies, then fix the docs to match reality — never the reverse.

This applies to incidental discoveries, not just direct reconciliation tasks. When researching precedent for a new document and the evidence (a commit message, code, existing file content) contradicts an existing artifact's claim, fix that artifact in the same pass rather than only using the evidence to validate the new decision. A discrepancy noticed but not corrected costs the same as one never found — it just defers the same fix to a later session, after the wrong artifact has had more chances to get copied forward.

## Roadmap Stewardship

`docs/ROADMAP.md` is the project's north star. Keeping it accurate takes priority over other documentation work.

Review and revision happen as two separate, user-gated passes. Run a review pass only when the user asks for one, and produce a findings report rather than editing the file in the same turn. Revise the roadmap only after the user has seen the review findings and explicitly asks for a revision pass.

## Phase Exit Self-Audit Protocol

A phase closes through this four-step cycle:

1. **Write the audit artifact.** When every milestone in a phase is complete, write a summary of the work to `docs/audits/phase-<N>-audit.md`.
2. **Run the audit process.** Execute `docs/processes/audit-only.md` as a read-only review pass over that same phase, as a distinct step after the summary is written — not folded into it.
3. **Record the verdict.** Update the same `phase-<N>-audit.md` file with a status of `PENDING`, `FAIL`, or `PASS`.
4. **Close on merge only.** Treat the phase as closed once a `PASS` verdict is merged to `main`, not before. On `FAIL`, write a Proposed Revision Plan in the audit file, reopen the failing milestone, and iterate until the audit passes.

## Process Registry

Executable process definitions this file points to live in `docs/processes/` (agent-neutral prompts) or `.claude/skills/` (harness skills):

| Process               | File                                       | Used for                                                                                                          |
| --------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Roadmap Audit         | `docs/processes/audit-only.md`             | The read-only compliance pass in step 2 above                                                                     |
| Sprint Hardening      | `.claude/skills/sprint-hardening/SKILL.md` | Review-and-revision pass over `docs/active/**` before sprint activation (invoke: sprint-hardening)                |
| Version Archive Split | `docs/processes/version-archive-split.md`  | Splitting an active sprint's PRD/PROGRESS into an archived, newly-versioned phase plus a continuing active sprint |

## Technical Rationale for Findings

Back a hardening or audit finding with a concrete number, not an assertion — memory math (buffer size in bytes or MB), complexity (O(N) behavior), or a specific measured constraint. A finding with no supporting number is opinion, not a defect report.

## Operational Directives

Write output in English only.

Do not reference commit SHAs or "shipped-at" commit IDs in `docs/ROADMAP.md`. Use descriptive status indicators instead — a commit reference goes stale the moment history is rewritten or squashed.

Write every document to the exact repository path given, not a nearby or renamed alternative.
