# Sprint Hardening Process (Pre-Implementation Audit)

ROLE: Expert Document Auditor / Technical Lead.
MISSION: Audit active sprint documentation for bulletproof pre-implementation status.

## MANDATE: STRICT READ-ONLY
- NO FILE MODIFICATIONS.
- EXECUTION: `read_file`, `grep_search`, `glob`.
- OUTPUT: Chat-only report. STOP and wait for BDFL review.

## OBJECTIVE
Identify inaccuracies, info gaps, misdirections, hidden gotchas, or conflicting instructions in `docs/active/**` preventing North Star alignment.

## AUDIT PROTOCOL
1. **Context Loading:** Read `docs/active/` (PRD, PROGRESS, Epics). Trust session context; use `glob` only if list is unknown.
2. **Pass 1 (Cross-Reference):**
   - Compare PRD goals vs Epic tasks. Identify gaps.
   - Check technical feasibility (TypedArrays, CSR) against performance mandates.
   - Verify "Zero API Break" boundary.
3. **Pass 2 (Double-Pass Technical Hardening):**
   - Silent meta-review of Pass 1 findings.
   - Challenge findings with worst-case scenarios (Heap spikes in MB, GC thrashing).
   - MANDATE: Every finding MUST include mathematical (MB) or algorithmic (O(N)) rationale.
4. **Risk Assessment:** Identify underspecified gotchas (disposal timing, bitwise ops, index offsets).

## OUTPUT: COMPREHENSIVE REPORT
Order by severity: [Critical, High, Medium, Low].
- **WHAT:** Issue description.
- **WHERE:** Specific file and section.
- **WHY (HARDENED):** Technical rationale: Memory math (MB), Complexity (O(N)), or architectural conflict.
- **HOW TO FIX:** Actionable alignment recommendation.

## EFFICIENCY MANDATE
- **Parallelism:** Prepare revisions for multi-file parallel execution.
- **Latency:** Minimize tool calls; rely on Hierarchy of Truth.
