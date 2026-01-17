import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const isMac = process.platform === "darwin";
const chromeExecutablePath =
	isMac && fs.existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
		? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
		: undefined;
const isDocker = fs.existsSync("/.dockerenv") || process.env.REPROD_E2E_DOCKER === "1";
const chromiumHome = path.resolve(__dirname, ".pw-home");
const defaultWebPort = 5173;
const envWebPortRaw = process.env.REPROD_E2E_WEB_PORT ?? process.env.VITE_PORT;
const envWebPort = envWebPortRaw ? Number.parseInt(envWebPortRaw, 10) : Number.NaN;
const webPort = Number.isFinite(envWebPort) && envWebPort > 0 ? envWebPort : defaultWebPort;
const chromiumLaunchOptions = isMac
	? {
			args: [
				"--disable-crashpad",
				"--disable-breakpad",
				"--disable-crash-reporter",
				"--disable-features=Crashpad",
				"--no-crashpad",
			],
			env: {
				...process.env,
				HOME: chromiumHome,
			},
			executablePath: chromeExecutablePath,
		}
	: undefined;

/**
 * Playwright E2E Test Configuration
 *
 * Tests the Re-prod web application in a browser.
 * Works on all platforms (macOS, Linux, Windows).
 */
const projectMap = {
	chromium: {
		name: "chromium",
		use: { ...devices["Desktop Chrome"], launchOptions: chromiumLaunchOptions },
	},
	firefox: {
		name: "firefox",
		use: { ...devices["Desktop Firefox"] },
	},
	webkit: {
		name: "webkit",
		use: { ...devices["Desktop Safari"] },
	},
};

const browserOverride = process.env.E2E_BROWSER?.toLowerCase();
const projects =
	browserOverride && browserOverride in projectMap
		? [projectMap[browserOverride as keyof typeof projectMap]]
		: [projectMap.chromium];

if (!process.env.CI && !isDocker) {
	console.warn(
		"⚠️  Running E2E locally. Use Docker (pnpm --filter @reprod/e2e test:docker) for consistent results.",
	);
}

export default defineConfig({
	// Test directory
	testDir: "./tests",

	// Maximum time one test can run (30 seconds)
	timeout: 30000,

	// Run tests in files in parallel
	fullyParallel: false,

	// Fail the build on CI if you accidentally left test.only in the source code
	forbidOnly: !!process.env.CI,

	// Retry on CI only
	retries: process.env.CI ? 1 : 0,

	// Opt out of parallel tests on CI
	workers: process.env.CI ? 1 : undefined,

	// Reporter to use
	reporter: process.env.CI
		? [["github"], [path.resolve(__dirname, "reporters/playwright-summary-reporter.ts")]]
		: [["list"], [path.resolve(__dirname, "reporters/playwright-summary-reporter.ts")]],

	// Shared settings for all the projects below
	use: {
		// Base URL to use in actions like `await page.goto('/')`
		baseURL: `http://localhost:${webPort}`,

		// Collect trace when retrying the failed test
		trace: "on-first-retry",

		// Screenshot on failure
		screenshot: "only-on-failure",

		// Video on failure
		video: "retain-on-failure",

		headless: process.env.CI ? true : !isMac,
	},

	// Configure projects for major browsers
	projects,

	// Run your local dev server before starting the tests
	webServer: {
		command: "cd ../.. && pnpm dev",
		url: `http://localhost:${webPort}`,
		reuseExistingServer: !process.env.CI,
		timeout: 120000,
		stdout: "ignore",
		stderr: "ignore",
		env: {
			...process.env,
			REPROD_WORKSPACE_ROOT: path.resolve(__dirname, "shared/fixtures/projects"),
			VITE_PORT: webPort.toString(),
		},
	},
});
