# Desktop E2E Tests

End-to-end test suite for the Re-prod application using **Playwright** (primary) and **WebDriverIO** (desktop validation).

## 🎯 Hybrid Testing Strategy

This test suite uses a **hybrid approach** to maximize coverage and developer productivity:

### Playwright Tests (Primary - Docker/CI ✅)
- **Location**: `tests/` directory
- **Target**: Web browser (Chromium)
- **Platforms**: Linux (CI) or Docker (local)
- **Use Case**: Daily development and CI validation (Docker locally)
- **Benefits**: Works everywhere, fast, great debugging tools

### WebDriverIO Tests (Desktop Validation - Docker/Linux/Windows)
- **Location**: `webdriver-specs/` directory
- **Target**: Tauri desktop application
- **Platforms**: Docker (Linux) for local runs, CI/manual runs on Linux/Windows
- **Use Case**: Desktop validation via Docker or Linux/Windows runners
- **Benefits**: Tests actual desktop app behavior

## Test Coverage

Both test suites cover the same core workflows:

- ✅ **R Code Execution** - Basic R code execution and output verification
- ✅ **Timeline Feature** - Execution history, filtering, and statistics
- ✅ **Export Functionality** - Export dialog, format selection, and options
- ✅ **Error Handling** - Syntax errors, runtime errors, and error recovery
- ✅ **Full Workflows** - Complete user journeys from code to export

## ⚠️ Platform Support

**IMPORTANT**: Local E2E runs are disabled outside Docker/CI to avoid OS-specific flakiness. Use the Docker runner on any platform.

- ✅ **Docker**: Playwright + WebDriverIO supported (desktop suite takes longer)
- ✅ **CI (Ubuntu)**: Runs Playwright tests
- ❌ **Native host runs**: Blocked by guardrails (non-Docker)

