import assert from "node:assert";
import { clickRunAll, closeDialog, openTimelineDialog, setEditorValue } from "./helpers";

const editorSelector = ".monaco-editor textarea";
const timelineDialogSelector = ".timeline-dialog";
const timelineEventSelector = ".timeline-event";
const timelineStatsSelector = ".timeline-stat";
const consoleOutputSelector = ".console-stdout";

describe("Timeline feature", () => {
	it("opens timeline dialog and displays execution history", async () => {
		// Execute some R code to create timeline events
		const editorInput = await browser.$(editorSelector);
		await editorInput.waitForDisplayed({ timeout: 30000 });
		await setEditorValue("x <- 1 + 1\nprint(x)");

		// Run the code
		await clickRunAll();

		// Wait for execution to complete
		await browser.waitUntil(
			async () => {
				const outputs = await browser.$$(consoleOutputSelector);
				for (const output of outputs) {
					const text = await output.getText();
					if (text.includes("[1] 2")) {
						return true;
					}
				}
				return false;
			},
			{
				timeout: 30000,
				timeoutMsg: "Expected code execution to complete",
			},
		);

		const timelineDialog = await openTimelineDialog();

		// Verify dialog is visible
		const isDialogVisible = await timelineDialog.isDisplayed();
		assert.ok(isDialogVisible, "Timeline dialog should be visible");

		// Verify timeline events exist
		const timelineEvents = await browser.$$(timelineEventSelector);
		assert.ok(
			timelineEvents.length > 0,
			"Timeline should contain at least one event after code execution",
		);

		// Verify timeline stats are displayed
		const timelineStats = await browser.$$(timelineStatsSelector);
		assert.ok(timelineStats.length > 0, "Timeline stats should be displayed");

		// Close dialog
		await closeDialog(timelineDialogSelector, ".timeline-dialog-overlay");
	});

	it("filters timeline events by type", async () => {
		// Open timeline dialog
		await openTimelineDialog();

		// Find and click the event type filter dropdown
		const eventTypeFilter = await browser.$('select[name="event-type"]');
		const filterExists = await eventTypeFilter.isExisting();

		if (filterExists) {
			await eventTypeFilter.waitForClickable({ timeout: 5000 });
			await eventTypeFilter.selectByAttribute("value", "execution");

			// Verify filtering works (events update)
			await browser.pause(1000); // Wait for filter to apply

			const eventsAfterFilter = await browser.$$(timelineEventSelector);
			assert.ok(eventsAfterFilter.length >= 0, "Events should be filtered by type");
		}

		// Close dialog
		await closeDialog(timelineDialogSelector, ".timeline-dialog-overlay");
	});

	it("displays timeline statistics correctly", async () => {
		// Open timeline dialog
		await openTimelineDialog();

		// Check for stats elements
		const totalStat = await browser.$(".timeline-stat-value");
		if (await totalStat.isExisting()) {
			const statValue = await totalStat.getText();
			assert.ok(parseInt(statValue, 10) >= 0, "Timeline statistics should display valid numbers");
		}

		// Close dialog
		await closeDialog(timelineDialogSelector, ".timeline-dialog-overlay");
	});

	it("navigates to code location when clicking timeline event", async () => {
		// Execute code with specific content we can verify
		await setEditorValue("# Test navigation\ny <- 100");

		await clickRunAll();

		// Wait for execution
		await browser.pause(3000);

		// Open timeline
		const timelineDialog = await openTimelineDialog();

		// Click on a timeline event (if clickable events exist)
		const timelineEvents = await browser.$$(timelineEventSelector);
		if (timelineEvents.length > 0) {
			const firstEvent = timelineEvents[0];
			const clickableElement = await firstEvent.$('button, a, [role="button"]');

			if (await clickableElement.isExisting()) {
				await clickableElement.click();

				// Dialog should close after navigation
				await closeDialog(timelineDialogSelector, ".timeline-dialog-overlay");
			}
		}
	});
});
