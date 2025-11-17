# Desktop E2E Tests

End-to-end test suite for the Re-prod desktop application using WebDriverIO and tauri-driver.

## Overview

This test suite provides comprehensive E2E coverage for core user workflows:

- ✅ **R Code Execution** - Basic R code execution and output verification
- ✅ **Timeline Feature** - Execution history, filtering, and statistics
- ✅ **Export Functionality** - Export dialog, format selection, and options
- ✅ **Error Handling** - Syntax errors, runtime errors, and error recovery
- ✅ **Full Workflows** - Complete user journeys from code to export

## Prerequisites

### Required Software

1. **Node.js & pnpm**
   - Node.js 18+ ([Download](https://nodejs.org/))
   - pnpm >=9 (`corepack enable pnpm`)

2. **Rust & Cargo**
   - Install from [rustup.rs](https://rustup.rs/)

3. **tauri-driver**
   ```bash
   cargo install tauri-driver
   ```

4. **R Environment**
   - **macOS**: `brew install r`
   - **Ubuntu**: `sudo apt-get install r-base`
   - **Windows**: Download from [CRAN](https://cran.r-project.org/bin/windows/base/)
   - Verify: `R --version` (should be >=4.3)

5. **Platform-specific dependencies**

   **macOS**:
   - Xcode Command Line Tools: `xcode-select --install`

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

### Quick Start

From the repository root:

```bash
# 1. Install all dependencies
pnpm install

# 2. Build the Tauri app in debug mode
pnpm tauri build --debug

# 3. Run all E2E tests
pnpm --filter @reprod/e2e test
```

### Running Specific Tests

```bash
# Run only R execution tests
pnpm --filter @reprod/e2e test -- --spec ./specs/r-execution.e2e.ts

# Run only Timeline tests
pnpm --filter @reprod/e2e test -- --spec ./specs/timeline.e2e.ts

# Run only Export tests
pnpm --filter @reprod/e2e test -- --spec ./specs/export.e2e.ts

# Run only Error handling tests
pnpm --filter @reprod/e2e test -- --spec ./specs/error-handling.e2e.ts

# Run only Full workflow tests
pnpm --filter @reprod/e2e test -- --spec ./specs/full-workflow.e2e.ts
```

### Debug Mode

```bash
# Run with verbose logging
LOG_LEVEL=debug pnpm --filter @reprod/e2e test

# Run with debugging enabled
pnpm --filter @reprod/e2e test:debug
```

## Test Structure

```
desktop/e2e/
├── specs/
│   ├── r-execution.e2e.ts      # Basic R code execution
│   ├── timeline.e2e.ts         # Timeline feature tests
│   ├── export.e2e.ts           # Export dialog and functionality
│   ├── error-handling.e2e.ts  # Error scenarios and recovery
│   └── full-workflow.e2e.ts   # Complete user workflows
├── wdio.conf.ts                # WebDriverIO configuration
├── package.json                # Test dependencies
├── tsconfig.json               # TypeScript config
└── README.md                   # This file
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

### Before Creating develop → main PR

⚠️ **IMPORTANT**: Always run E2E tests locally before creating a PR from develop to main:

```bash
# 1. Ensure R is installed
R --version

# 2. Build the app
pnpm tauri build --debug

# 3. Run full E2E suite
pnpm --filter @reprod/e2e test

# 4. Verify all tests pass, then create PR
gh pr create --base main --head develop
```

## Troubleshooting

### Common Issues

**1. "tauri-driver not found"**

```bash
# Install tauri-driver
cargo install tauri-driver

# Verify installation
tauri-driver --version
```

**2. "App binary not found"**

```bash
# Rebuild the app
pnpm tauri build --debug

# Or specify custom path
TAURI_DRIVER_APP=/path/to/binary pnpm --filter @reprod/e2e test
```

**3. "R not found" errors**

```bash
# Verify R installation
R --version

# macOS: Install R
brew install r

# Ubuntu: Install R
sudo apt-get install r-base
```

**4. "Driver timeout" or "Driver not ready"**

```bash
# Increase timeout
TAURI_DRIVER_READY_TIMEOUT=30000 pnpm --filter @reprod/e2e test

# Check if port 9515 is already in use
lsof -i :9515
# Kill existing process if needed
kill -9 <PID>
```

**5. Tests fail on Linux (missing display)**

```bash
# Install Xvfb
sudo apt-get install xvfb

# Run with Xvfb
xvfb-run --auto-servernum pnpm --filter @reprod/e2e test
```

**6. GTK/WebKit errors on Linux**

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
