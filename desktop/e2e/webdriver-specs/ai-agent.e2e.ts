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
		window.reprodTest?.setActiveAgent?.(null);
		window.reprodTest?.setActiveMode("external_agent");
	});
	await browser.waitUntil(
		async () =>
			(await browser.execute(() => window.reprodTest?.getActiveMode?.())) === "external_agent" &&
			(await browser.execute(() => window.reprodTest?.getActiveAgent?.())) === null,
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
		await browser.waitUntil(
			async () =>
				browser.execute((selector) => {
					const button = document.querySelector(selector) as HTMLButtonElement | null;
					if (!button || button.disabled) {
						return false;
					}
					button.click();
					return true;
				}, selectors.aiSendButton),
			{ timeout: 10000, timeoutMsg: "Send button not available" },
		);

		const settingsTitle = await browser.$(
			'//div[@role="dialog"]//h2[normalize-space()="Settings"]',
		);
		await settingsTitle.waitForDisplayed({ timeout: 20000 });
		assert.ok(await settingsTitle.isDisplayed());
	});

	it(TEST_CASES["ai-agent"][2], async () => {
		const editorInput = await browser.$(selectors.editor);
		await editorInput.waitForDisplayed({ timeout: 30000 });

		await waitForAiPanel();

		const input = await browser.$(selectors.aiInput);
		await input.waitForDisplayed({ timeout: 10000 });
		assert.equal(await input.getAttribute("placeholder"), "Describe a task...");

		await browser.waitUntil(
			async () =>
				browser.execute(
					(selector, value) => {
						const select = document.querySelector(selector) as HTMLSelectElement | null;
						if (!select) {
							return false;
						}
						select.value = value;
						select.dispatchEvent(new Event("change", { bubbles: true }));
						return select.value === value;
					},
					selectors.aiModeSelect,
					"chat",
				),
			{ timeout: 10000, timeoutMsg: "Mode dropdown not available" },
		);
		await browser.waitUntil(
			async () => (await input.getAttribute("placeholder")) === "Ask a question...",
			{ timeout: 10000, timeoutMsg: "Placeholder did not update for chat mode" },
		);
	});
});