See the [Running in Docker](#running-in-docker) section below.

## Prerequisites

### Required Software (Local)

- **Docker Desktop** (or Docker Engine) with enough disk space for the image
- No local Node/Rust/R/tauri-driver setup required (handled inside the image)

## Running in Docker

From the repository root:

```bash
# Run Playwright E2E tests in Docker
pnpm --filter @reprod/e2e test:docker
```

Run Desktop (WebDriverIO) E2E tests in Docker:

```bash
pnpm --filter @reprod/e2e test:docker:webdriver
```

This builds the desktop app and runs WebDriverIO under Xvfb, so expect a longer runtime.

To run a specific command inside the container:

```bash
# Example: run a single Playwright spec
pnpm --filter @reprod/e2e test:docker -- pnpm --filter @reprod/e2e test tests/open-folder.spec.ts
```

Optional resource caps:

```bash
REPROD_E2E_DOCKER_MEMORY=8g REPROD_E2E_DOCKER_CPUS=6 pnpm --filter @reprod/e2e test:docker
```

```bash
REPROD_E2E_DOCKER_MODE=webdriver pnpm --filter @reprod/e2e test:docker
```

Rebuild the image when the Dockerfile changes:

```bash
pnpm --filter @reprod/e2e test:docker -- --build
```

The Docker runner uses `--workers=1` by default to reduce memory pressure.

### Running Specific Tests

**Playwright (Docker):**

```bash
# Run only R execution tests
pnpm --filter @reprod/e2e test:docker -- pnpm --filter @reprod/e2e test r-execution

# Run only Timeline tests
pnpm --filter @reprod/e2e test:docker -- pnpm --filter @reprod/e2e test timeline

# Run only Export tests
pnpm --filter @reprod/e2e test:docker -- pnpm --filter @reprod/e2e test export

# Run only Error handling tests
pnpm --filter @reprod/e2e test:docker -- pnpm --filter @reprod/e2e test error-handling

# Run only Full workflow tests
pnpm --filter @reprod/e2e test:docker -- pnpm --filter @reprod/e2e test full-workflow

# Run specific test file
pnpm --filter @reprod/e2e test:docker -- pnpm --filter @reprod/e2e test tests/r-execution.spec.ts
```

**WebDriverIO (Docker):**

```bash
# Run full desktop suite in Docker
pnpm --filter @reprod/e2e test:docker:webdriver

# Run a specific WebDriverIO spec in Docker
pnpm --filter @reprod/e2e test:docker -- pnpm tauri build --debug && xvfb-run --auto-servernum pnpm --filter @reprod/e2e test:webdriver -- --spec ./webdriver-specs/r-execution.e2e.ts
```

### Debug Mode

**Playwright (Docker):**

```bash
# Debug mode (headless in Docker)
pnpm --filter @reprod/e2e test:docker -- pnpm --filter @reprod/e2e test:playwright:debug

# UI mode (requires Linux host with display)
pnpm --filter @reprod/e2e test:docker -- pnpm --filter @reprod/e2e test:playwright:ui

# Headed mode (requires Linux host with display)
pnpm --filter @reprod/e2e test:docker -- pnpm --filter @reprod/e2e test:playwright:headed
```

**WebDriverIO (Docker):**

```bash
# Run with verbose logging
pnpm --filter @reprod/e2e test:docker -- LOG_LEVEL=debug pnpm tauri build --debug && xvfb-run --auto-servernum pnpm --filter @reprod/e2e test:webdriver

# Run with debugging enabled
pnpm --filter @reprod/e2e test:docker -- pnpm tauri build --debug && xvfb-run --auto-servernum pnpm --filter @reprod/e2e test:webdriver:debug
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
├── webdriver-specs/           # WebDriverIO tests (Docker/Linux/Windows)
│   ├── r-execution.e2e.ts    # Basic R code execution
│   ├── timeline.e2e.ts       # Timeline feature tests
│   ├── export.e2e.ts         # Export dialog and functionality
│   ├── error-handling.e2e.ts # Error scenarios and recovery
│   └── full-workflow.e2e.ts  # Complete user workflows
├── shared/                    # Shared helpers and selectors
│   ├── selectors.ts          # Common DOM selectors
│   └── helpers.ts            # Common test actions
├── Dockerfile                 # Docker image for Playwright runs
├── scripts/run-docker.sh       # Docker runner entrypoint
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

### Docker Runner (Playwright)

| Variable | Description | Default |
|----------|-------------|---------|
| `REPROD_E2E_DOCKER_MEMORY` | Docker memory limit for `test:docker` | `6g` |
| `REPROD_E2E_DOCKER_CPUS` | Docker CPU limit for `test:docker` | `4` |
| `REPROD_E2E_DOCKER_MODE` | Default Docker command (`playwright` or `webdriver`) | `playwright` |
| `REPROD_E2E_DOCKER_KEEP_OLD_IMAGE` | Keep the previous `reprod-e2e` image after a rebuild | `0` |
| `REPROD_E2E_DOCKER_REUSE_CONTAINER` | Reuse a running container (`1` to reuse, `0` to disable) | `1` |
| `REPROD_E2E_DOCKER_CONTAINER_NAME` | Docker container name when reusing | `reprod-e2e-runner` |
| `REPROD_E2E_DOCKER_PREBUILD` | Prebuild the backend (`cargo build -p reprod-server`) before running tests | `1` |

**Example**:
```bash
REPROD_E2E_DOCKER_MEMORY=8g REPROD_E2E_DOCKER_CPUS=6 pnpm --filter @reprod/e2e test:docker
```

The Docker runner is reused by default to avoid creating new containers on each run.
To force a fresh container for a single run:
```bash
REPROD_E2E_DOCKER_REUSE_CONTAINER=0 pnpm --filter @reprod/e2e test:docker
```

Reset the reusable runner if it gets into a bad state:
```bash
docker rm -f reprod-e2e-runner
```

### WebDriverIO (Desktop)

Customize desktop test execution with these environment variables. For Docker runs, prefix them inside the `test:docker -- ...` command.

| Variable | Description | Default |
|----------|-------------|---------|
| `TAURI_DRIVER_APP` | Path to Tauri binary | `../target/debug/reprod-desktop` |
| `TAURI_DRIVER_EXECUTABLE` | Command to start driver | `tauri-driver` |
| `TAURI_DRIVER_HOST` | WebDriver endpoint host | `127.0.0.1` |
| `TAURI_DRIVER_PORT` | WebDriver endpoint port | `9515` |
| `TAURI_DRIVER_PATH` | WebDriver endpoint path | `/` |
| `TAURI_DRIVER_READY_TIMEOUT` | Driver startup timeout (ms) | `15000` |
| `TAURI_DRIVER_ARGS` | Additional driver arguments | `--port 9515` |
| `TAURI_DRIVER_TAURI_OPTIONS` | JSON options for driver | `{}` |
| `LOG_LEVEL` | Logging verbosity | `info` |

**Example**:
```bash
# Linux/Windows runner: use custom binary path
TAURI_DRIVER_APP=/path/to/custom/binary pnpm --filter @reprod/e2e test:webdriver

# Linux/Windows runner: increase timeout for slow systems
TAURI_DRIVER_READY_TIMEOUT=30000 pnpm --filter @reprod/e2e test:webdriver
```

## CI/CD Integration

### GitHub Actions

E2E tests run automatically in CI on PRs to `develop` and `main`, plus pushes to `main`.

**CI Configuration** (`.github/workflows/ci.yml`):

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main, develop]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: corepack enable pnpm
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: "pnpm"
      - uses: dtolnay/rust-toolchain@stable
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @reprod/e2e exec playwright install --with-deps chromium
      - run: pnpm --filter @reprod/e2e test
```

### When E2E Tests Run

| Branch Flow | Event | Quick Checks | E2E Tests |
|-------------|-------|--------------|-----------|
| feature → develop | PR | ✅ | ✅ |
| develop → main | PR | ✅ | ✅ |
| main | push | ✅ | ✅ |

**Rationale**: E2E runs on PRs and main pushes to keep develop/main stable with consistent feedback.

### CI Strategy

CI currently runs Playwright (Chromium) only. WebDriverIO desktop tests are manual or run via Docker.

### Before Creating develop → main PR

⚠️ **IMPORTANT**: Run E2E tests before creating a PR from develop to main:

**All developers** - Run Playwright tests in Docker:

```bash
# 1. Run Playwright E2E suite in Docker
pnpm --filter @reprod/e2e test:docker

# 2. Verify all tests pass, then create PR
gh pr create --base main --head develop
```

**Desktop app validation (Optional)**:

```bash
# 1. Run the desktop suite in Docker
pnpm --filter @reprod/e2e test:docker:webdriver

# 2. Create PR
gh pr create --base main --head develop
```

## Troubleshooting

### Common Issues

**1. "tauri-driver is not supported on this platform" (macOS)**

```
Error: tauri-driver is not supported on this platform
```

**Cause**: tauri-driver does NOT support macOS (no WKWebView driver available).

**Solution**:
- Use Docker for Playwright: `pnpm --filter @reprod/e2e test:docker`
- Run WebDriverIO tests in Docker: `pnpm --filter @reprod/e2e test:docker:webdriver`

**2. "tauri-driver not found"** (Linux/Windows)

```bash
# Install tauri-driver
cargo install tauri-driver

# Verify installation
tauri-driver --version
```

**3. "App binary not found"**

```bash
# Docker: rebuild automatically by rerunning the suite
pnpm --filter @reprod/e2e test:docker:webdriver

# Linux/Windows runner: rebuild the app
pnpm tauri build --debug

# Linux/Windows runner: specify custom path
TAURI_DRIVER_APP=/path/to/binary pnpm --filter @reprod/e2e test:webdriver
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
pnpm --filter @reprod/e2e test:docker -- TAURI_DRIVER_READY_TIMEOUT=30000 pnpm tauri build --debug && xvfb-run --auto-servernum pnpm --filter @reprod/e2e test:webdriver

# Check if port 9515 is already in use
lsof -i :9515
# Kill existing process if needed
kill -9 <PID>
```

**6. Tests fail on Linux (missing display)**

```bash
# Docker already uses Xvfb for WebDriverIO.
# Linux runner example:
sudo apt-get install xvfb
xvfb-run --auto-servernum pnpm --filter @reprod/e2e test:webdriver
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

## Adding New Tests

### 1. Create a new spec file

```bash
# Playwright (Docker)
touch desktop/e2e/tests/my-feature.spec.ts

# WebDriverIO (Docker)
touch desktop/e2e/webdriver-specs/my-feature.e2e.ts
```

### 2. Write tests using WebDriverIO syntax (desktop)

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
# Playwright (Docker)
pnpm --filter @reprod/e2e test:docker -- pnpm --filter @reprod/e2e test tests/my-feature.spec.ts

# WebDriverIO (Docker)
pnpm --filter @reprod/e2e test:docker -- pnpm tauri build --debug && xvfb-run --auto-servernum pnpm --filter @reprod/e2e test:webdriver -- --spec ./webdriver-specs/my-feature.e2e.ts
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
