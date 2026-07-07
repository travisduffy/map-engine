---
name: documentation-sync
description: Full documentation-to-code reconciliation pass — syncs docs/ROADMAP.md, docs/ROADMAP_TRACEABILITY_MATRIX.md, CHANGELOG.md, README.md, and .claude/rules/*.md against the actually-shipped code and merged phase audits after a phase or version closes. Manual-invocation only: run exclusively when the user explicitly types /documentation-sync. Never invoke this proactively — a task that merely touches or mentions documentation (e.g. "update the README", "fix this doc typo") is a normal edit, not a trigger for this skill.
---

# Documentation Sync

Reconciles every documentation surface in the repo against the current, actually-shipped state of the project after a phase audit passes and/or a version is cut. This is a wide, cross-file consistency pass, not a routine doc edit — it exists because status markers, changelogs, and API docs drift independently of each other and of the code, and nothing else in the normal workflow catches that drift in one sweep.

**Do not self-invoke.** This skill runs only when the user explicitly types `/documentation-sync`. If a task merely sounds documentation-adjacent, handle it directly instead of launching this pass.

## Ground rules

- **Code is the source of truth.** Per `.claude/rules/roadmap-governance.md`'s Hierarchy of Truth: when any doc and the codebase disagree, the doc is wrong. Verify every factual claim — method signatures, exported names, error classes, bundle size, test counts — against `src/`, `test/`, `package.json`, and real command output before trusting a single word already written in a doc, including docs you wrote in a prior sync pass.
- **This skill's invocation is itself the user gate.** `docs/ROADMAP.md` normally requires two separate user-gated passes (a review pass producing findings, then an explicit ask to revise — see roadmap-governance.md's Roadmap Stewardship section). Treat the user typing `/documentation-sync` as pre-authorizing both, but **only** for status-sync edits: phase completion markers, revision-history entries, and traceability-matrix rows that record what an _already-merged_ audit verdict established. Do not use this skill's authorization to re-litigate or re-plan future roadmap scope (Phase N+1 content, architecture direction) — that is still a separate, explicitly-requested conversation.
- **Never touch `docs/archive/**`.\*\* It's a frozen historical record (see CLAUDE.md). If an archived file contains an error, report it; do not fix it in place.
- **Never bump `package.json`'s version, never populate the Task Registry, never flip `NO ACTIVE SPRINT` to active.** These stay BDFL-only even during a sync pass — you are reconciling docs to a state the BDFL already established (a merged audit, a named version), not making new project decisions.
- **Don't parallelize across files with subagents.** Every file in scope shares facts — the same audit verdict, the same date, the same feature name — that must land identically everywhere. A fan-out-per-file approach (like `sprint-hardening`'s per-epic fan-out) risks each agent independently rephrasing the same fact slightly differently. Do this as one coordinated pass. (Delegating a single research question — e.g. "summarize what changed in the v0.0.3 archive" — to a subagent while you hold the rest of the state is fine; delegating the writing is not.)

## Phase 0 — Establish ground truth

Before touching any doc, determine what actually changed and what state the project is actually in:

1. `git log --oneline -20` and `git status` — recent merges, current branch, clean tree.
2. Read `docs/active/PROGRESS.md` in full (Current Status, Task Registry) — it's the freshest per-session state and usually already accurate for the active sprint, but verify it against the audit file rather than assuming.
3. Read the relevant `docs/audits/phase-<N>-audit.md` file(s) in full — note the final verdict (`[PASS]`/`[FAIL]`), whether it flipped mid-document (a `[FAIL] → [PASS]` after same-session remediation is common — read to the end, not just the top status line), and the exact date.
4. Check `package.json` version and `docs/archive/` folder names — the archived version tag is the ground truth for "what got released," independent of what CHANGELOG.md currently claims.
5. If a phase/version boundary is ambiguous (e.g., which commit is "the merge"), ask the user rather than guessing — this skill syncs to a state the user already knows, it doesn't infer one.

## Phase 1 — Enumerate every doc surface in scope

Documentation lives in two categories in this repo; check both:

**AI-context tiers (CLAUDE.md's three-tier system):**

- `docs/ROADMAP.md` — phase status headers (prose _and_ the §5 ASCII dependency graph — they drift independently, see Gotchas), Revision History.
- `docs/ROADMAP_TRACEABILITY_MATRIX.md` — the numbered findings table, and any closing/freeze notes at the bottom.
- `.claude/rules/*.md` — grep each file's `paths:` frontmatter against what actually changed in the code this phase touched. A rules file with `paths: src/**/*.ts` describing an architecture that code no longer has is a drift bug, not a style issue — fix it (see `claude-files.md`'s voice/format rules for how rules files must read: direct imperatives, rule-then-rationale, H2/H3 only).
- `CLAUDE.md` itself — only if a command, workspace layout, or top-level convention changed; this is rare and usually out of scope for a routine sync.

**User-facing product docs (not part of the three-tier AI-context system, but equally prone to drift):**

- `README.md` — every code sample, method signature, type shape, error name, numeric constant (bundle size, sector caps, dimension caps), and "what's not included" list.
- `CHANGELOG.md` — check its latest version entry against `package.json` and the `docs/archive/` folder list; a gap of _any_ size means backfill _every_ missing version, not just the newest.

Do not assume this list is exhaustive for every project — re-derive it from CLAUDE.md's Documentation Architecture section plus whatever root-level docs exist (`find . -maxdepth 1 -iname '*.md'`), but the six files above are the fixed core for this repo.

## Phase 2 — Verify against code, file by file

For each file in scope, pull the actual facts from source before writing anything:

- **Public API surface:** read `src/index.ts` for the canonical export list, then grep the main facade class (e.g. `src/MapEngine.ts`) for public method signatures — do not infer the current API from ROADMAP prose. ROADMAP contains both a "Planned" section (§12.5's Canonical Exports/Errors tables) and a shipped reality; cross-check every "Planned" entry against a source grep to see if it quietly graduated to shipped without the roadmap being updated to move it out of "Planned."
- **Numeric/measured claims:** run the actual command (`npm run build && npm run size`, `npm run test` for pass counts) rather than trusting a number already written in a doc, even one written in a previous audit — audits can also drift by the time you're syncing them into a README months later.
- **Deprecation/experimental status:** check the actual JSDoc annotations (`@deprecated`, `@experimental`) in `src/types.ts` and the class files — a README or rules-file claim that something is "experimental" can be stale if the code has since marked it `@deprecated` with a different replacement than the doc names.
- **Consistency scripts as a free pre-flight:** run `./bin/check-finding-codes.sh`, `./bin/check-roadmap-cross-refs.sh`, `./bin/check-matrix-vs-roadmap.sh`, `./bin/check-roadmap-consistency.sh` _before_ editing. If any fails on the unmodified tree, stop and report — syncing on top of an already-broken baseline produces noise, same principle as `sprint-hardening` Phase 0.

## Phase 3 — Apply edits

Write the fixes. A few patterns that recur every time this skill runs:

- **ROADMAP phase-closure edit is two edits, not one:** add `Status: [COMPLETE]` to the phase's box in the §5 ASCII dependency graph, _and_ fix/add the prose `**Status:**` line under that phase's `##` header. These are separate pieces of text and one can be updated while the other is forgotten (this happened in the source session: Phase 2's ASCII box already said `[COMPLETE]` while its prose header still said `[DOCUMENTATION FREEZE]` after the freeze had already been lifted).
- **Traceability matrix grows, it doesn't renumber:** append new findings as new rows continuing the existing numbering — never renumber or edit existing rows to make room. Add a new closing note (e.g. `**[PHASE N CLOSED — <date>]**`) below any existing closing notes rather than editing them; each note is a historical marker for a specific event.
- **CHANGELOG backfill order:** newest version at the top, immediately under the format-preamble; when backfilling multiple missing versions in one pass, write them in descending version order so the file reads newest-first throughout, not just for the entry you personally added.
- **README sections can become actively wrong, not just stale:** a section describing an old "manual opt-in" pattern (e.g. "wire up your own Worker like this") can be fully contradicted once the equivalent capability shipped automatically — check whether the _shape_ of a section is still even a valid integration pattern before just refreshing its numbers. If the underlying capability moved from "manual, external" to "automatic, internal," rewrite the section's premise, don't just tweak its code sample.
- **Revision History / rationale entries:** every edit to `docs/ROADMAP.md` needs a Revision History entry citing which principle (PR-1..PR-5) motivated it, per that file's own Operational Directives — a pure status-sync edit typically cites PR-5 (Reversibility: truthful status markers keep the cost of resuming/auditing work low).
- **Rules-file voice:** when editing `.claude/rules/*.md`, follow `claude-files.md`'s style contract exactly — direct present-tense imperatives, rule then rationale, tables for reference data, H2/H3 only, no markdown hyperlinks between `.claude/` files (plain prose pointers instead).

