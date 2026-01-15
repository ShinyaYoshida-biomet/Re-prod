# Contributing to Re-prod

Thank you for your interest in contributing to Re-prod. We welcome contributions from the community.

**AI Agent Instructions**: If you are an AI coding agent, please also read [AGENTS.md](./AGENTS.md) for additional coding principles and guidelines.

## Before You Start

1. **Read the [README.md](./README.md)** to understand the project vision and goals
2. **Agree with our vision** - Re-prod aims to be a reproducible R data analysis environment with timeline tracking and AI assistance
3. If you align with this direction, you are ready to contribute

## What Can I Work On

### Open for Contribution

**You can freely work on any issue listed in our [GitHub Issues](https://github.com/ShinyaYoshida-biomet/Re-prod/issues).**

- Pick an issue that interests you
- Comment on the issue to let others know you are working on it
- Fork the repo, create a branch, and start coding. Please note that the current default branch is `develop`, not `main`. `

### Discuss First

**For anything NOT already listed as an issue:**

- Please open a discussion or issue first
- Tag [@ShinyaYoshida-biomet](https://github.com/ShinyaYoshida-biomet) for feedback
- Wait for approval before starting work
- This helps us maintain project coherence and avoid duplicate efforts

## Project Structure

Understanding the project structure will help you navigate the codebase:

- **Rust workspace** at the root:
  - `core/` - Business logic and R orchestration
  - `server/` - Axum API for the web build
  - `desktop/` - Tauri shell for desktop application
  - `shared/` - Shared TypeScript metadata
- **Frontend**: `client/` (React + Vite)
  - Unit/UI tests sit alongside components
  - Vitest config is in the package
- **Tests**:
  - Rust integration tests: `core/tests/`
  - Desktop end-to-end tests: `desktop/e2e/`
- **Documentation**: `docs/` directory
- **Scripts & Hooks**: `.husky/` and `scripts/` directories

## Development Workflow

### 1. Setup

```bash
# Clone the repo
git clone https://github.com/ShinyaYoshida-biomet/Re-prod.git
cd Re-prod

# Install dependencies
# This also sets up Git hooks automatically via Husky
pnpm install
```

**Requirements**:
- Node 18+ (enable `corepack` or install pnpm 9+)
- Recent Rust toolchain

### 2. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-number-description
```

Branch names such as `test-XX` and `issue-YYY` are not acceptable.

### 3. Development Commands

Choose the appropriate command for your development needs:

```bash
# Run Axum backend + Vite client for browser (http://localhost:5173)
pnpm dev

# Launch desktop app with bundled backend/frontend
cd desktop && cargo tauri dev

# Frontend only (no Rust backend)
pnpm --filter client dev

# Production builds
pnpm build                      # All packages
pnpm --filter client build      # Client only
```

### 4. Make Your Changes

- Write clean, readable code
- Follow existing code style and patterns (see [Code Style](#code-style) below)
- Add comments for complex logic only (prefer self-documenting code)

### 5. Write Tests

**Unit tests and CI/CD must pass before merging.**

```bash
# Rust unit/integration suites
cargo test                      # All tests
cargo test -p reprod-core       # Specific package

# Frontend tests
pnpm --filter client test
```

### 6. Run Checks Locally

Run these checks before committing to catch issues early:

```bash
# TypeScript lint/format check
pnpm -r lint
pnpm biome:check

# Apply formatting
pnpm format

# Rust formatting
cargo fmt --check
cargo fmt              # Apply formatting

# Rust linting
cargo clippy

# Build check
pnpm --filter client run build
cargo build
```

### 7. Commit Your Changes

```bash
git add <specific-files>  # NEVER use -A or .
git commit -m "feat: add feature X"
```

**Commit message guidelines:**

- **Format**: `<type>: <short summary>` (present tense, action verb)
- **Length**: Keep summary under ~72 characters
- **Types**:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation
  - `test:` for test changes
  - `refactor:` for code refactoring
- **Examples**:
  - "Add model selection constants"
  - "Fix timeline export edge case"
  - "Refactor buffer state management"
- **Scope prefixes**: Include only when they add clarity

**Important**: Make frequent commits as you complete logical units of work.

### 8. Push and Create PR

```bash
git push origin feat/your-feature-name
```

Then open a Pull Request on GitHub following PR template located in `.github` dir.

## Pull Request Requirements

Before your PR can be merged, ensure:

1. **All unit tests pass** (both Rust and TypeScript)
2. **CI/CD pipeline passes** (including pre-push hooks)
3. **Code follows project conventions** (see [Code Style](#code-style))
4. **Addresses an existing issue** (or was pre-approved via Discussion)
5. **Includes test coverage** for new features/fixes
6. **Documentation updated** (if applicable)

**Pull request content should include:**
- Crisp summary of changes
- Linked issue/ID (`Fixes #123`)
- Before/after notes for behavior changes
- Screenshots or clips for UI changes
- List of test commands run (cargo tests, Vitest, lint/format)

Request review only when all checks pass and TODOs are cleared.

## Code Style

### TypeScript/React

- **Strict mode**: Enable TypeScript strict mode, use explicit return types
- **Indentation**: Two spaces
- **Components**: PascalCase for React components
- **Functions/Hooks**: camelCase for hooks and utilities
- **Environment variables**: SCREAMING_SNAKE_CASE
- **Import organization**: Group as external → shared → local
- **Component style**: Prefer functional components with hooks
- **Side effects**: Extract custom hooks for side effects
- **Types**: Avoid `any`, use proper TypeScript types
- **Formatting**: Use Biome for TS (`pnpm format`)

### Rust

- **Error handling**: Favor `anyhow::Result` + `?` operator
- **Avoid panic**: Never use `unwrap()`/`expect()` (clippy denies them)
- **Module size**: Keep modules small and focused
- **Formatting**: Use `cargo fmt` before committing
- **Linting**: Address all `cargo clippy` warnings
- **Idiomatic**: Write idiomatic Rust following community standards
- **Documentation**: Add doc comments for public APIs

### General

- **Self-documenting code**: Prefer clear names over comments
- **Comments**: Add only for complex logic that isn't self-evident
- **Consistency**: Follow existing patterns in the codebase

## Testing Guidelines

### Rust Tests

- **Location**: Integration suites in `core/tests/`
- **Purpose**: Validate timeline/export/workflow behavior
- **Organization**: Add new cases near related modules
- **Stability**: Use deterministic IDs and logging to keep tests stable
- **Unit tests**: Use `#[cfg(test)]` modules or separate `*_test.rs` files

### Frontend Tests

- **Framework**: Vitest + Testing Library
- **Command**: `pnpm --filter client test`
- **Location**: Co-locate `*.test.ts(x)` with the component or utility under test
- **Coverage**: Aim to cover new utilities/hooks and regressions
- **Snapshots**: Keep minimal, prefer explicit assertions
- **Integration**: End-to-end tests in `client/src/**/*.integration.test.ts`

### Desktop Tests

- **Location**: `desktop/e2e/` for end-to-end tests
- **Purpose**: Validate desktop-specific workflows
- **Local runs**: Use Docker (local E2E is disabled outside Docker/CI)
  - Playwright (web): `pnpm --filter @reprod/e2e test:docker`
  - WebDriverIO (desktop): `pnpm --filter @reprod/e2e test:docker:webdriver`
  - Run all E2E suites: run both commands above (web + desktop)
  - Optional: `REPROD_E2E_DOCKER_MEMORY=8g REPROD_E2E_DOCKER_CPUS=6 pnpm --filter @reprod/e2e test:docker`

## Git Hooks

We use [Husky](https://typicode.github.io/husky/) to manage git hooks. Hooks are automatically installed when you run `pnpm install`.

**Pre-push hooks check:**

- Rust formatting (`cargo fmt --check`)
- Rust linting (`cargo clippy`)
- TypeScript linting (`pnpm run lint`)

**To bypass hooks** (not recommended): `git push --no-verify`

After committing, ensure you pass both pre-push hooks in `.husky/` and CI/CD workflows in `.github/`.

## Security & Configuration

- **API Keys**: Never commit API keys or sensitive variables
- **Local artifacts**: Keep `.reprod/` artifacts local and out of git
- **Environment files**: Use `.env` files for local configuration (git-ignored)
- **Configuration files**: User config can go in `~/.reprod/auth.json`

## Allowed Git Commands

For reference, these Git operations are allowed without special permission:

### Read-Only Commands

- `git status`, `git log`, `git diff`, `git branch`, `git show`
- `git branch -a`, `git branch -r`
- `git remote`, `git remote -v`
- Daily report: `git log --all --author="$(git config user.name)" --since="00:00:00" --format="%h %s"`

### Write Operations

- `git add <specific-files>` (**NEVER** use `git add -A` or `git add .`)
- `git commit` (**NEVER** use `--amend` or `--force` options)
- `git push` (**NEVER** use `--force`)
- `git checkout`, `git checkout -b`, `git switch`, `git switch -c`

### Worktree Management

- `git worktree add`, `git worktree remove`
- `git worktree prune`, `git worktree list`

**Important**: When working in a worktree directory, never damage the main directory. Work only in the worktree.

### GitHub CLI (gh)

- `gh pr create`, `gh pr list`, `gh pr view`, `gh pr status`
- `gh issue create`, `gh issue list`, `gh issue view`
- `gh repo view`

## Getting Help

- **Questions** - Open a [Discussion](https://github.com/ShinyaYoshida-biomet/Re-prod/discussions)
- **Found a bug** - Open an [Issue](https://github.com/ShinyaYoshida-biomet/Re-prod/issues)
- **Feature idea** - Open an issue and tag [@ShinyaYoshida-biomet](https://github.com/ShinyaYoshida-biomet)

## Community Guidelines

- **Be respectful** - Treat everyone with kindness
- **Be constructive** - Provide helpful feedback
- **Be patient** - Reviews may take time
- **Be collaborative** - We are building this together

## License

By contributing to Re-prod, you agree that your contributions will be licensed under the same license as the project (see [LICENSE](./LICENSE)).

---

Thank you for contributing to Re-prod.

Every contribution, no matter how small, helps make Re-prod better for the R research community.
