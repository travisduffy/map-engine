# Archive — Historical Record

This directory holds the per-version record of `map-engine`'s development, plus the
**frozen, read-only** remains of the sprint/phase project-management system that drove
v0.0.1–v0.0.6. That system has been retired: there are no further sprints, PRDs, epics,
or phase audits.

From v0.0.7 the per-version directories continue, but they hold whatever planning
artifact that release actually produced rather than the retired system's fixed set —
`v0.0.6/POST-AI-CLEANUP-PLAN.md` is the precedent. Nothing here is governed or updated
after its version ships; these are completion records, not living documents.

## Contents

| Path                                     | What it is                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v0.0.1/` … `v0.0.6/`                    | Per-version snapshots of each shipped sprint's PRD, PROGRESS, and epic work specs.                                                                                                                                  |
| `v0.0.6/POST-AI-CLEANUP-PLAN.md`         | The post-AI-development taste-cleanup plan (units U1–U11: audit → codex → pilot → propagate). A standalone effort archived on completion, not part of the retired sprint system.                                    |
| `v0.0.7/REGISTRY-SCAN-FOOTPRINT-PLAN.md` | The plan behind v0.0.7's map-load work: make the O(W×H) scan measurable, then remove the largest allocation in it that served no consumer. Its measurements partly overturned its own premise — see the note below. |
| `ROADMAP.md`                             | The former canonical technical & product roadmap (vision, Pillars, Principles, Capability Areas, phase plan). Historical reference for design intent.                                                               |
| `ROADMAP_TRACEABILITY_MATRIX.md`         | Mapping of past audit findings to the roadmap sections that resolved them.                                                                                                                                          |
| `audits/`                                | The five phase exit-audit reports (`phase-0` … `phase-4`).                                                                                                                                                          |

Treat everything here as immutable. Do not edit these files or their internal
cross-references, and do not add new sprint/PRD/audit artifacts — the process that
produced them no longer exists. A new `vX.Y.Z/` directory at release time is the one
addition that stays open.

A plan here records what was decided going in, not what turned out to be true. v0.0.7's
is the clearest case: it treated the retained per-sector pixel arrays as the prize, and
removing them did recover ~64 MiB — but the same benchmark it built showed that change
moved wall-clock only 4–6%, and a follow-up the plan never contemplated (splitting the
scan into two passes and rekeying it off hex strings) delivered 4–6×. Its deferred
Worker-relocation section is superseded by `docs/vision.md` §"Open directions". Read
conclusions against `docs/vision.md` and `bench/baselines.json`, which are maintained.
