# Desktop E2E Tests

End-to-end test suite for the Re-prod application using **Playwright** (primary) and **WebDriverIO** (desktop validation).

## 🎯 Hybrid Testing Strategy

This test suite uses a **hybrid approach** to maximize coverage and developer productivity:

### Playwright Tests (Primary - All Platforms ✅)
- **Location**: `tests/` directory
- **Target**: Web browser (Chromium)
- **Platforms**: macOS, Linux, Windows
- **Use Case**: Daily development, fast feedback, CI on all PRs
- **Benefits**: Works everywhere, fast, great debugging tools

### WebDriverIO Tests (Desktop Validation - Linux/Windows only)
- **Location**: `webdriver-specs/` directory
- **Target**: Tauri desktop application
- **Platforms**: Linux, Windows only (macOS NOT supported)
- **Use Case**: Final integration testing on develop→main PRs
- **Benefits**: Tests actual desktop app behavior

## Test Coverage

Both test suites cover the same core workflows:

- ✅ **R Code Execution** - Basic R code execution and output verification
- ✅ **Timeline Feature** - Execution history, filtering, and statistics
- ✅ **Export Functionality** - Export dialog, format selection, and options
- ✅ **Error Handling** - Syntax errors, runtime errors, and error recovery
- ✅ **Full Workflows** - Complete user journeys from code to export

## ⚠️ Platform Support

**IMPORTANT**: `tauri-driver` (the WebDriver tool for Tauri apps) **only supports Windows and Linux**. macOS is NOT supported because there is no WKWebView driver available.

- ✅ **Linux**: Full support (recommended for CI/CD)
- ✅ **Windows**: Full support
- ❌ **macOS**: NOT supported (neither Intel nor Apple Silicon)

**For macOS developers**:
- **Option 1 (Recommended)**: Push changes and let CI run E2E tests on Linux
- **Option 2**: Run tests in a Linux Docker container or VM
- **Option 3**: Use a Linux cloud development environment

