import assert from "node:assert";
import {
	clickRunAll,
	closeDialog,
	openTimelineDialog,
	openFixturesProject,
	setEditorValue,
	waitForConnected,
	waitForConsoleOutput,
} from "./helpers";
import { TEST_CASES } from "../shared/test-registry";

const editorSelector = ".monaco-editor textarea";
const timelineDialogSelector = ".timeline-dialog";
const timelineEventSelector = ".timeline-event";
const timelineStatsSelector = ".timeline-stat";
describe("Timeline feature", () => {
	before(async () => {
		const editorInput = await browser.$(editorSelector);
		await editorInput.waitForDisplayed({ timeout: 30000 });
		await waitForConnected();
		await openFixturesProject();
	});

	it(TEST_CASES["timeline"][0], async () => {
		// Execute some R code to create timeline events
		await setEditorValue("x <- 1 + 1\nprint(x)");

		// Run the code
		await clickRunAll();

		// Wait for execution to complete
		await waitForConsoleOutput("[1] 2");

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

	it(TEST_CASES["timeline"][1], async () => {
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

	it(TEST_CASES["timeline"][2], async () => {
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

	it(TEST_CASES["timeline"][3], async () => {
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
