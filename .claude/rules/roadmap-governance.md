## Hierarchy of Truth

Code is the source of truth. When documentation and implementation conflict, trust the codebase over the docs. Treat documentation drift as a defect: cross-reference docs against the actual source to find inaccuracies, then fix the docs to match reality — never the reverse.

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

`docs/processes/` holds the executable process definitions this file points to:

| Process             | File                            | Used for                                                             |
| -------------------- | -------------------------------- | --------------------------------------------------------------------- |
| Roadmap Audit         | `docs/processes/audit-only.md`   | The read-only compliance pass in step 2 above                        |
| Sprint Hardening      | `docs/processes/harden-sprint.md`| Pre-implementation scan of `docs/active/**` for technical gaps before a sprint starts |

## Technical Rationale for Findings

Back a hardening or audit finding with a concrete number, not an assertion — memory math (buffer size in bytes or MB), complexity (O(N) behavior), or a specific measured constraint. A finding with no supporting number is opinion, not a defect report.

## Operational Directives

Write output in English only.

Do not reference commit SHAs or "shipped-at" commit IDs in `docs/ROADMAP.md`. Use descriptive status indicators instead — a commit reference goes stale the moment history is rewritten or squashed.

Write every document to the exact repository path given, not a nearby or renamed alternative.
