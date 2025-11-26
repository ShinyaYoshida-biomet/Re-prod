import { expect, test } from "@playwright/test";
import {
	closeDialog,
	consoleHasOutput,
	executeRCode,
	openExportDialog,
	openTimelineDialog,
	waitForConsoleOutput,
} from "../shared/helpers";
import { selectors } from "../shared/selectors";

test.describe("Full user workflow", () => {
	test("completes a full data analysis workflow", async ({ page }) => {
		// ========================================
		// STEP 1: App Launch and Initial State
		// ========================================
		await page.goto("/");

		const editor = page.locator(selectors.editor);
		await editor.waitFor({ timeout: 30000 });
		await expect(editor).toBeVisible();

		// ========================================
		// STEP 2: Write and Execute R Code
		// ========================================
		const analysisCode = `# Data Analysis Workflow
# Create sample data
data <- c(23, 45, 67, 12, 89, 34, 56, 78)

# Calculate statistics
mean_value <- mean(data)
median_value <- median(data)
sd_value <- sd(data)

# Print results
cat("Mean:", mean_value, "\\n")
cat("Median:", median_value, "\\n")
cat("SD:", sd_value, "\\n")`;

		await executeRCode(page, analysisCode);

		// ========================================
		// STEP 3: Verify Console Output
		// ========================================
		await waitForConsoleOutput(page, "Mean:", { timeout: 30000 });

		const hasOutput = await consoleHasOutput(page, "Mean:");
		expect(hasOutput).toBeTruthy();

		// ========================================
		// STEP 4: Check Timeline for Execution History
		// ========================================
		await openTimelineDialog(page);

		const timelineEvents = page.locator(selectors.timelineEvent);
		const eventCount = await timelineEvents.count();
		expect(eventCount).toBeGreaterThan(0);

		await closeDialog(page);

		// ========================================
		// STEP 5: Open Export Dialog
		// ========================================
		await openExportDialog(page);

		const exportDialog = page.locator(selectors.exportDialog);
		await expect(exportDialog).toBeVisible();

		// Verify export options are available
		const bundleRadio = page.locator(selectors.exportFormatBundleRadio);
		const rmarkdownRadio = page.locator(selectors.exportFormatRMarkdownRadio);

		const hasExportOptions = (await bundleRadio.count()) + (await rmarkdownRadio.count());
		expect(hasExportOptions).toBeGreaterThan(0);

		await closeDialog(page);

		// ========================================
		// STEP 6: Execute Additional Code
		// ========================================
		const additionalCode = `# Additional analysis
# Create a plot (won't display in console but will execute)
result <- sum(data)
cat("Total sum:", result, "\\n")`;

		await executeRCode(page, additionalCode);

		// Wait for new execution
		await waitForConsoleOutput(page, "Total sum:", { timeout: 30000 });

		// ========================================
		// STEP 7: Verify Timeline Updated
		// ========================================
		await openTimelineDialog(page);

		const updatedEvents = page.locator(selectors.timelineEvent);
		const updatedCount = await updatedEvents.count();
		expect(updatedCount).toBeGreaterThanOrEqual(eventCount);

		await closeDialog(page);

		// ========================================
		// STEP 8: Final Verification
		// ========================================
		// Verify app is still responsive
		const hasBothOutputs =
			(await consoleHasOutput(page, "Mean:")) && (await consoleHasOutput(page, "Total sum:"));

		expect(hasBothOutputs).toBeTruthy();

		// Verify editor is still functional
		await editor.click();
		await page.keyboard.press("Control+A");
		await page.keyboard.type("# Workflow complete");

		await expect(editor).toBeVisible();
	});

	test("handles workflow with errors and recovery", async ({ page }) => {
		await page.goto("/");

		const editor = page.locator(selectors.editor);
		await editor.waitFor({ timeout: 30000 });

		// Execute code with error
		await executeRCode(page, "x <- 1\ny <- x / 0  # Division by zero warning");
		await page.waitForTimeout(3000);

		// Continue with valid code
		await executeRCode(page, "z <- 10\nprint(z * 2)");

		// Verify recovery
		await waitForConsoleOutput(page, "[1] 20", { timeout: 30000 });

		const hasOutput = await consoleHasOutput(page, "[1] 20");
		expect(hasOutput).toBeTruthy();

		// Check timeline still works
		await openTimelineDialog(page);

		const events = page.locator(selectors.timelineEvent);
		const eventCount = await events.count();
		expect(eventCount).toBeGreaterThan(0);

		await closeDialog(page);
	});

	test("completes workflow with multiple code blocks", async ({ page }) => {
		await page.goto("/");

		const editor = page.locator(selectors.editor);
		await editor.waitFor({ timeout: 30000 });

		// Execute first block
		await executeRCode(page, "# Block 1\na <- 5");
		await page.waitForTimeout(2000);

		// Execute second block
		await executeRCode(page, "# Block 2\nb <- a * 2\nprint(b)");

		// Wait for final output
		await waitForConsoleOutput(page, "[1] 10", { timeout: 30000 });

		const hasOutput = await consoleHasOutput(page, "[1] 10");
		expect(hasOutput).toBeTruthy();

		// Verify timeline has both executions
		await openTimelineDialog(page);

		const events = page.locator(selectors.timelineEvent);
		const eventCount = await events.count();
		expect(eventCount).toBeGreaterThanOrEqual(2);

		await closeDialog(page);
	});
});
