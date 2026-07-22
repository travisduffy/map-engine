# Shipped plans

Plans whose work has landed. They stay verbatim as the record of what was decided and
why — a plan is a decision artifact, and its per-unit progress lives in git, not in the
document body.

They live here rather than in `docs/plans/` for one practical reason: tooling that picks
up "the newest implementation-ready plan" globs `docs/plans/*.md`, and a completed plan
left there reads as pending work. Moving it is the whole mechanism — nothing inside the
file changes on the way in.

They are **not** part of `docs/archive/`. That directory is a frozen record of the
retired sprint/phase system and is closed to new artifacts; this one is live and will
keep accumulating.

A plan here may have been overtaken by what the work actually found. Read its
conclusions against `docs/vision.md` and `bench/baselines.json`, which are maintained;
these are not.

| Plan                                                      | Shipped | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-07-21-001-refactor-registry-scan-footprint-plan.md` | v0.0.7  | Delivered as planned: the benchmark was repaired and rewritten, and the retained per-sector pixel arrays removed (−64 MiB at 4096×4096). Its premise was then partly overturned by its own measurements — the removal moved wall-clock only 4–6%, and a follow-up optimization the plan never contemplated (splitting the scan into two passes, rekeying off hex strings) delivered 4–6×. Its deferred Worker-relocation section is superseded by `docs/vision.md` §"Open directions". |
