# Epic N: [Title]

**Objective:** [One sentence — what this epic delivers and why it matters.]
**Scope:** Incorporates PRD §[section(s)].

**Verifiable & Measurable Success Criteria:**

- **[Concern Area 1]:** [Falsifiable statement describing the observable outcome. Avoid "works correctly" — describe the exact behavior that can be verified.]
- **[Concern Area 2]:** [Falsifiable statement.]
- **[Concern Area 3]:** [Falsifiable statement.]

<!-- Add one bullet per major concern area. These should map to the acceptance criteria in docs/active/PRD.md. -->

---

## Tasks

### Task N.1 — [Title]

**PRD Reference:** [Exact section heading(s) in docs/active/PRD.md — e.g., §"Epic N: Acceptance Criteria", §"Core Functionality — Feature X"]

[One paragraph describing what this task produces and why it is scoped this way. Note any cross-task dependencies or sequencing constraints — e.g., "Task N.2 depends on the field introduced here."]

**Work:**

- [Specific implementation step. Be precise: name the class, method, field, or file. If the PRD specifies an exact algorithm or type signature, reproduce it here so the implementer does not need to context-switch.]
- [Another step. If order matters, list steps sequentially. If a step has a non-obvious rationale, include a parenthetical PRD citation — e.g., "(PRD §N.2 — reason for this constraint)"]
- [Include exact type signatures, method signatures, or pseudocode where ambiguity could cause wrong implementations. Copy from the PRD rather than paraphrasing when precision matters.]

**Done when:** [Specific, falsifiable completion conditions — e.g., "after construction, `field.value === expectedValue`; calling `method()` before initialization throws `Error('...')`; `npm run typecheck` passes with zero errors; grep for `import.*three` in `SectorRegistry.ts` returns empty."]

---

### Task N.2 — [Title]

**PRD Reference:** [Section(s)]

[Description.]

**Work:**

- [Step.]
- [Step.]

**Done when:** [Criteria.]

---

<!-- Add Task N.3, N.4, etc. as needed. Each task should be completable in a single focused session. If a task's Work section exceeds ~10 bullets, consider splitting it. -->
