# Re-prod

---

<p align="center">
[English](README.md) | [Japanese](README.ja.md)
</p>

AI-Powered R Analysis IDE - A modern, AI-native alternative to RStudio.

<https://private-user-images.githubusercontent.com/33049408/530954930-95408ef3-14a7-4dec-9cf2-f77598166418.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NjcwOTI0NDgsIm5iZiI6MTc2NzA5MjE0OCwicGF0aCI6Ii8zMzA0OTQwOC81MzA5NTQ5MzAtOTU0MDhlZjMtMTRhNy00ZGVjLTljZjItZjc3NTk4MTY2NDE4LnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNTEyMzAlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjUxMjMwVDEwNTU0OFomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPWE5NjI5NDRjOTljMzliN2FkZDRjZTdkZmQ5ZmRkNGRkN2JlYWM5NDE5NDE5ODc1MzFmMzBjOTY0NTk1MWUxNDgmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0In0.JEjhasFCUhM05dKKykFK9c1TXrpXEU-ENlDCvSxO31g>

## Mission

R is powerful, but reproducibility breaks often, environments drift,
and researchers end up fixing tools instead of focusing on scientific ideas.
This inefficiency represents a significant opportunity cost for the scientific community whether you're a biologist, statistician, or data scientist.

Re-prod transforms **R and sparse tools into natural language**, letting AI handle the complexity while you focus on insights.

Furthermore unlike traditional IDEs, Re-prod **will ensurereproducibility** through complete execution history.
We're building toward a future where R analysis is accessible, reproducible, and efficient for everyone.

---

## Architecture

Re-prod is a cross-platform IDE for R and scientific analysis, built as a Rust–Tauri workspace with a React front end.

### Backend

- `core/` holds the Rust logic for orchestrating R execution, timeline tracking, and AI prompt management.
- `desktop/` packages the Rust core into a Tauri shell so the desktop build exposes native menus, commands, and a bundled frontend.
- `server/` provides an optional Axum-based HTTP + WebSocket API that powers the browser experience when you run `pnpm dev`. It is not bundled in the desktop artifacts but is maintained so the web UI can mirror the desktop feature set.

### Frontend

- `client/` is a React + TypeScript + Vite application that renders a Monaco-powered editor, and other panes. All TypeScript types are located in `client/src/types/`, with protocol types auto-generated from Rust via ts-rs.
- `shared/` exports TypeScript types and constants shared across the client, server, and scripts.

## Prerequisites

- **Rust** (latest stable) - Install from [rustup.rs](https://rustup.rs/)
- **Node.js** 18+
- **pnpm** 9+ (installs via `corepack enable pnpm` or `npm install -g pnpm`)
- **R** (4.0+) with `Rscript` in PATH
- **AI API key** (optional, for AI features) - Anthropic or OpenAI
- **Writable workspace**: the project root must be writable so `.reprod/` can store timeline/plot artifacts, and the OS temp dir (e.g., `/tmp/reprod`) must be writable for execution scratch files.

### Quick Setup with mise (Recommended)

For the easiest setup experience, we recommend using [mise](https://mise.jdx.dev/) to automatically manage Rust, Node.js, and pnpm versions:

```bash
# Install mise (macOS/Linux)
curl https://mise.run | sh

# Or via Homebrew
brew install mise

# Navigate to the project directory
cd re-prod

# Automatically install all required tools
mise install
```

The `.mise.toml` file in the project root ensures all contributors use consistent runtime versions, reducing environment-related issues.

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

## Project Structure

```
Re-prod/
├── Cargo.toml                 # Rust workspace root (core + desktop + server)
├── core/                      # Platform-agnostic Rust business logic
├── desktop/                   # Tauri desktop shell + commands
├── server/                    # Axum HTTP/WebSocket API
├── client/                    # React + TypeScript web frontend
│   └── src/types/             # TypeScript types (auto-generated from Rust via ts-rs)
├── AGENTS.md                  # AI agent coordination guide
└── package.json               # pnpm workspace config + scripts
```

## Usage

1. **Open Re-prod** in a browser (or the bundled Tauri window) so the workspace renders.
2. **Write R code** in the Monaco editor located in the upper-left part of the canvas.
3. **Execute selections or cells** via the "▶ Run" button or keyboard shortcuts.
4. **Monitor output** in the Console tab inside the consolidated bottom pane.
5. **Visualize results** in the Plots tab of the bottom pane.
6. **Chat with AI** from the right-hand assistant panel for guidance or code generation.

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

### Code Statistics

View lines of code (LOC) statistics using [Tokei](https://github.com/XAMPPRocky/tokei):

**Install Tokei:**

```bash
# macOS
brew install tokei

# Linux/macOS (via cargo)
cargo install tokei

# Or download pre-built binaries from:
# https://github.com/XAMPPRocky/tokei/releases
```

**Run LOC count:**

```bash
# Show detailed statistics
pnpm loc

# Output as JSON (for scripting)
pnpm loc:json
```

**Note:** Tokei must be installed separately and is not included as a dependency. It's used for development metrics only and does not affect production builds.

### Clean Temporary Files

Temporary R plots and scripts are stored in `server/temp/`.
They are automatically cleaned up hourly, but you can manually delete them:

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

Before submitting changes, follow the contribution guidance in [CONTRIBUTING.md](./CONTRIBUTING.md).

日本語版は [CONTRIBUTING.ja.md](./CONTRIBUTING.ja.md) をご覧ください。

## License

MIT

## Acknowledgments

- Inspired by RStudio's excellent UI/UX
- Built with Rust (Tauri, Axum), React, TypeScript, and Monaco Editor
