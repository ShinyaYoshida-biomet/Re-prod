# Contributing to Re-prod

Thank you for your interest in contributing to Re-prod. We welcome contributions from the community.

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

### 2. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-number-description
```

### 3. Make Your Changes

- Write clean, readable code
- Follow existing code style and patterns
- Add comments for complex logic

### 4. Write Tests

**Unit tests and CI/CD must pass before merging.**

```bash
# Frontend tests
pnpm --filter client test

# Backend tests
cd core && cargo test
```

### 5. Run Checks Locally

```bash
# TypeScript lint
pnpm --filter client run lint

# Rust formatting
cargo fmt --check

# Rust linting
cargo clippy

# Build check
pnpm --filter client run build
cargo build
```

### 6. Commit Your Changes

```bash
git add <files>
git commit -m "feat: add feature X for issue #123"
# or
git commit -m "fix: resolve bug in Y for issue #456"
```

**Commit message format:**

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation
- `test:` for test changes
- `refactor:` for code refactoring

### 7. Push and Create PR

```bash
git push origin feat/your-feature-name
```

Then open a Pull Request on GitHub following PR template located in `.github` dir.

## Pull Request Requirements

Before your PR can be merged:

1. **All unit tests pass**
2. **CI/CD pipeline passes**
3. **Code follows project conventions**
4. **Addresses an existing issue** (or was pre-approved)
5. **Includes test coverage** for new features/fixes
6. **Documentation updated** (if needed)

## Code Style

### TypeScript/React

- Use functional components with hooks
- Prefer `const` over `let`
- Use TypeScript types (avoid `any`)
- Follow existing file structure

### Rust

- Run `cargo fmt` before committing
- Address `cargo clippy` warnings
- Write idiomatic Rust
- Add documentation comments for public APIs

## Testing Guidelines

- **Backend**: Add unit tests in `core/src/**/*_test.rs` or `#[cfg(test)]` modules
- **Frontend**: Add tests in `client/src/**/*.test.ts` or `client/src/**/__tests__/`
- **Integration**: End-to-end tests in `client/src/**/*.integration.test.ts`

## Git Hooks

We use [Husky](https://typicode.github.io/husky/) to manage git hooks. Hooks are automatically installed when you run `pnpm install`.

Pre-push hooks check:

- Rust formatting (`cargo fmt --check`)
- Rust linting (`cargo clippy`)
- TypeScript linting (`pnpm run lint`)

To bypass hooks (not recommended): `git push --no-verify`

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
