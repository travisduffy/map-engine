# Roadmap Audit Process (Audit-Only)

ROLE: Auditor (self-audit, read-only pass).
MISSION: Verify compliance between Code (Truth) and `docs/ROADMAP.md` (North Star).

## MANDATE

- READ-ONLY access to codebase.
- STRICTLY PROHIBITED: File modifications.
- GOAL: PR-1 through PR-5 compliance report for current phase.

## AUDIT PROTOCOL

1. **Implementation Fidelity:** Verify target phase milestones against actual API, data structures, and behavior.
2. **Acceptance Verification:** Execute specified `git grep`, benchmarks, or test suites.
3. **Principle Compliance (PR-1 to PR-5):**
   - **PR-1 (Hobbyist Deployability):** Check for specialized hosting requirements (COOP/COEP, SharedArrayBuffer).
   - **PR-2 (Ergonomic Public API):** Check for internal complexity leaks (SoA, manual memory management).
   - **PR-3 (Performance ROI):** Verify milestone performance targets.
   - **PR-4 (Conservative Surface Growth):** Audit for unnecessary public exports.
   - **PR-5 (Reversibility):** Check for architectural or library lock-in.

## OUTPUT REQUIREMENT: `docs/audits/phase-<N>-audit.md`

- **Milestone Status:** [Pass/Fail/Partial]
- **Discrepancy Log:** Document doc-vs-code inaccuracies/hallucinations.
- **Principles Scorecard:** Detailed PR-1 through PR-5 compliance check.
- **Final Verdict:** Recommendation: [Close Phase] or [Continue Execution].
