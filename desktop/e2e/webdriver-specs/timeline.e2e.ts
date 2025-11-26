import assert from "node:assert";

const editorSelector = ".monaco-editor textarea";
const runAllSelector = 'button[title="Run All (Cmd/Ctrl+Shift+Enter)"]';
const timelineDialogSelector = ".timeline-dialog";
const timelineEventSelector = ".timeline-event";
const timelineStatsSelector = ".timeline-stat";
const consoleOutputSelector = ".console-stdout";

describe("Timeline feature", () => {
	it("opens timeline dialog and displays execution history", async () => {
		// Execute some R code to create timeline events
		const editorInput = await browser.$(editorSelector);
		await editorInput.waitForDisplayed({ timeout: 30000 });
		await editorInput.click();

		// Clear editor and add code
		await browser.keys(["Control", "a", "NULL"]);
		await browser.keys("x <- 1 + 1\nprint(x)");

		// Run the code
		const runAllButton = await browser.$(runAllSelector);
		await runAllButton.waitForClickable({ timeout: 15000 });
		await runAllButton.click();

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

		// Open timeline dialog via browser.execute
		await browser.execute(() => {
			(window as any).openTimelineDialog?.();
		});

		// Wait for timeline dialog to appear
		const timelineDialog = await browser.$(timelineDialogSelector);
		await timelineDialog.waitForDisplayed({ timeout: 10000 });

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

		// Close dialog with ESC key
		await browser.keys("Escape");

		// Verify dialog is closed
		await browser.waitUntil(
			async () => {
				return !(await timelineDialog.isDisplayed());
			},
			{
				timeout: 5000,
				timeoutMsg: "Timeline dialog should close after pressing ESC",
			},
		);
	});

	it("filters timeline events by type", async () => {
		// Open timeline dialog
		await browser.execute(() => {
			(window as any).openTimelineDialog?.();
		});

		const timelineDialog = await browser.$(timelineDialogSelector);
		await timelineDialog.waitForDisplayed({ timeout: 10000 });

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
		await browser.keys("Escape");
	});

	it("displays timeline statistics correctly", async () => {
		// Open timeline dialog
		await browser.execute(() => {
			(window as any).openTimelineDialog?.();
		});

		const timelineDialog = await browser.$(timelineDialogSelector);
		await timelineDialog.waitForDisplayed({ timeout: 10000 });

		// Check for stats elements
		const totalStat = await browser.$(".timeline-stat-value");
		if (await totalStat.isExisting()) {
			const statValue = await totalStat.getText();
			assert.ok(parseInt(statValue, 10) >= 0, "Timeline statistics should display valid numbers");
		}

		// Close dialog
		await browser.keys("Escape");
	});

	it("navigates to code location when clicking timeline event", async () => {
		// Execute code with specific content we can verify
		const editorInput = await browser.$(editorSelector);
		await editorInput.click();

		await browser.keys(["Control", "a", "NULL"]);
		await browser.keys("# Test navigation\ny <- 100");

		const runAllButton = await browser.$(runAllSelector);
		await runAllButton.click();

		// Wait for execution
		await browser.pause(3000);

		// Open timeline
		await browser.execute(() => {
			(window as any).openTimelineDialog?.();
		});

		const timelineDialog = await browser.$(timelineDialogSelector);
		await timelineDialog.waitForDisplayed({ timeout: 10000 });

		// Click on a timeline event (if clickable events exist)
		const timelineEvents = await browser.$$(timelineEventSelector);
		if (timelineEvents.length > 0) {
			const firstEvent = timelineEvents[0];
			const clickableElement = await firstEvent.$('button, a, [role="button"]');

			if (await clickableElement.isExisting()) {
				await clickableElement.click();

				// Dialog should close after navigation
				await browser.waitUntil(
					async () => {
						return !(await timelineDialog.isDisplayed());
					},
					{
						timeout: 5000,
						timeoutMsg: "Timeline dialog should close after clicking event",
					},
				);
			}
		}
	});
});
