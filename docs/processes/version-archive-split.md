# Version Archive Split Process

ROLE: Documentation steward (write authority — this is not a read-only audit pass).
MISSION: When a sprint's phase completes and is exit-audited to `[PASS]`, archive its scope out of the active docs into a frozen, standalone archive under its own new version. Two variants, chosen by whether another phase continues under the same sprint:

- **Split** (a phase closes, but the sprint continues): leave the remaining phase(s) in the active sprint. This was the v0.0.5→v0.0.6 case — Phase 3 closed, Phase 4 continued in `docs/active/`.
- **Full close** (the closing phase was the sprint's last): the active docs have nothing left to trim to, since no phase is defined to continue. Reset them to `NO ACTIVE SPRINT` instead. This was the v0.0.6 case — Phase 4 was Epics 5–8 in full, and no Phase 5 scope had been authorized at archive time.

## MANDATE

- Triggered only on explicit BDFL instruction to archive/split — never inferred from a passed audit alone (CLAUDE.md: "Archiving is a human-triggered event").
- Every archive event locks in exactly one new, distinct SemVer version. Never suffix an archive folder with `-phase-N` on a version number used elsewhere. Before naming the folder, check `git log -p -- package.json` and prior release commit messages against the candidate name — existing `docs/archive/` folder names may themselves be wrong; don't mirror a name without checking it against that evidence.
- Never touch `docs/audits/phase-<N>-audit.md` or `docs/ROADMAP.md` as part of a split. Audits are permanent and never archived; ROADMAP revision is a separate, user-gated pass.
- Never modify `package.json`'s version field as part of a split — version bumps are BDFL-only (Versioning Policy).

## PROCEDURE

1. **Archive the completed phase** to `docs/archive/v<X.Y.Z>/`:
   - `PRD.md` — retitle the H1 to the phase name; freeze the status block to what shipped; keep only that phase's Goals/Architecture/Acceptance-Criteria/Known-Risks; note the split lineage (what it was split from, what continues where).
   - `PROGRESS.md` — retitle the H1 to the phase name; freeze Current Status; carry the Task Registry rows for that phase's epics only, with `Full spec` paths repointed at the new archive location; carry every Session Log entry and every Lessons Learned entry for that phase verbatim — the archive copy is never trimmed.
   - `epics/epic-N-*.md` — `git mv` the completed phase's epic files into `docs/archive/v<X.Y.Z>/epics/`.
2. **Update the active docs** (`docs/active/PRD.md`, `docs/active/PROGRESS.md`, `docs/active/epics/`), by variant:
   - **Split** — trim to the remaining phase(s) only. PRD: reduce shipped-phase detail to brief "already shipped, see archive" backreferences; keep only forward-relevant Goals/Architecture/Acceptance-Criteria/Risks. PROGRESS: retitle the H1 to the remaining phase's name; reset Current Status to reflect what's complete/archived vs. what's next; reset the Session Log to one new entry documenting the split itself; reset Lessons Learned to only the entries with explicit forward relevance to the remaining epics — the rest stay accessible via the archive copy, not duplicated.
   - **Full close** — no phase remains to trim to. Rewrite both files from `docs/templates/PRD_TEMPLATE.md` and `docs/templates/PROGRESS_TEMPLATE.md` (Current Status: `NO ACTIVE SPRINT`, Task Registry and Lessons Learned empty). Append one Session Log entry to the reset PROGRESS.md documenting the archive event before the reset — it is the only content in that file's history that survives the rewrite, so it must state what was archived, where, and why, not just "archived."
3. Name the next target version only if the BDFL has explicitly named it in-session; otherwise use "the next patch release" per Versioning Policy.
4. Run the four `bin/check-*.sh` consistency scripts and `npm run format` before considering the archive done.

## OUTPUT

- `docs/archive/v<X.Y.Z>/{PRD.md,PROGRESS.md,epics/}` — frozen, in both variants.
- **Split:** `docs/active/{PRD.md,PROGRESS.md,epics/}` — trimmed to remaining scope.
- **Full close:** `docs/active/{PRD.md,PROGRESS.md}` — reset to template, `NO ACTIVE SPRINT`; `docs/active/epics/` empty.
- A Session Log entry documenting the archive, citing this process — in the active `PROGRESS.md` (split), or as the one entry appended before the full-close reset (full close).
