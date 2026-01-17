import assert from "node:assert";
import { selectors } from "../shared/selectors";
import { TEST_CASES } from "../shared/test-registry";

const waitForAiPanel = async () => {
	const panel = await browser.$(selectors.aiPanel);
	await panel.waitForDisplayed({ timeout: 10000 });
	return panel;
};

const setExternalAgentMode = async () => {
	await browser.execute(() => {
		window.reprodTest?.setActiveMode("external_agent");
	});
	await browser.waitUntil(
		async () =>
			(await browser.execute(() => window.reprodTest?.getActiveMode?.())) === "external_agent",
		{
			timeout: 10000,
			timeoutMsg: "Expected external agent mode to be active",
		},
	);
};

describe("AI agent", () => {
	it(TEST_CASES["ai-agent"][0], async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		await waitForAiPanel();

		const sendButton = await browser.$(selectors.aiSendButton);
		await sendButton.waitForDisplayed({ timeout: 10000 });
		assert.equal(await sendButton.isEnabled(), false);

		const input = await browser.$(selectors.aiInput);
		await input.setValue("Hello AI");
		assert.equal(await sendButton.isEnabled(), true);
	});

	it(TEST_CASES["ai-agent"][1], async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		await waitForAiPanel();
		await setExternalAgentMode();

		const input = await browser.$(selectors.aiInput);
		await input.setValue("Test prompt");
		await browser.keys("Enter");

		const settingsDialog = await browser.$(selectors.settingsDialog);
		await settingsDialog.waitForDisplayed({ timeout: 10000 });
		assert.ok(await settingsDialog.isDisplayed());
	});

	it(TEST_CASES["ai-agent"][2], async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		await waitForAiPanel();

		const input = await browser.$(selectors.aiInput);
		await input.waitForDisplayed({ timeout: 10000 });
		assert.equal(await input.getAttribute("placeholder"), "Describe a task...");

		const modeSelect = await browser.$(selectors.aiModeSelect);
		await modeSelect.selectByAttribute("value", "chat");
		assert.equal(await input.getAttribute("placeholder"), "Ask a question...");
	});
});
