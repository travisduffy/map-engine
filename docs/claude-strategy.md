# Claude Code Repository Strategy

A strict, three-tiered documentation system designed for deterministic AI-assisted development. This strategy enforces context isolation, ensuring the AI receives only the exact context it needs, while mandating that the AI autonomously maintains its own rule sets.

## The Three-Tier Context Architecture

The core of this strategy is the strict separation of concerns between human-facing documentation, global AI directives, and scoped domain rules.

### Tier 1: README.md (The Human Interface)

**Audience:** Humans only.
**Purpose:** The AI does not rely on this file for architectural execution. It exists solely to orient human developers.

- **Contains:** High-level project purpose, local environment setup, required environment variables, and deployment instructions.
- **Rule:** Never place AI coding instructions, anti-patterns, or technical conventions here.

### Tier 2: CLAUDE.md (Global Context & Workflow)

**Audience:** Claude Code.
**Loaded:** Automatically, every session.
**Purpose:** Defines the immutable boundaries of the project, available CLI tools, and the mandatory execution workflow.

- **Contains:** Global tech stack constraints (e.g., Node 24, npm workspaces), project-wide CLI commands (build, lint, test), and the mandatory Post-Task Checklist.
- **Rule:** Keep this file strictly global. Do not include domain-specific logic, styling constraints, or API shapes.

### Tier 3: .claude/rules/\*.md (Path-Scoped Context)

**Audience:** Claude Code.
**Loaded:** Conditionally, triggered by YAML frontmatter `paths`.
**Purpose:** The primary mechanism for preventing context bloat and hallucination. Rules only load when the AI edits files within the matching paths.

- **Contains:** Domain-specific architectural choices (e.g., "No state management libraries in `client/`"), explicit anti-patterns, data schemas, API response conventions, and testing strategies.
- **Rule:** Every distinct domain (e.g., frontend, backend, testing) must have its own path-scoped rule file.

## Active vs. Archive: Development Cycle Management

### The Two States

`docs/active/` is always in one of two states:

| State      | Indicator                                                                                                               | What it means                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Active** | `docs/active/PROGRESS.md` Task Registry has tasks; `docs/active/PRD.md` Status is not `DRAFT` and Overview is populated | A development cycle is underway. Implementation work is authorized.                        |
| **Idle**   | Task Registry is empty; Status reads `NO ACTIVE SPRINT`                                                                 | Between cycles. Do not begin implementation. Wait for the user to initialize a new sprint. |

`docs/active/` always exists. The files inside it are always present — either real sprint content (Active) or idle-state placeholders (Idle). AI agents always read from the same paths.

### Directory Structure

```
docs/
├── active/                   # transient sprint workspace — replaced each cycle
│   ├── PRD.md                # active PRD (DRAFT → Active → shipped)
│   ├── PROGRESS.md           # session handoff + task registry
│   └── epics/                # per-epic task specs (empty between cycles)
├── archive/                  # read-only completed versions
│   └── v0.0.1/
│       ├── PRD.md            # snapshot of spec at ship
│       ├── PROGRESS.md       # full session log and task history
│       └── epics/            # all epic files for that version
├── templates/                # blank starters for new sprint initialization
│   ├── PRD_TEMPLATE.md
│   └── PROGRESS_TEMPLATE.md
├── research/                 # reference PDFs and source material
├── ROADMAP.md                # living, version-agnostic capability roadmap
└── claude-strategy.md        # this file
```

### Sprint Lifecycle

#### Starting a new sprint (human-triggered)

1. Copy `docs/templates/PRD_TEMPLATE.md` → `docs/active/PRD.md`
2. Copy `docs/templates/PROGRESS_TEMPLATE.md` → `docs/active/PROGRESS.md`
3. Ensure `docs/active/epics/` is empty
4. BDFL (with AI collaboration) populates `docs/active/PRD.md` — status progresses from `DRAFT` to `Active`
5. BDFL populates `docs/active/PROGRESS.md` Task Registry and creates epic files in `docs/active/epics/`

#### During a sprint

- AI reads `docs/active/PROGRESS.md` at the start of every session
- AI reads/writes `docs/active/epics/*.md` for task specs
- AI cross-references `docs/active/PRD.md` as the canonical authority
- No reads from `docs/archive/` unless explicitly requested

#### Archiving (human-triggered, AI executes when instructed)

1. BDFL announces the version number (e.g., `v0.0.2`)
2. AI creates `docs/archive/vX.X.X/`
3. AI copies `docs/active/PRD.md` → `docs/archive/vX.X.X/PRD.md`
4. AI copies `docs/active/PROGRESS.md` → `docs/archive/vX.X.X/PROGRESS.md`
5. AI copies `docs/active/epics/` → `docs/archive/vX.X.X/epics/`
6. AI resets `docs/active/PRD.md` and `docs/active/PROGRESS.md` to idle-state placeholders (sourced from `docs/templates/`)
7. AI clears `docs/active/epics/` (remove all files; keep the directory with `.gitkeep`)

### Rules for AI Agents

1. **`docs/archive/` is strictly read-only historical context.** Reference it only when explicitly asked. Never modify its contents.
2. **Archiving is a human-triggered event.** Claude must never autonomously move files into `docs/archive/`. An archive sequence only happens when the user explicitly instructs it in that session.
3. **SemVer tags are assigned by the human (BDFL).** Claude does not determine the version number for an archive.
4. **Between cycles, `docs/active/PRD.md` and `docs/active/PROGRESS.md` are idle-state placeholders.** They signal `NO ACTIVE SPRINT` — do not begin implementation.
5. **`docs/templates/` is the source of new sprint docs.** Never modify the templates directly during a sprint; they are the canonical blank starters.

## The Self-Maintaining Loop

The AI is strictly required to verify its own execution and maintain the accuracy of this three-tier system via a mandatory Post-Task Checklist embedded in `CLAUDE.md`.

### The Post-Task Checklist

Before concluding any task, the AI must autonomously execute the following sequence:

1.  **Build:** Execute the build command and fix compilation errors.
2.  **Lint:** Execute the linter and fix warnings/errors.
3.  **Test:** Execute the test suite and fix failures.
4.  **Document:** The AI must systematically update the documentation architecture to reflect the codebase's new reality before marking the task complete:
    - _Did a domain pattern, dependency, or schema change?_ Update the corresponding `.claude/rules/*.md` file.
    - _Did a global command or cross-cutting constraint change?_ Update `CLAUDE.md`.
    - _Did human setup steps or required environment variables change?_ Update `README.md`.
