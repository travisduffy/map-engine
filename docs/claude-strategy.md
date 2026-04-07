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