## Phase 4 — Verify

Run in two parallel batches (per CLAUDE.md's efficiency directive — this applies even though the diff is docs-only, because a stale bundle-size claim or a broken code sample in README is a real correctness bug):

1. **Batch A:** `npm run typecheck` + `npm run typecheck:example` (parallel)
2. **Batch B, after A passes:** `npm run test` + `npm run build` (parallel)
3. Re-run all four `bin/check-*.sh` consistency scripts — all must exit 0.
4. `npm run format`.

If a test fails, isolate it (`npx vitest run <file>`) before concluding the sync broke something — GPU/perf specs in this repo (`*.gl.spec.ts`) can time out under concurrent system load from the very build/test/typecheck batches this phase runs in parallel; a failure that disappears in isolation is environmental, not a regression, and is itself worth a one-line note if a prior audit already flagged that same test as flaky (don't re-discover and re-report the same flake as new).

## Phase 5 — Report

Summarize, per file: what was stale, what it now says, and what command or source location proved the correction. Call out explicitly: version-gap size if CHANGELOG needed backfilling, any `.claude/rules/*.md` file that had fully contradicted (not just outdated) content, and the final state of all four consistency scripts plus the typecheck/test/build batch.

## Gotchas quick-reference

- Phase status can be recorded in two places in ROADMAP.md (ASCII graph + prose header) that drift independently — check both, every phase, every time.
- A doc can be behind by _multiple whole versions_ with nobody noticing (CHANGELOG.md was missing three consecutive releases in the session this skill was built from) — always diff the doc's latest entry against `package.json`/`docs/archive/`, never assume "probably just missing the last one."
- "Planned" tables in ROADMAP §12.5 are aspirational and go stale in the opposite direction too: something can ship without ever being moved out of "Planned." Grep source for every planned item, don't just check that planned items aren't yet built.
- README sections documenting a manual/opt-in workaround can become not just outdated but structurally impossible once the equivalent shipped automatically — read for premise validity, not just fact currency.
- `.claude/rules/*.md` files are easy to forget in a "documentation sync" ask because they live outside `docs/` and are rarely named explicitly — but they're checked into the repo, scoped by `paths:` frontmatter, and drift exactly like any other doc. Always include them.
- Don't trust a number in an existing audit/report doc for a README claim — re-run the command. Numbers reported mid-phase (e.g. a gzip size) can shift slightly by the time you're citing them elsewhere.
