## ADDED Requirements

### Requirement: Canonical Agent Instructions
The repository root SHALL contain a single canonical agent-instructions file named `AGENTS.md` that accurately describes the current project layout and commands. The repository SHALL NOT ship per-tool instruction files (`CLAUDE.md`) or tool-specific configuration directories (`.claude/`) whose content is fully superseded or duplicated by other agent-tooling directories in the repository.

#### Scenario: Contributors find accurate agent instructions
- **WHEN** a contributor opens the repository root
- **THEN** an `AGENTS.md` exists that describes the actual Node.js/Vercel layout, commands, and security model.

#### Scenario: Legacy agent files are absent
- **WHEN** a maintainer checks for `CLAUDE.md` or the `.claude/` directory
- **THEN** neither exists in the tracked file list, and the openspec workflow is documented under `.opencode/` (and mirrored in `.agent/`).
