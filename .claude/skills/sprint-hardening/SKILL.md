---
name: sprint-hardening
description: Pre-implementation review-and-revision pass over docs/active/** (PRD, PROGRESS, epics). Fans out one subagent per epic to find and fix inaccuracies, info gaps, misdirections, hidden gotchas, ambiguities, and conflicting instructions that could cause an implementing agent to get confused, stuck, or do the wrong thing. Run after sprint docs are drafted and before the BDFL activates the sprint.
---

# Sprint Hardening

Review and revise the active sprint documentation (`docs/active/**`) so an implementing agent with no session history can execute it without guessing. Find inaccuracies, info gaps, misdirections, hidden gotchas, ambiguities, and conflicting instructions — then fix them in place. Supersedes the retired read-only process formerly at `docs/processes/harden-sprint.md`.

## Ground rules

- Code is the source of truth (see `.claude/rules/roadmap-governance.md`). Verify every factual claim in the docs against `src/`, `test/`, `bench/`, and `package.json` before trusting it; fix the doc to match reality, never the reverse.
- Edit only `docs/active/**`. Defects found in `docs/ROADMAP.md`, `CLAUDE.md`, `.claude/rules/`, or code go in the final report as deferred findings — roadmap review/revision is user-gated, and code fixes belong to the sprint itself.
- Preserve BDFL boundaries: do not activate the sprint, change Task Registry statuses, write specific future version numbers, or archive anything.
- Back every finding with a concrete number, a quoted contradiction pair, or a failed verification command — a finding without evidence is opinion (per `.claude/rules/roadmap-governance.md`).
- Fix substance, not style: wrong facts, contradictions, ambiguous acceptance criteria, missing prerequisites, broken paths, undefined terms, unstated dependencies. Leave phrasing and formatting alone unless they change meaning.
- When two defensible readings of a requirement conflict and choosing one changes scope, do not pick — record the finding as `needs BDFL ruling` in the report and leave the text unchanged.

## Phase 0 — Pre-flight (coordinator, no subagents)

1. Run the four consistency scripts: `./bin/check-finding-codes.sh`, `./bin/check-roadmap-cross-refs.sh`, `./bin/check-matrix-vs-roadmap.sh`, `./bin/check-roadmap-consistency.sh`. If any exits non-zero, halt and report — hardening on top of a broken baseline produces noise.
2. Read `docs/active/PRD.md` and `docs/active/PROGRESS.md` in full (skip whatever is already preloaded in context); list `docs/active/epics/`.
3. Confirm the docs are in a hardenable state: PRD status is final (not the template placeholder) and at least one epic file exists. If not, stop — there is nothing to harden.
4. Locate the roadmap sections the sprint cites by grepping `docs/ROADMAP.md` for its phase and milestone headers; note line ranges so subagents can read surgically instead of loading the whole file.

## Phase 1 — Per-epic fan-out

Spawn one general-purpose subagent per epic file, all in parallel, one epic per agent. Give each agent this prompt, filled in:

```text
Harden docs/active/epics/<epic-file> for the map-engine sprint. You are one of
N parallel reviewers; you own exactly this epic file.

Read first: docs/active/epics/<epic-file>, docs/active/PRD.md, the Task
Registry rows for this epic in docs/active/PROGRESS.md, and docs/ROADMAP.md
lines <ranges> (the sections this epic cites). Code is the source of truth:
verify claims with grep/reads against src/, test/, bench/, package.json.

Check, in order:
1. Traceability — every task's PRD/ROADMAP citation resolves to a real section
   saying what the task claims it says; quoted signatures, error names, paths,
   and thresholds match the cited text exactly.
2. Code truth — every "already exists / already shipped" claim, file path,
   npm script, fixture path, and API reference is verified against the repo.
   Flag anything asserted but absent, or present but contradicted.
3. Executability — done-when criteria are falsifiable; no task consumes an
   artifact that no earlier task (this epic or an explicitly named earlier
   epic) produces; tools and test harness capabilities assumed by a task
   actually exist in this repo's setup.
4. Contradictions — numbers, names, or semantics that disagree between this
   epic, the PRD, the PROGRESS registry row, or the roadmap.
5. Gotchas — unstated units, coordinate Y-inversion, buffer sizing math,
   sentinel values, sync/async mismatches, ownership/transfer ordering,
   lifecycle edge cases an implementer could plausibly get wrong.

Authority: edit ONLY your epic file, applying the smallest wording change that
removes each defect. Do not edit the PRD, PROGRESS, the roadmap, or any other
file — report those findings instead. Do not add version numbers. Do not
expand scope: hardening clarifies existing requirements, it does not invent
new ones.

Return a report: (a) findings table ordered by severity
[Critical/High/Medium/Low] with columns WHAT / WHERE (file §section) / WHY
(number, quoted contradiction, or failed check) / RESOLUTION (FIXED-IN-EPIC,
PROPOSED-FOR-<file>, or NEEDS-BDFL-RULING); (b) exact list of edits you
applied; (c) proposed exact text changes for any PRD/PROGRESS fixes.
```

## Phase 2 — Fan-in and shared-file revision (coordinator)

1. Collect all subagent reports. Deduplicate findings; where two epics propose conflicting fixes (e.g., both claim ownership of shared infrastructure, or propose different values for the same constant), resolve against the roadmap and code, and re-edit the losing epic file directly.
2. Re-read any epic file a subagent edited only if its report is ambiguous about what changed — otherwise trust the report.
3. Apply all accepted PRD fixes, then all accepted PROGRESS fixes — one Read → one Write per file, folding in the session-log entry for this pass (CLAUDE.md efficiency directive: never multiple edits to a state file).
4. Sweep for cross-epic consistency after edits: task numbering matches the registry, shared-infrastructure tasks are owned by exactly one epic and referenced (not respecified) by the others, phase-gate wording is identical everywhere it appears.

## Phase 3 — Verify and report

1. Run `npm run format`, then re-run the four consistency scripts; all must exit 0.
2. Spot-check traceability on the edited files: grep each changed citation to confirm it still resolves.
3. Report to the user, ordered by severity: findings fixed (with file and evidence), findings deferred (ROADMAP/code/rules defects — where they live and why they were not fixed here), and findings needing a BDFL ruling. State plainly if a pass found nothing — a clean pass is a valid outcome; do not manufacture findings.
