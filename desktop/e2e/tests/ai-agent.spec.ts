import { expect, test } from "@playwright/test";
import { selectors } from "../shared/selectors";
import { TEST_CASES } from "../shared/test-registry";

const waitForAiPanel = async (page: any) => {
	const panel = page.locator(selectors.aiPanel);
	await panel.waitFor({ timeout: 10000 });
	return panel;
};

const setExternalAgentMode = async (page: any) => {
	await page.evaluate(() => {
		window.reprodTest?.setActiveAgent?.(null);
		window.reprodTest?.setActiveMode("external_agent");
	});
	await page.waitForFunction(
		() =>
			window.reprodTest?.getActiveMode?.() === "external_agent" &&
			window.reprodTest?.getActiveAgent?.() === null,
	);
};

test.describe("AI agent", () => {
	test(TEST_CASES["ai-agent"][0], async ({ page }) => {
		await page.goto("/");

		const editor = page.locator(selectors.editor);
		await editor.waitFor({ timeout: 30000 });

		await waitForAiPanel(page);

		const sendButton = page.locator(selectors.aiSendButton);
		await sendButton.waitFor({ timeout: 10000 });
		expect(await sendButton.isEnabled()).toBeFalsy();

		const input = page.locator(selectors.aiInput);
		await input.fill("Hello AI");
		expect(await sendButton.isEnabled()).toBeTruthy();
	});

	test(TEST_CASES["ai-agent"][1], async ({ page }) => {
		await page.goto("/");

		const editor = page.locator(selectors.editor);
		await editor.waitFor({ timeout: 30000 });

		await waitForAiPanel(page);
		await setExternalAgentMode(page);

		const input = page.locator(selectors.aiInput);
		await input.fill("Test prompt");
		await input.press("Enter");

		const settingsDialog = page.getByRole("dialog", { name: "Settings" });
		await settingsDialog.waitFor({ timeout: 10000 });
		expect(await settingsDialog.isVisible()).toBeTruthy();
	});

	test(TEST_CASES["ai-agent"][2], async ({ page }) => {
		await page.goto("/");

		const editor = page.locator(selectors.editor);
		await editor.waitFor({ timeout: 30000 });

		await waitForAiPanel(page);

		const input = page.locator(selectors.aiInput);
		await input.waitFor({ timeout: 10000 });
		expect(await input.getAttribute("placeholder")).toBe("Describe a task...");

		const modeSelect = page.locator(selectors.aiModeSelect);
		await modeSelect.selectOption("chat");
		expect(await input.getAttribute("placeholder")).toBe("Ask a question...");
	});
});
