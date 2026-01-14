import assert from "node:assert";
import { closeDialog, openExportDialog, openTimelineDialog, setEditorValue } from "./helpers";

const editorSelector = ".monaco-editor textarea";
const runAllSelector = 'button[title="Run All (Cmd/Ctrl+Shift+Enter)"]';
const consoleOutputSelector = ".console-stdout";
const timelineDialogSelector = ".timeline-dialog";
const exportDialogSelector = ".export-dialog";
const timelineEventSelector = ".timeline-event";

/**
 * Full workflow E2E test
 *
 * This test simulates a complete user journey:
 * 1. Launch app
 * 2. Write and execute R code
 * 3. Verify output in console
 * 4. Check timeline for execution history
 * 5. Open export dialog and verify options
 * 6. Execute more code
 * 7. Verify timeline updates
 */
describe("Full user workflow", () => {
	it("completes a full data analysis workflow", async () => {
		// ========================================
		// STEP 1: App Launch and Initial State
		// ========================================
		const editorInput = await browser.$(editorSelector);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		const isEditorVisible = await editorInput.isDisplayed();
		assert.ok(isEditorVisible, "Editor should be visible after app launch");

		// ========================================
		// STEP 2: Write and Execute R Code
		// ========================================
		// Write a simple data analysis workflow
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

		await setEditorValue(analysisCode);

		// Execute the code
		const runAllButton = await browser.$(runAllSelector);
		await runAllButton.waitForClickable({ timeout: 15000 });
		await runAllButton.click();

		// ========================================
		// STEP 3: Verify Console Output
		// ========================================
		await browser.waitUntil(
			async () => {
				const outputs = await browser.$$(consoleOutputSelector);
				for (const output of outputs) {
					const text = await output.getText();
					if (text.includes("Mean:") || text.includes("Median:")) {
						return true;
					}
				}
				return false;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected R execution output to appear in console",
			},
		);

		const outputs = await browser.$$(consoleOutputSelector);
		const outputTexts = await Promise.all(outputs.map(async (output) => await output.getText()));
		const hasOutput = outputTexts.some(
			(text) => text.includes("Mean:") || text.includes("Median:"),
		);

		assert.ok(hasOutput, "Console should display analysis results");

		// ========================================
		// STEP 4: Check Timeline for Execution History
		// ========================================
		const timelineDialog = await openTimelineDialog();

		// Verify timeline shows the execution
		const timelineEvents = await browser.$$(timelineEventSelector);
		assert.ok(timelineEvents.length > 0, "Timeline should contain execution events");

		// Get first event and verify it contains our code
		if (timelineEvents.length > 0) {
			const firstEventText = await timelineEvents[0].getText();
			// Timeline should reference our analysis
			assert.ok(firstEventText.length > 0, "Timeline events should have content");
		}

		// Close timeline dialog
		await closeDialog(timelineDialogSelector, ".timeline-dialog-overlay");

		// ========================================
		// STEP 5: Open Export Dialog
		// ========================================
		const exportDialog = await openExportDialog();

		// Verify export options are available
		const bundleRadio = await browser.$('input[value="bundle"]');
		const rmarkdownRadio = await browser.$('input[value="rmarkdown"]');

		assert.ok(
			(await bundleRadio.isExisting()) || (await rmarkdownRadio.isExisting()),
			"Export options should be available",
		);

		// Close export dialog
		await closeDialog(exportDialogSelector, ".export-dialog-overlay");

		// ========================================
		// STEP 6: Execute Additional Code
		// ========================================
		await setEditorValue(`# Additional analysis
# Create a plot (won't display in console but will execute)
result <- sum(data)
cat("Total sum:", result, "\\n")`);

		await runAllButton.click();

		// Wait for new execution
		await browser.waitUntil(
			async () => {
				const outputs = await browser.$$(consoleOutputSelector);
				for (const output of outputs) {
					const text = await output.getText();
					if (text.includes("Total sum:")) {
						return true;
					}
				}
				return false;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected second execution output",
			},
		);

		// ========================================
		// STEP 7: Verify Timeline Updated
		// ========================================
		await openTimelineDialog();

		const updatedEventCodes = await browser.$$(".timeline-event-code");
		const updatedCodeTexts = await Promise.all(
			updatedEventCodes.map(async (event) => await event.getText()),
		);
		const hasResultEvent = updatedCodeTexts.some((text) => text.includes("result <- sum(data)"));
		assert.ok(hasResultEvent, "Timeline should include the latest execution");

		// Close timeline
		await closeDialog(timelineDialogSelector, ".timeline-dialog-overlay");

		// ========================================
		// STEP 8: Final Verification
		// ========================================
		// Verify app is still responsive
		const finalOutputs = await browser.$$(consoleOutputSelector);
		const finalTexts = await Promise.all(
			finalOutputs.map(async (output) => await output.getText()),
		);

		const hasBothOutputs =
			finalTexts.some((text) => text.includes("Mean:")) &&
			finalTexts.some((text) => text.includes("Total sum:"));

		assert.ok(hasBothOutputs, "Console should contain outputs from both executions");

		// Verify editor is still functional
		await setEditorValue("# Workflow complete");

		const editorStillWorks = await editorInput.isDisplayed();
		assert.ok(editorStillWorks, "Editor should remain functional after workflow");
	});

	it("handles workflow with errors and recovery", async () => {
		const editorInput = await browser.$(editorSelector);

		// Execute code with error
		await setEditorValue("x <- 1\ny <- x / 0  # Division by zero warning");

		const runAllButton = await browser.$(runAllSelector);
		await runAllButton.click();

		// Wait for execution (may have warning)
		await browser.pause(3000);

		// Continue with valid code
		await setEditorValue("z <- 10\nprint(z * 2)");

		await runAllButton.click();

		// Verify recovery
		await browser.waitUntil(
			async () => {
				const outputs = await browser.$$(consoleOutputSelector);
				for (const output of outputs) {
					const text = await output.getText();
					if (text.includes("[1] 20")) {
						return true;
					}
				}
				return false;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected successful execution after warning/error",
			},
		);

		// Check timeline still works
		await openTimelineDialog();

		const events = await browser.$$(timelineEventSelector);
		assert.ok(events.length > 0, "Timeline should track all executions including errors");

		await closeDialog(timelineDialogSelector, ".timeline-dialog-overlay");
	});

	it("completes workflow with multiple code blocks", async () => {
		const editorInput = await browser.$(editorSelector);

		// Execute first block
		await setEditorValue("# Block 1\na <- 5");

		const runAllButton = await browser.$(runAllSelector);
		await runAllButton.click();
		await browser.pause(2000);

		// Execute second block
		await setEditorValue("# Block 2\nb <- a * 2\nprint(b)");

		await runAllButton.click();

		// Wait for final output
		await browser.waitUntil(
			async () => {
				const outputs = await browser.$$(consoleOutputSelector);
				for (const output of outputs) {
					const text = await output.getText();
					if (text.includes("[1] 10")) {
						return true;
					}
				}
				return false;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected output from second code block",
			},
		);

		// Verify timeline has both executions
		await openTimelineDialog();

		const events = await browser.$$(timelineEventSelector);
		assert.ok(events.length >= 2, "Timeline should contain multiple execution events");

		await closeDialog(timelineDialogSelector, ".timeline-dialog-overlay");
	});
});
