# Repository Guidelines

## Project Structure & Module Organization
- `core/` holds the Rust backend for AI orchestration, data management, and CLI helpers; public APIs live under `core/src`, with tests in `core/tests` and tool helpers in `core/tools`.
- `client/` is the React + Monaco front end, including `client/src/components`, `services`, and `store`; shared assets and stores live behind the `@shared/*` path mapped to `shared/src/*`.
- `server/` keeps the Express/socket layer powering R execution alongside `watchers` and `temp` output staging; `shared/` bundles TypeScript-only contracts used by both client and server.
- `desktop/` combines the Tauri shell and `desktop/e2e` for integration flows, while `docs/` explains architecture, UI flow, and concept notes.
- Runtime logs go into `logs/`, temporary R artifacts under `temp/` or `execution_history.Rmd`, and configuration files match `.env*` (never commit secrets; these paths are ignored by default).

## Build, Test, and Development Commands
- `pnpm install` — bootstraps all workspaces (client, shared, desktop) and sets up Husky hooks.
- `pnpm dev` — runs the Rust server (`cargo run -p reprod-server`) alongside the Vite-based client (`pnpm --filter client dev`) for full-stack local work.
- `pnpm dev:client` — spins up just the React UI when backend work is not required.
- `pnpm build`, `pnpm --filter client build`, and `cargo build` — production builds for each layer; run them before release branches.
- `cargo fmt --check --manifest-path core/Cargo.toml`, `cargo clippy --manifest-path core/Cargo.toml --lib --all-features`, and `pnpm run lint` — these mirror the Husky pre-push checks and should pass before pushing.
- `pnpm --filter client test` and `cargo test` — run TypeScript unit suites and Rust tests, respectively.

## Coding Style & Naming Conventions
- **TypeScript/React**: favor functional components with hooks, `const` over `let`, explicit types (avoid `any`), and `camelCase` for props/state. Use the `@shared/*` aliases defined in `tsconfig.json`, keep formatting consistent with `tsc --noEmit`, and rely on `pnpm run lint` to catch unused bindings.
- **Rust**: stick to idiomatic `snake_case`, document public items, and keep modules under `core/src`. Run `cargo fmt` and `cargo clippy` regularly; treat Clippy errors as blockers even if warnings are allowed.

## Testing Guidelines
- Frontend tests live near their targets (`client/src/**/*.test.ts`, `client/src/**/__tests__`, `client/src/**/*.integration.test.ts`). Use `pnpm --filter client test` for the suite and rerun before PRs.
- Backend tests reside alongside modules in `core/src` and `core/tests` (with `*_test.rs` naming). Run `cargo test` after Rust changes and before pushing.
- CI enforces full test runs; document any skipped or long-running suites in the PR description.

## Commit & Pull Request Guidelines
- Adopt conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:` followed by a short description and optional `(#issue)` when applicable.
- Every PR should explain what changed, why it matters, how it was implemented, and what tests were run; link to the tracked issue or discussion and include screenshots when UI behavior changes.
- Husky’s pre-push hook enforces formatting/linting; fix the reported issues locally rather than bypassing with `git push --no-verify`.

## Husky Hooks & Configuration Tips
- Husky auto-installs once `pnpm install` completes; the pre-push hook runs `cargo fmt --check`, `cargo clippy`, and `pnpm run lint`.
- Keep `.env*`, `.Rhistory`, generated `temp/` files, and `logs/` out of commits; these are mentioned in `.gitignore` and ensure clean project diffs.
