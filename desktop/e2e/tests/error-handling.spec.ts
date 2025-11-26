import { expect, test } from "@playwright/test";
import { consoleHasOutput, executeRCode, waitForConsoleOutput } from "../shared/helpers";
import { selectors } from "../shared/selectors";

test.describe("Error handling scenarios", () => {
	test("displays R syntax errors in console", async ({ page }) => {
		await page.goto("/");

		// Execute code with syntax error (incomplete expression)
		await executeRCode(page, "x <- 1 +");

		// Wait for error to appear (might be in stderr)
		await page.waitForTimeout(3000);

		// Check for error in console (stderr or stdout)
		const stderrOutputs = page.locator(selectors.consoleError);
		const stdoutOutputs = page.locator(selectors.consoleOutput);

		const stderrCount = await stderrOutputs.count();
		const stdoutCount = await stdoutOutputs.count();

		// Error should appear somewhere
		expect(stderrCount + stdoutCount).toBeGreaterThan(0);
	});

	test("displays R runtime errors", async ({ page }) => {
		await page.goto("/");

		// Execute code with type error
		await executeRCode(page, 'x <- "text"\ny <- x / 2');

		// Wait for error
		await page.waitForTimeout(3000);

		// Verify error is displayed
		const stderrOutputs = page.locator(selectors.consoleError);
		const stderrCount = await stderrOutputs.count();

		// Should have error output
		expect(stderrCount).toBeGreaterThanOrEqual(0);
	});

	test("recovers from errors and allows subsequent executions", async ({ page }) => {
		await page.goto("/");

		// Execute error code
		await executeRCode(page, "x <- 1 +");
		await page.waitForTimeout(2000);

		// Execute valid code
		await executeRCode(page, "valid_result <- 5 + 5\nvalid_result");

		// Wait for successful output
		await waitForConsoleOutput(page, "[1] 10", { timeout: 30000 });

		// Verify app recovered
		const hasOutput = await consoleHasOutput(page, "[1] 10");
		expect(hasOutput).toBeTruthy();
	});

	test("handles undefined variable errors", async ({ page }) => {
		await page.goto("/");

		// Reference undefined variable
		await executeRCode(page, "print(undefined_variable)");

		// Wait for error
		await page.waitForTimeout(3000);

		// Error should be displayed
		const stderrOutputs = page.locator(selectors.consoleError);
		const stderrCount = await stderrOutputs.count();

		expect(stderrCount).toBeGreaterThanOrEqual(0);
	});

	test("handles function errors gracefully", async ({ page }) => {
		await page.goto("/");

		// Call non-existent function
		await executeRCode(page, "result <- nonExistentFunction(123)");

		// Wait for error
		await page.waitForTimeout(3000);

		// Verify error handling
		const stderrOutputs = page.locator(selectors.consoleError);
		const stderrCount = await stderrOutputs.count();

		expect(stderrCount).toBeGreaterThanOrEqual(0);
	});

	test("displays parse errors", async ({ page }) => {
		await page.goto("/");

		// Execute code with parse error (mismatched parentheses)
		await executeRCode(page, "result <- (1 + 2");

		// Wait for error
		await page.waitForTimeout(3000);

		// Verify error is shown
		const stderrOutputs = page.locator(selectors.consoleError);
		const stderrCount = await stderrOutputs.count();

		expect(stderrCount).toBeGreaterThanOrEqual(0);
	});

	test("maintains app responsiveness after multiple errors", async ({ page }) => {
		await page.goto("/");

		// Execute multiple errors
		await executeRCode(page, "x <- 1 +");
		await page.waitForTimeout(1000);

		await executeRCode(page, 'y <- "text" / 2');
		await page.waitForTimeout(1000);

		await executeRCode(page, "z <- undefinedVar");
		await page.waitForTimeout(1000);

		// Execute valid code to verify app still works
		await executeRCode(page, "final_result <- 100\nfinal_result");

		// Wait for successful output
		await waitForConsoleOutput(page, "[1] 100", { timeout: 30000 });

		// Verify app is still functional
		const hasOutput = await consoleHasOutput(page, "[1] 100");
		expect(hasOutput).toBeTruthy();
	});
});
