# Re-prod Project Context for Gemini CLI

## Project Overview
Re-prod is a reproducible research platform with:
- **Frontend**: React + TypeScript (client/)
- **Backend**: Rust + Tauri (desktop/, core/)
- **AI Assistant**: Custom AI-powered code suggestions

## Allowed Commands (Project-Level)

### Git Operations
- Read-only: `git status`, `git log`, `git diff`, `git branch`
- Write operations: `git add`, `git commit`, `git push` (no --force)
- Worktree management: `git worktree add/remove/list`

### Development Commands
- **Frontend**: `pnpm install`, `pnpm build`, `pnpm test`, `pnpm tsc`
- **Backend**: `cargo check`, `cargo build`, `cargo test`
- **GitHub**: `gh issue`, `gh pr`, `gh repo`

## Custom Slash Commands Available

Use these custom commands for common workflows:

- `/daily-report` - Generate daily work summary from git commits
- `/next-issue-number` - Get next available GitHub issue number
- `/create-issue-synced "<title>" "<labels>" "<priority>" "<difficulty>" "<time>"` - Create synced GitHub issue
- `/create-pr <issue> <title> [base]` - Create pull request
- `/verify-fullstack [path]` - Run all tests and builds
- `/verify-frontend [path]` - Frontend verification only
- `/verify-backend [path]` - Backend verification only

## 🎯 Intent Matching Rules

**IMPORTANT**: When the user's request matches any pattern below, you MUST proactively suggest or use the corresponding slash command. Do not implement the task manually - always recommend the custom command first.

### Daily Reporting & Git History
**User says:** "what did I do today" | "daily report" | "today's work" | "show my commits" | "work summary"
**→ Action:** Use `/daily-report`

### Issue Management
**User says:** "create an issue" | "file a bug" | "track this" | "make a GitHub issue" | "add to issues"
**→ Action:** First check if they provided details, then use `/create-issue-synced "<title>" "<labels>" "<priority>" "<difficulty>" "<time>"`
**→ Example:** `/create-issue-synced "Fix auth bug" "bug,security" "P1" "⭐⭐" "3-4 hours"`

**User says:** "what's the next issue number" | "next issue" | "what issue number should I use"
**→ Action:** Use `/next-issue-number`

### Pull Requests
**User says:** "create a PR" | "make a pull request" | "open a PR" | "submit for review"
**→ Action:** Use `/create-pr <issue-number> <title> [base-branch]`
**→ Example:** `/create-pr 96 "fix AI response drift" develop`

### Testing & Verification
**User says:** "run tests" | "verify everything" | "test the build" | "make sure it works" | "run all checks"
**→ Action:** Use `/verify-fullstack`

**User says:** "test frontend" | "check client" | "verify React app" | "frontend tests"
**→ Action:** Use `/verify-frontend`

**User says:** "test backend" | "check Rust code" | "cargo test" | "backend tests"
**→ Action:** Use `/verify-backend`

## 💡 Command Suggestion Guidelines

1. **Always suggest the command BEFORE implementing manually**
   - ❌ Bad: Run `git log` and format output yourself
   - ✅ Good: "I recommend using `/daily-report` for this. Would you like me to run it?"

2. **Explain what the command does**
   ```
   For your daily report, use the `/daily-report` command:

   /daily-report

   This will automatically:
   - Get today's commits
   - Group related changes
   - Prioritize by importance
   - Format in the standard bullet point style
   ```

3. **Provide the exact command syntax with filled parameters**
   ```
   To create this issue, use:

   /create-issue-synced "Fix authentication timeout" "bug,security,p1" "P1" "⭐⭐" "3-4 hours"
   ```

4. **If user provides partial info, ask for missing parameters**
   ```
   I can help create an issue. Please provide:
   - Title: [what you told me]
   - Labels: [suggest based on context]
   - Priority (P0/P1/P2): [ask if unclear]
   - Difficulty (⭐/⭐⭐/⭐⭐⭐): [ask if unclear]
   - Time estimate: [ask if unclear]

   Then I'll format the /create-issue-synced command for you.
   ```

5. **After suggesting, wait for confirmation before proceeding**
   - Don't auto-execute unless user explicitly confirms
   - Show the command they should run
   - Explain the expected outcome

## Code Style Guidelines

### Commits
- **NEVER** use `git add -A` or `git add .` - Always stage files explicitly
- **NEVER** add "Co-Authored-By: Claude" to commits
- Follow Conventional Commits format

### Issue Management
- Issues tracked in `docs/.obsidian/issues/`
- Synchronized with GitHub issues
- Priority: P0 (Demo Critical), P1 (Demo Plus-One), P2 (Post-Demo)

### Pull Requests
- Always reference issue: `Closes #NNN`
- Include test plan with markdown checklist
- Add footer: "🤖 Generated with [Claude Code](https://claude.com/claude-code)"

## MCP Servers Configured

- **@serena** - Code analysis and symbol management (use for semantic code operations)
- **@github** - GitHub integration (configured via Copilot)

## File Structure

```
Re-prod/
├── client/          # React frontend
├── desktop/         # Tauri desktop app
├── core/            # Rust core logic
├── docs/            # Documentation and issue tracking
├── .claude/         # Claude Code configuration
├── .gemini/         # Gemini CLI configuration (this file)
└── scripts/         # Build and automation scripts
```

## Important Notes

- Always verify changes with `/verify-fullstack` before creating PRs
- Use Serena MCP for semantic code operations (symbol search, refactoring)
- Check existing patterns before implementing new features
- Maintain test coverage for all changes