See the [Running on macOS (Docker)](#running-on-macos-docker) section below for Docker instructions.

## Prerequisites

### Required Software

1. **Node.js & pnpm**
   - Node.js 18+ ([Download](https://nodejs.org/))
   - pnpm >=9 (`corepack enable pnpm`)

2. **Rust & Cargo**
   - Install from [rustup.rs](https://rustup.rs/)

3. **tauri-driver** (Linux/Windows only)
   ```bash
   cargo install tauri-driver
   ```

4. **R Environment**
   - **Linux (Ubuntu/Debian)**: `sudo apt-get install r-base`
   - **Windows**: Download from [CRAN](https://cran.r-project.org/bin/windows/base/)
   - Verify: `R --version` (should be >=4.3)

5. **Platform-specific dependencies**

   **Linux (Ubuntu/Debian)**:
   ```bash
   sudo apt-get update
   sudo apt-get install -y \
     libwebkit2gtk-4.1-dev \
     libgtk-3-dev \
     libayatana-appindicator3-dev \
     librsvg2-dev \
     patchelf
   ```

   **Windows**:
   - Microsoft Visual C++ Build Tools
   - WebView2 Runtime (usually pre-installed on Windows 10/11)

## Running Tests Locally

### Quick Start - Playwright (Recommended for All Platforms)

**Works on macOS, Linux, and Windows!**

From the repository root:

```bash
# 1. Install all dependencies (if not already done)
pnpm install

# 2. Run Playwright E2E tests
pnpm --filter @reprod/e2e test

# OR with UI mode (great for debugging)
pnpm --filter @reprod/e2e test:playwright:ui

# OR in headed mode (see the browser)
pnpm --filter @reprod/e2e test:playwright:headed
```

The Playwright tests automatically start the development server for you!

### WebDriverIO Tests (Linux/Windows Only)

For desktop app testing (NOT supported on macOS):

```bash
# 1. Install all dependencies
pnpm install

# 2. Build the Tauri app in debug mode
pnpm tauri build --debug

# 3. Run WebDriverIO E2E tests
pnpm --filter @reprod/e2e test:webdriver
```

### Running Specific Tests

**Playwright:**

```bash
# Run only R execution tests
pnpm --filter @reprod/e2e test r-execution

# Run only Timeline tests
pnpm --filter @reprod/e2e test timeline

# Run only Export tests
pnpm --filter @reprod/e2e test export

# Run only Error handling tests
pnpm --filter @reprod/e2e test error-handling

# Run only Full workflow tests
pnpm --filter @reprod/e2e test full-workflow

# Run specific test file
pnpm --filter @reprod/e2e test tests/r-execution.spec.ts
```

**WebDriverIO (Linux/Windows):**

```bash
# Run only R execution tests
pnpm --filter @reprod/e2e test:webdriver -- --spec ./webdriver-specs/r-execution.e2e.ts

# Run only Timeline tests
pnpm --filter @reprod/e2e test:webdriver -- --spec ./webdriver-specs/timeline.e2e.ts

# Other WebDriverIO tests follow same pattern...
```

### Debug Mode

**Playwright:**

```bash
# Interactive debug mode with Playwright Inspector
pnpm --filter @reprod/e2e test:playwright:debug

# UI mode (best for debugging)
pnpm --filter @reprod/e2e test:playwright:ui

# Headed mode (see browser actions)
pnpm --filter @reprod/e2e test:playwright:headed
```

**WebDriverIO:**

```bash
# Run with verbose logging
LOG_LEVEL=debug pnpm --filter @reprod/e2e test:webdriver

# Run with debugging enabled
pnpm --filter @reprod/e2e test:webdriver:debug
```

## Test Structure

```
desktop/e2e/
├── tests/                      # Playwright tests (All platforms)
│   ├── r-execution.spec.ts    # Basic R code execution
│   ├── timeline.spec.ts       # Timeline feature tests
│   ├── export.spec.ts         # Export dialog and functionality
│   ├── error-handling.spec.ts # Error scenarios and recovery
│   └── full-workflow.spec.ts  # Complete user workflows
├── webdriver-specs/           # WebDriverIO tests (Linux/Windows)
│   ├── r-execution.e2e.ts    # Basic R code execution
│   ├── timeline.e2e.ts       # Timeline feature tests
│   ├── export.e2e.ts         # Export dialog and functionality
│   ├── error-handling.e2e.ts # Error scenarios and recovery
│   └── full-workflow.e2e.ts  # Complete user workflows
├── shared/                    # Shared helpers and selectors
│   ├── selectors.ts          # Common DOM selectors
│   └── helpers.ts            # Common test actions
├── playwright.config.ts       # Playwright configuration
├── wdio.conf.ts              # WebDriverIO configuration
├── package.json              # Test dependencies
├── tsconfig.json             # TypeScript config
└── README.md                 # This file
```

## Test Coverage

### 1. R Execution Tests (`r-execution.e2e.ts`)

Tests basic R code execution flow:
- Editor interaction (typing, selecting code)
- Run button functionality
- Console output verification
- Output formatting

**Example test**:
```typescript
it('runs a simple expression and shows the result', async () => {
  // Type code in editor
  // Click Run button
  // Verify output in console
});
```

### 2. Timeline Tests (`timeline.e2e.ts`)

Tests execution history tracking:
- Opening timeline dialog
- Displaying execution events
- Event filtering by type
- Timeline statistics display
- Navigating to code from timeline event

**Key scenarios**:
- After code execution, timeline shows new event
- Filter events by execution type
- Click event to navigate to code location

### 3. Export Tests (`export.e2e.ts`)

Tests export functionality:
- Opening export dialog
- Format selection (Bundle, RMarkdown, Both)
- Mode selection (Standalone, Linked)
- Export options configuration
- Form validation
- Error handling for invalid inputs

**Key scenarios**:
- Select different export formats
- Configure export options
- Validate required fields

### 4. Error Handling Tests (`error-handling.e2e.ts`)

Tests how the app handles various errors:
- R syntax errors (incomplete expressions)
- Runtime errors (type mismatches, undefined functions)
- Parse errors (malformed code)
- Error display in console (stderr styling)
- Error recovery (executing valid code after error)

**Key scenarios**:
- Invalid R syntax shows error in console
- App remains functional after errors
- Subsequent valid code executes successfully

### 5. Full Workflow Tests (`full-workflow.e2e.ts`)

Tests complete end-to-end user journeys:
- Write code → Execute → View output → Check timeline → Open export
- Multi-step data analysis workflow
- Workflow with errors and recovery
- Multiple code block executions

**Example workflow**:
1. Launch app
2. Write data analysis code
3. Execute and verify output
4. Check timeline for execution history
5. Open export dialog and configure
6. Execute additional code
7. Verify timeline updates
8. Confirm app remains responsive

## Environment Variables

Customize test execution with these environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `TAURI_DRIVER_APP` | Path to Tauri binary | `../target/debug/reprod-desktop` |
| `TAURI_DRIVER_EXECUTABLE` | Command to start driver | `tauri-driver` |
| `TAURI_DRIVER_HOST` | WebDriver endpoint host | `127.0.0.1` |
| `TAURI_DRIVER_PORT` | WebDriver endpoint port | `9515` |
| `TAURI_DRIVER_PATH` | WebDriver endpoint path | `/` |
| `TAURI_DRIVER_READY_TIMEOUT` | Driver startup timeout (ms) | `15000` |
| `TAURI_DRIVER_ARGS` | Additional driver arguments | `--port 9515 --binary <path>` |
| `TAURI_DRIVER_TAURI_OPTIONS` | JSON options for driver | `{}` |
| `LOG_LEVEL` | Logging verbosity | `info` |

**Example**:
```bash
# Use custom binary path
TAURI_DRIVER_APP=/path/to/custom/binary pnpm --filter @reprod/e2e test

# Increase timeout for slow systems
TAURI_DRIVER_READY_TIMEOUT=30000 pnpm --filter @reprod/e2e test
```

## CI/CD Integration

### GitHub Actions

E2E tests run automatically in CI but **only for develop → main PRs** to optimize CI time.

**CI Configuration** (`.github/workflows/ci.yml`):

```yaml
e2e-tests:
  # Only run on develop → main PRs
  if: github.base_ref == 'main' && github.event_name == 'pull_request'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    # Setup R environment
    - uses: r-lib/actions/setup-r@v2
      with:
        r-version: "4.3.0"

    # Setup Node and Rust
    - uses: pnpm/action-setup@v2
    - uses: dtolnay/rust-toolchain@stable

    # Install Tauri dependencies + Xvfb
    - name: Install dependencies
      run: |
        sudo apt-get update
        sudo apt-get install -y libwebkit2gtk-4.1-dev xvfb

    - run: pnpm install
    - run: pnpm tauri build --debug
    - run: cargo install tauri-driver

    # Run E2E tests with Xvfb (headless)
    - name: Run E2E tests
      run: xvfb-run --auto-servernum pnpm --filter @reprod/e2e test
```

### When E2E Tests Run

| Branch Flow | Event | Quick Checks | E2E Tests |
|-------------|-------|--------------|-----------|
| feature → develop | PR | ✅ (3-5 min) | ❌ |
| develop | push | ✅ (3-5 min) | ❌ |
| **develop → main** | **PR** | ✅ | ✅ **(15-20 min)** |
| main | push | ✅ (3-5 min) | ✅ (15-20 min) |

**Rationale**: Feature development needs fast feedback. Full E2E validation happens at the final quality gate (production branch).

### CI Strategy

**Feature → Develop PRs:**
- ✅ Playwright tests (fast, all platforms)
- ❌ WebDriverIO tests skipped (saves CI time)

**Develop → Main PRs:**
- ✅ Playwright tests (web browser validation)
- ✅ WebDriverIO tests (desktop app validation on Linux)

### Before Creating develop → main PR

⚠️ **IMPORTANT**: Always run E2E tests before creating a PR from develop to main:

**All developers** - Run Playwright tests locally:

```bash
# 1. Run Playwright E2E suite (works on all platforms!)
pnpm --filter @reprod/e2e test

# 2. Verify all tests pass, then create PR
gh pr create --base main --head develop
```

**Linux/Windows developers** (Optional - can also run desktop tests):

```bash
# 1. Ensure R is installed
R --version

# 2. Build the Tauri app
pnpm tauri build --debug

# 3. Run WebDriverIO tests
pnpm --filter @reprod/e2e test:webdriver

# 4. Create PR
gh pr create --base main --head develop
```

## Troubleshooting

### Common Issues

**1. "tauri-driver is not supported on this platform" (macOS)**

```
Error: tauri-driver is not supported on this platform
```

**Cause**: tauri-driver does NOT support macOS (no WKWebView driver available).

**Solution**: Use one of these alternatives:
- Run tests via CI (GitHub Actions uses Linux)
- Use Docker to run tests in a Linux container (see [Running on macOS](#running-on-macos-docker))
- Use a Linux VM or cloud development environment

**2. "tauri-driver not found"** (Linux/Windows)

```bash
# Install tauri-driver
cargo install tauri-driver

# Verify installation
tauri-driver --version
```

**3. "App binary not found"**

```bash
# Rebuild the app
pnpm tauri build --debug

# Or specify custom path
TAURI_DRIVER_APP=/path/to/binary pnpm --filter @reprod/e2e test
```

**4. "R not found" errors**

```bash
# Verify R installation
R --version

# Linux (Ubuntu/Debian): Install R
sudo apt-get install r-base

# Windows: Download from CRAN
# https://cran.r-project.org/bin/windows/base/
```

**5. "Driver timeout" or "Driver not ready"**

```bash
# Increase timeout
TAURI_DRIVER_READY_TIMEOUT=30000 pnpm --filter @reprod/e2e test

# Check if port 9515 is already in use
lsof -i :9515
# Kill existing process if needed
kill -9 <PID>
```

**6. Tests fail on Linux (missing display)**

```bash
# Install Xvfb
sudo apt-get install xvfb

# Run with Xvfb
xvfb-run --auto-servernum pnpm --filter @reprod/e2e test
```

**7. GTK/WebKit errors on Linux**

```bash
# Install required dependencies
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev
```

### Debug Tips

1. **Check tauri-driver logs**
   - The config pipes driver stdout/stderr to console
   - Look for messages prefixed with `[tauri-driver]`

2. **Increase timeouts**
   ```typescript
   await element.waitForDisplayed({ timeout: 60000 }); // 60s instead of default
   ```

3. **Add explicit pauses**
   ```typescript
   await browser.pause(3000); // Wait 3 seconds
   ```

4. **Inspect the app manually**
   - Build and run the app: `pnpm tauri dev`
   - Verify UI elements and selectors exist
   - Use browser DevTools to inspect elements

5. **Check WebDriver status**
   ```bash
   # While tests are running, check driver status
   curl http://localhost:9515/status
   ```

## Running on macOS (Docker)

Since tauri-driver doesn't support macOS, you can run E2E tests in a Linux Docker container:

### Option 1: Using Docker (Manual)

**1. Create a Dockerfile for E2E testing:**

```dockerfile
FROM ubuntu:22.04

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    xvfb \
    r-base \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18+
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Enable pnpm
RUN corepack enable pnpm

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install tauri-driver
RUN cargo install tauri-driver

WORKDIR /workspace

# Entry point
CMD ["/bin/bash"]
```

**2. Build and run:**

```bash
# Build Docker image
docker build -t reprod-e2e .

# Run container with project mounted
docker run -it -v $(pwd):/workspace reprod-e2e

# Inside container:
pnpm install
pnpm tauri build --debug
xvfb-run --auto-servernum pnpm --filter @reprod/e2e test
```

### Option 2: Using GitHub CI (Recommended)

The simplest approach for macOS developers is to rely on CI:

1. Push your branch to GitHub
2. Create a draft PR targeting `develop` or `main`
3. Check the CI results to see if E2E tests pass
4. Make fixes if needed and push again

This is the recommended workflow for macOS developers since it requires no local Docker setup.

## Adding New Tests

### 1. Create a new spec file

```bash
touch desktop/e2e/specs/my-feature.e2e.ts
```

### 2. Write tests using WebDriverIO syntax

```typescript
import assert from 'node:assert';

describe('My Feature', () => {
  it('does something useful', async () => {
    // Find element
    const element = await browser.$('.my-selector');
    await element.waitForDisplayed({ timeout: 30000 });

    // Interact
    await element.click();
    await browser.keys('Some text');

    // Assert
    const text = await element.getText();
    assert.ok(text.includes('expected'), 'Should show expected text');
  });
});
```

### 3. Run your new tests

```bash
pnpm --filter @reprod/e2e test -- --spec ./specs/my-feature.e2e.ts
```

### Common Selectors

```typescript
// Editor
const editor = await browser.$('.monaco-editor textarea');

// Console output
const consoleOutput = await browser.$('.console-stdout');
const consoleError = await browser.$('.console-stderr');

// Buttons
const runButton = await browser.$('button[title="Run All (Cmd/Ctrl+Shift+Enter)"]');

// Dialogs
const timelineDialog = await browser.$('.timeline-dialog');
const exportDialog = await browser.$('.export-dialog');

// Timeline elements
const timelineEvents = await browser.$$('.timeline-event');
const timelineStats = await browser.$$('.timeline-stat');
```

### Best Practices

1. **Always wait for elements**
   ```typescript
   await element.waitForDisplayed({ timeout: 30000 });
   ```

2. **Use explicit waits instead of hard pauses**
   ```typescript
   // Good
   await browser.waitUntil(
     async () => (await element.getText()).includes('expected'),
     { timeout: 30000, timeoutMsg: 'Expected text not found' }
   );

   // Avoid
   await browser.pause(5000);
   ```

3. **Clean up state between tests**
   ```typescript
   afterEach(async () => {
     // Close any open dialogs
     await browser.keys('Escape');
   });
   ```

4. **Use descriptive test names**
   ```typescript
   it('displays execution history after running R code', async () => {
     // ...
   });
   ```

5. **Add meaningful assertions**
   ```typescript
   assert.ok(
     condition,
     'Descriptive failure message explaining what should happen'
   );
   ```

## References

- [Playwright Documentation](https://playwright.dev/) (alternative approach)
- [WebDriverIO Documentation](https://webdriver.io/)
- [Tauri Testing Guide](https://v2.tauri.app/develop/tests/)
- [Tauri WebDriver CI](https://v2.tauri.app/develop/tests/webdriver/ci/)
- [Mocha Test Framework](https://mochajs.org/)

## Contributing

When adding new E2E tests:

1. Follow the existing test structure and naming conventions
2. Add comprehensive test coverage for new features
3. Update this README with new test descriptions
4. Ensure tests pass locally before creating PR
5. Tests should be deterministic (no flaky tests)

## License

Same as main Re-prod project.
