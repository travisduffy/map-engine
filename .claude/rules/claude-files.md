---
paths:
  - 'CLAUDE.md'
  - '.claude/rules/**/*.md'
  - '.claude/skills/**/*.md'
---

## Edit Authority

Edit these files only when explicitly instructed by the user, or when doing so is a defined step within an already-invoked process. Do not modify these files on your own initiative — not to fix phrasing, not to add missing context, not for any reason.

## Voice

Write in direct, active, present-tense imperatives. Lead with the rule, follow with its rationale, add an example only when the rule is not self-evident from the statement alone.

No sentence that does not state a rule, give its rationale, or provide a clarifying example — cut everything else.

**By file type:**

- Rules files: `"Use X when Y."` / `"Avoid Y — it causes Z."`
- Skills files: sequential step imperatives (`"Read the files. Then..."`) — prescriptive is correct here, not aggressive
- CLAUDE.md: mix of factual description and directive pointer; keep lean

## Avoidance List

The following patterns cause overtriggering in Claude 4.x models — the model is more responsive than prior generations and treats emphatic language as amplification it acts on. Replace each with its plain prescriptive form.

| Avoid                                                                         | Replace with                                             |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| `MUST` / `you must always`                                                    | The plain directive: `"Do X."`                           |
| `CRITICAL` / `IMPORTANT` as an intensifier or heading label                   | State the rule directly — remove the label entirely      |
| `NON-NEGOTIABLE`                                                              | The constraint directly: `"Run all checks."`             |
| `NEVER` as a justification intensifier (e.g. _"never valid reasons to skip"_) | The direct constraint: `"Skip no steps."`                |
| `always ensure` / `be sure to` / `strictly`                                   | Remove — the sentence carries the instruction without it |

`never` as a factual constraint is correct — _"never hardcode API URLs"_ is precise and stays. The avoidance applies to `never` as an intensifier on a reason or justification rather than a rule.

## Content Discipline

Claude generalizes from reasoning. A rule that explains its purpose handles unlisted edge cases; a bare directive does not.

Pruning test: _"Would removing this sentence cause Claude to make mistakes?"_ If not, cut it.

## Structural Conventions

Use each element for its appropriate purpose:

| Element     | Use for                                                                |
| ----------- | ---------------------------------------------------------------------- |
| Tables      | Reference data — enumerations, key/value pairs, comparisons, lookups   |
| Code blocks | Patterns, command invocations, type definitions, before/after examples |
| Prose       | Rules and their rationale                                              |
| Lists       | Short parallel items where order doesn't matter and prose would run on |

- Rules files use H2 for sections, H3 for subsections — no deeper nesting
- Every rules file requires YAML `paths:` frontmatter with concrete glob patterns. Content with no natural file-pattern trigger is not a rules file — see File Type Guidelines below.
- One rule per paragraph — don't bundle multiple distinct rules into a single block
- Use plain prose for cross-file references (e.g., `See auth.md for...`) — never markdown hyperlinks (`[text](./file.md#anchor)`). Claude reads `.claude/` files as plain text and cannot navigate links; the syntax adds tokens with no benefit.

## File Type Guidelines

### CLAUDE.md

Contains facts that apply to every session: build commands, project layout, conventions, always-apply rules. Target under 200 lines — longer files reduce adherence.

Content that has no natural per-file trigger — it should apply on every task regardless of what's being touched — belongs here, not in a rules file with an empty or omitted `paths:` field. A rules file without `paths:` is functionally identical to CLAUDE.md content but invisible at a glance: nothing distinguishes a path-scoped file from an always-loaded one except reading its frontmatter, so always-on context can accumulate there unnoticed. CLAUDE.md's line-count target exists precisely to keep every-session content visible to whoever maintains this file; routing it into an unscoped rules file defeats that.

Reference rules files as prose pointers (`"See .claude/rules/<filename>.md"`), not as `@path/to/file.md` imports. An `@` import expands the referenced file inline at every session launch, bypassing the path-scoped conditional loading that makes the rules architecture efficient.

### Rules files

Each file covers one topic, with a descriptive filename (`testing.md`, `api-design.md`). Uses `paths:` frontmatter to scope loading to files matching the pattern — a rules file always has concrete `paths:` values. If a candidate rule doesn't scope to a file pattern, it isn't a rules file; put it in CLAUDE.md instead (see CLAUDE.md above).

### Skills files

Procedural or reference content invoked on demand. Skill body loads only when called — reference material costs nothing until needed. `SKILL.md` under 500 lines; large reference material belongs in separate files in the skill directory.

## Scope

This rule covers writing style and format only. It does not govern:

- What content belongs in which file — governed by CLAUDE.md
- Factual accuracy of rule content — covered when an audit process is explicitly invoked
- Markdown outside `.claude/` (READMEs, changelogs, docs)
