# AGENT Instruction

You are an agent to be responsible our code.
This open-source will be enlarged in the future.
Before it's getting busy, we must stick with the code quality to keep the maintainability.

## SOLID principles

We must stick with genuine SOLID principles written in the book of Uncle's bob.

### SRP) The Single Responsibility Principle

> Gather together the things that change for the same reasons. Separate things that change for different reasons.

### OCP) The Open-Closed Principle

> A Module should be open for extension but closed for modification.

But don't stick with this rule too much, if over-engineering leads code complexity.

### LSP) The Liskov Substitution Principle

> A program that uses an interface must not be confused by an implementation of that interface.

### ISP) The Interface Segregation Principle

> Keep interfaces small so that users don’t end up depending on things they don’t need.

### DIP) The Dependency Inversion Principle

> Depend in the direction of abstraction. High level modules should not depend upon low level details.

## Unit test

Unit tests are first-class citizens
, which meansthey must express concrete, non-arbitrary acceptance/behavior criteria.
Unit tests should serve as a low-level specification (a contract) for each unit: given certain inputs/preconditions, the unit must behave in a defined way (outputs, side-effects, invariants).
Ideally, development follows a test-first approach (e.g. TDD or ATDD), where behavior or acceptance criteria are defined before implementing functionality — so tests drive design, not the other way around.

## Development workflow

- After finishing edits, run `git add` and `git commit`,
  then execute the pre-push in `.husky` and CI/CD checks defined in `.github`.

## Allowed Commands (Project-Level)

The following commands are always allowed without asking for permission:

### File Inspection and Data Processing

- **File reading**: `cat`, `head`, `tail`, `less`, `more`
- **Data processing**: `jq`, `yq`, `cut`, `sort`, `uniq`, `wc`
- **Text processing**: `grep`, `egrep`, `awk`, `sed`
- **File operations**: `find`, `tree`, `ls`, `pwd`

### Git Operations

- **Read-only**: `git status`, `git log`, `git diff`, `git branch`
  - Daily report:
  - `git log --all --author="$(git config user.name)" --since="00:00:00" --format="%h %s"`
- **Write operations** (allowed without asking):
  - `git add <files>` (specific files only, never use -A or .)
  - `git commit` (never use --amend)
  - `git push` (never use --force)
- **Worktree management**:
  - `git worktree add`,
  - `git worktree remove`,
  - `git worktree prune`,
  - `git worktree list`
- Branch management:
  - git checkout
    - git checkout -b
  - git switch
    - git switch -c

If you are asked to work in worktree dir, **never damage the main dir**. Please work only in worktree dir.

### GitHub CLI (gh)

- `gh pr create` - Create pull requests (never ask permission)
- `gh pr list`, `gh pr view`, `gh pr status` - View PR information
- `gh issue create` - Create issues (never ask permission)
- `gh issue list`, `gh issue view` - View issue information
- `gh repo view` - View repository information

## Project Structure & Module Organization

- Rust workspace at the root: `core/` (business logic and R orchestration), `server/` (Axum API for the web build), `desktop/` (Tauri shell), plus shared TypeScript metadata in `shared/`.
- Frontend lives in `client/` (React + Vite). Unit/UI tests sit alongside components; Vitest config is in the package.
- Integration tests for Rust live in `core/tests/`. Desktop end-to-end tests live under `desktop/e2e/`.
- Docs and design notes are under `docs/`; scripts and hooks live in `.husky/` and `scripts/` (when present).

## Build, Test, and Development Commands

- `pnpm dev`: Run Axum backend + Vite client for the browser flow (`http://localhost:5173`).
- `cargo tauri dev` (from `desktop/`): Launch the desktop app with bundled backend/frontend.
- `pnpm --filter client dev`: Frontend only; no Rust backend.
- `pnpm build` or `pnpm --filter client build`: Production bundles for all or just the client.
- `cargo test` (root) or `cargo test -p reprod-core`: Run Rust unit/integration suites.
- `pnpm -r lint` or `pnpm biome:check`: TypeScript lint/format check; `pnpm format` to apply formatting.

## Coding Style & Naming Conventions

- TypeScript: strict mode, explicit return types, two-space indent. React components in PascalCase; hooks/utils in camelCase; env vars in SCREAMING_SNAKE_CASE. Group imports as external → shared → local.
- Rust: favor `anyhow::Result` + `?`; avoid `unwrap`/`expect` (clippy is configured to deny them). Keep modules small and focused.
- Formatting: use Biome for TS (`pnpm format`), `cargo fmt` for Rust. Prefer functional React components and extracted custom hooks for side effects.

## Testing Guidelines

- Rust: integration suites in `core/tests/` validate timeline/export/workflow behavior; add new cases near related modules. Use deterministic IDs/logging to keep tests stable.
- Frontend: use Vitest + Testing Library (`pnpm --filter client test`). Co-locate `*.test.ts(x)` with the component or utility under test.
- Aim to cover new utilities/hooks and regressions; keep snapshots minimal and prefer explicit assertions.

## Commit & Pull Request Guidelines

- When you have noticed that you have finished some todos or tasks, always consider to `git add/commit`.
- Commit messages: short, present tense, start with an action (e.g., “Add model selection constants”). Keep the summary under ~72 chars; include scope prefixes only when they add clarity.
- After committing, please eusure that you pass both of pre-push hook in .husky dir and Ci/CD workflow in .github dir
- PRs: include a crisp summary, linked issue/ID, and before/after notes. Add screenshots or clips for UI changes; list test commands run (cargo tests, Vitest, lint/format). Request review when checks pass and TODOs are cleared.

## Security & Configuration Tips

- Do not commit API keys; variables. Keep `.reprod/` artifacts local and out of git.
- Ensure Node 18+ and a recent Rust toolchain; enable `corepack` or install pnpm 9+ before running workspace scripts.

# Additional notes

If developer-specific instructions exist in AGENTS.{username}.md,
Codex should load them after this file.
