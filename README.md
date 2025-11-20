[English](README.md) | [Japanese](README.ja.md)

---

# Re-prod

AI-Powered R Analysis IDE - A modern, AI-native alternative to RStudio.

## Mission

Data analysts and researchers shouldn't need to spend half a day reading R package documentation or juggling fragmented tools just to perform analysis. 
This inefficiency represents a significant opportunity cost for the scientific community whether you're a biologist, statistician, or data scientist.

Re-prod transforms **R and sparse tools into natural language**, letting AI handle the complexity while you focus on insights.

Furthermore unlike traditional IDEs, Re-prod **will ensure perfect reproducibility** through complete execution history and **will provide an end-to-end platform** that eliminates constant context-switching. We're building toward a future where R analysis is accessible, reproducible, and efficient for everyone.

---

## Architecture

Re-prod is a multi-package workspace that blends Rust, Tauri, and React/TypeScript to deliver a cross-platform R analysis IDE.

### Backend

- `core/` holds the Rust logic for orchestrating R execution, timeline tracking, and AI prompt management.
- `desktop/` packages the Rust core into a Tauri shell so the desktop build exposes native menus, commands, and a bundled frontend.
- `server/` provides an optional Axum-based HTTP + WebSocket API that powers the browser experience when you run `pnpm dev`. It is not bundled in the desktop artifacts but is maintained so the web UI can mirror the desktop feature set.

### Frontend

- `client/` is a React + TypeScript + Vite application that renders a Monaco-powered editor, a consolidated bottom pane (console, timelines, etc.), and the AI assistant.
- `shared/` exports TypeScript types and constants shared across the client, server, and scripts.
- `scripts/` supports onboarding, tooling helpers, and git hooks.

## Prerequisites

