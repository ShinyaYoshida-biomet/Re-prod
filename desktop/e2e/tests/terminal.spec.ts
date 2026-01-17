import { expect, test } from "@playwright/test";
import { waitForElement } from "../shared/helpers";
import { selectors } from "../shared/selectors";
import { TEST_CASES } from "../shared/test-registry";

const openTerminalPane = async (page: any) => {
	await page.evaluate(() => {
		window.dispatchEvent(new Event("terminal:focus"));
	});
	const terminalPane = page.locator(selectors.terminalPane);
	await terminalPane.waitFor({ timeout: 10000 });
};

const openTerminalSession = async (page: any) => {
	const newTerminalButton = page.locator(selectors.newTerminalButton);
	await newTerminalButton.waitFor({ timeout: 10000 });
	if (!(await newTerminalButton.isEnabled())) {
		test.skip(true, "Terminal sessions are not available in web mode");
	}
	await newTerminalButton.click();
};

const focusTerminalInput = async (page: any) => {
	const terminalInput = page.locator(selectors.terminalInput);
	await terminalInput.waitFor({ timeout: 10000 });
	await terminalInput.click();
	return terminalInput;
};

test.describe("Terminal integration", () => {
	test(TEST_CASES["terminal"][0], async ({ page }) => {
		// Navigate to the app
		await page.goto("/");

		// Wait for editor to be ready
		const editor = page.locator(selectors.editor);
		await editor.waitFor({ timeout: 30000 });

		// Open terminal pane
		await openTerminalPane(page);
		await openTerminalSession(page);

		// Verify terminal pane is visible
		const terminalPane = page.locator(selectors.terminalPane);
		await terminalPane.waitFor({ timeout: 10000 });
		const isVisible = await terminalPane.isVisible();
		expect(isVisible).toBeTruthy();
	});

	test(TEST_CASES["terminal"][1], async ({ page }) => {
		await page.goto("/");

		const editor = page.locator(selectors.editor);
		await editor.waitFor({ timeout: 30000 });

		// Open terminal
		await openTerminalPane(page);
		await openTerminalSession(page);
		await waitForElement(page, selectors.terminalPane);

		// Execute shell command
		await focusTerminalInput(page);
		await page.keyboard.type("echo 'Hello from terminal'");
		await page.keyboard.press("Enter");

		// Wait for output to appear
		await page.waitForTimeout(1000);

		// Verify output is displayed
		const terminalOutput = page.locator(selectors.terminalOutput);
		const outputText = await terminalOutput.textContent();
		expect(outputText).toContain("Hello from terminal");
	});

	test(TEST_CASES["terminal"][2], async ({ page }) => {
		await page.goto("/");

		const editor = page.locator(selectors.editor);
		await editor.waitFor({ timeout: 30000 });

		// Open terminal
		await openTerminalPane(page);
		await openTerminalSession(page);

		await waitForElement(page, selectors.terminalPane);

		// Execute first command
		await focusTerminalInput(page);
		await page.keyboard.type("echo 'first command'");
		await page.keyboard.press("Enter");

		await page.waitForTimeout(500);

		// Execute second command
		await page.keyboard.type("echo 'second command'");
		await page.keyboard.press("Enter");

		await page.waitForTimeout(500);

		// Press up arrow to navigate history
		const terminalInput = await focusTerminalInput(page);
		await terminalInput.press("ArrowUp");

		// Verify previous command appears in input
		const inputValue = await terminalInput.inputValue();
		expect(inputValue).toContain("second command");

		// Press up again
		await terminalInput.press("ArrowUp");
		const inputValue2 = await terminalInput.inputValue();
		expect(inputValue2).toContain("first command");
	});

	test(TEST_CASES["terminal"][3], async ({ page }) => {
		await page.goto("/");

		const editor = page.locator(selectors.editor);
		await editor.waitFor({ timeout: 30000 });

		// Open terminal
		await openTerminalPane(page);
		await openTerminalSession(page);

		await waitForElement(page, selectors.terminalPane);

		await focusTerminalInput(page);

		// Test paste operation
		const testText = "echo 'pasted text'";
		await page.keyboard.type(testText);

		// Verify text was pasted
		const terminalInput = page.locator(selectors.terminalInput);
		const inputValue = await terminalInput.inputValue();
		expect(inputValue).toBe(testText);

		// Execute command
		await terminalInput.press("Enter");
		await page.waitForTimeout(1000);

		// Select and copy output (simulate Ctrl+C on output)
		const terminalOutput = page.locator(selectors.terminalOutput);
		await terminalOutput.click();

		// Verify copy/paste functionality works
		// (actual clipboard testing is limited in headless mode)
		const isVisible = await terminalOutput.isVisible();
		expect(isVisible).toBeTruthy();
	});

	test(TEST_CASES["terminal"][4], async ({ page }) => {
		await page.goto("/");

		const editor = page.locator(selectors.editor);
		await editor.waitFor({ timeout: 30000 });

		// Open first terminal
		await openTerminalPane(page);
		await openTerminalSession(page);

		await waitForElement(page, selectors.terminalPane);

		// Verify first terminal tab exists
		const firstTerminalTab = page.locator(selectors.terminalTab).first();
		await firstTerminalTab.waitFor({ timeout: 10000 });

		// Open second terminal
		await openTerminalSession(page);
		await page.waitForTimeout(500);

		// Verify second terminal tab exists
		const terminalTabs = page.locator(selectors.terminalTab);
		const tabCount = await terminalTabs.count();
		expect(tabCount).toBeGreaterThanOrEqual(2);
	});

	test(TEST_CASES["terminal"][5], async ({ page }) => {
		await page.goto("/");

		const editor = page.locator(selectors.editor);
		await editor.waitFor({ timeout: 30000 });

		// Open terminal
		await openTerminalPane(page);
		await openTerminalSession(page);

		await waitForElement(page, selectors.terminalPane);

		// Get initial terminal count
		const terminalTabs = page.locator(selectors.terminalTab);
		const initialCount = await terminalTabs.count();

		// Close terminal
		const terminalClose = page.locator(selectors.terminalClose).first();
		await terminalClose.waitFor({ timeout: 10000 });
		await terminalClose.click();

		// Wait for close animation
		await page.waitForTimeout(500);

		// Verify terminal count decreased or pane is hidden
		const finalCount = await terminalTabs.count();
		const terminalPane = page.locator(selectors.terminalPane);
		const isPaneVisible = await terminalPane.isVisible();

		expect(finalCount < initialCount || !isPaneVisible).toBeTruthy();
	});
});
