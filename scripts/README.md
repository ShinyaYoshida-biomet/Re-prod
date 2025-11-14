# Re-prod Scripts

This directory contains utility scripts for repository setup and maintenance.

## Branch Protection Setup

### `setup-branch-protection.sh`

Configures GitHub branch protection rules for `main` and `develop` branches using `gh` CLI.

**Prerequisites:**
- Install GitHub CLI: `brew install gh` (macOS) or see [gh installation](https://cli.github.com/)
- Authenticate: `gh auth login`

**What it configures:**
- Require pull request before merging (1 approval required)
- Dismiss stale PR approvals when new commits are pushed
- Require status checks to pass before merging
  - Status check: `quick-checks` (from `.github/workflows/ci.yml`)
  - Branches must be up to date before merging
- Require conversation resolution before merging
- Enforce rules for administrators
- Block force pushes and branch deletions

**Usage:**
```bash
bash scripts/setup-branch-protection.sh
```

**Note:** You need repository admin permissions to run this script.

## Git Hooks Configuration

We use [Husky](https://typicode.github.io/husky/) to manage git hooks. Hooks are automatically installed when you run `pnpm install`.

**Pre-push hook checks:**
- Rust formatting: `cargo fmt --check`
- Rust linting: `cargo clippy`
- TypeScript linting: `pnpm run lint`

**Hook files location:** `.husky/pre-push`

**To bypass hooks (not recommended):**
```bash
git push --no-verify
```