- **Rust** (latest stable) - Install from [rustup.rs](https://rustup.rs/)
- **Node.js** 18+
- **pnpm** 9+ (installs via `corepack enable pnpm` or `npm install -g pnpm`)
- **R** (4.0+) with `Rscript` in PATH
- **AI API key** (optional, for AI features) - Anthropic or OpenAI

## Installation

### 1. Install Rust (if not already installed)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 2. Install Tauri CLI

```bash
cargo install tauri-cli --version "^2.0"
```

### 3. Install JavaScript dependencies (pnpm)

```bash
pnpm install
```

### 4. Configure Application (Optional)

Create `~/.reprod/auth.json` for AI features:

```bash
mkdir -p ~/.reprod
cat > ~/.reprod/auth.json << 'EOF'
{
  "anthropic_api_key": "sk-ant-...",
  "openai_api_key": "sk-proj-...",
  "r_path": "Rscript"
}
EOF
```

You can configure either or both AI providers. At least one API key is required for AI features.

## Running the Application

### Option 1: Desktop App (Recommended)

```bash
cd desktop
cargo tauri dev
```

This launches the Tauri desktop application with:
- Native desktop window
- Automatic frontend startup
- Rust backend built-in

### Option 2: Web Version

```bash
pnpm dev
```

The root script runs the Axum + WebSocket API (`reprod-server`) alongside the Vite client so you can work entirely in the browser:
- **Axum server**: `http://localhost:3001`
- **React client**: `http://localhost:5173`

Visit `http://localhost:5173` after both services are ready.

### Option 3: Frontend Only

```bash
pnpm --filter client dev
```

Runs the Vite dev server (at `http://localhost:5173`) without starting an R backend or Axum API.

## Project Structure

```
Re-prod/
├── Cargo.toml                 # Rust workspace root (core + desktop + server)
├── core/                      # Platform-agnostic Rust business logic
├── desktop/                   # Tauri desktop shell + commands
├── server/                    # Axum HTTP/WebSocket API
├── client/                    # React + TypeScript web frontend
├── shared/                    # Shared TypeScript metadata
├── scripts/                   # Setup helpers and git hooks
├── AGENTS.md                  # AI agent coordination guide
└── package.json               # pnpm workspace config + scripts
```

## Project Management

Re-prod ships with a lightweight project system modelled after RStudio Projects. Each project is just a directory with a `.reprod/config.json` file (created automatically when you add or open the folder). The desktop/server layer keeps a registry at `~/.reprod/projects.json` so you can hop between analyses without reconfiguring paths.

- **Switching projects** – Use `File → Projects…` to open the manager. Selecting a project persists the current workspace, resets the R session, and reloads the timeline scoped to that directory.
- **Creating projects** – From the same dialog you can create a new directory, register an existing folder, or clone a Git repository. The `.reprod` metadata folder (config + timeline) is initialized for you.
- **Per-project state** – Editor contents, execution history, AI transcript, settings, and pane layout are snapshotted on every switch. When you reopen a project, Re-prod restores exactly where you left off (including the working directory for R executions).

## Usage

1. **Open Re-prod** in a browser (or the bundled Tauri window) so the workspace renders.
2. **Write R code** in the Monaco editor located in the upper-left part of the canvas.
3. **Execute selections or cells** via the "▶ Run" button or keyboard shortcuts.
4. **Monitor output** in the Console tab inside the consolidated bottom pane.
5. **Review history** in the Timeline tab to replay or rerun executions.
6. **Visualize results** in the Plots tab of the bottom pane.
7. **Chat with AI** from the right-hand assistant panel for guidance or code generation.

### Layout Overview

- **Left column**: Split vertically between the editor (top) and the bottom pane (console, timeline, plots, draft exports, etc.).
- **Bottom pane tabs**: Switch between Console, Timeline, Plots, and other context-aware tabs without leaving the workspace.
- **Right column**: The full-height AI Assistant panel provides autocomplete, suggestions, and chat interactions while staying visible alongside the editor.
- **Resizing**: Drag the divider handles to adjust how much screen real estate each pane consumes.

### AI Assistant

The AI assistant supports multiple AI providers for intelligent R programming assistance:

**Supported Providers:**
- **Anthropic Claude** (claude-sonnet-4-5) - Strong R programming knowledge
- **OpenAI GPT** (gpt-4, gpt-4-turbo) - Versatile code generation and debugging

**Configuration:**

API keys can be configured in two ways:

1. **Configuration file** (Recommended):
```bash
~/.reprod/auth.json
{
  "anthropic_api_key": "sk-ant-...",
  "openai_api_key": "sk-proj-...",
  "r_path": "Rscript"
}
```

2. **Environment variables** (Fallback):
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-proj-..."
```

### Keyboard Shortcuts

- `Cmd/Ctrl + Enter`: Run current cell/section
- `Shift + Enter`: Run current cell and move to next
- `Cmd/Ctrl + Shift + Enter`: Run all code

### R Path

If `Rscript` is not in your PATH, set the full path in `~/.reprod/auth.json`:

```json
{
  "anthropic_api_key": null,
  "openai_api_key": null,
  "r_path": "/usr/local/bin/Rscript"
}
```

## Development

### Type Checking

```bash
pnpm -r lint
```

### Building for Production

```bash
pnpm -r build
```

### Clean Temporary Files

Temporary R plots and scripts are stored in `server/temp/`. They are automatically cleaned up hourly, but you can manually delete them:

```bash
rm -rf server/temp/*
```

## Troubleshooting

### R not found
```
Error: Failed to start R process
```

**Solution**: Ensure R is installed and `Rscript` is in PATH, or set `R_PATH` in `.env`

### WebSocket connection failed
```
Socket connection error
```

**Solution**:
1. Ensure backend is running on port 3001
2. Check that no other service is using port 3001 (`lsof -i :3001`)
3. Verify frontend is connecting to `ws://localhost:3001/ws`
4. Check browser console for connection errors

### AI not responding

**Solution**:
1. Verify API keys are set in `~/.reprod/auth.json` or as environment variables
   - Anthropic: `anthropic_api_key` or `ANTHROPIC_API_KEY`
   - OpenAI: `openai_api_key` or `OPENAI_API_KEY`
2. Check server/desktop logs for API errors
3. Ensure you have API credits for your chosen provider
4. Verify API key format:
   - Anthropic: `sk-ant-...`
- OpenAI: `sk-proj-...` or `sk-...`

## Contributing

Before submitting changes, follow the contribution guidance in [CONTRIBUTING.md](./CONTRIBUTING.md). 日本語版は [CONTRIBUTING.ja.md](./CONTRIBUTING.ja.md) をご覧ください。

## License

MIT

## Acknowledgments

- Inspired by RStudio's excellent UI/UX
- Built with Rust (Tauri, Axum), React, TypeScript, and Monaco Editor
